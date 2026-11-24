import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';

const providers = {
  google: {
    issuer: 'https://accounts.google.com',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    keys: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
    scope: 'openid email',
    nonce: true
  },
  telegram: {
    issuer: 'https://oauth.telegram.org',
    authorize: 'https://oauth.telegram.org/auth',
    token: 'https://oauth.telegram.org/token',
    keys: createRemoteJWKSet(new URL('https://oauth.telegram.org/.well-known/jwks.json')),
    scope: 'openid'
  }
};

export const oauthToken = () => randomBytes(32).toString('base64url');
export const oauthDigest = value => createHash('sha256').update(value).digest('base64url');

export function workspacePath(value) {
  return typeof value === 'string' && /^\/(?:dashboard|assignments(?:\/(?:listening|reading|writing|speaking|\d+))?|students(?:\/\d+)?|results(?:\/\d+\/\d+)?)\/?$/.test(value)
    ? value : '/dashboard';
}

export function providerConfig(name) {
  if (!Object.hasOwn(providers, name)) return null;
  const prefix = name.toUpperCase();
  const id = process.env[prefix + '_CLIENT_ID'];
  const secret = process.env[prefix + '_CLIENT_SECRET'];
  if (!id || !secret) return null;
  let origin;
  try {
    origin = new URL(process.env.WALKER_PUBLIC_ORIGIN);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(origin.protocol) || (origin.protocol !== 'https:' && origin.hostname !== 'localhost')) return null;
  return { ...providers[name], name, id, secret, callback: origin.origin + '/api/oauth/' + name + '/callback' };
}

export function authorizationUrl(provider, state, verifier) {
  const url = new URL(provider.authorize);
  url.search = new URLSearchParams({
    client_id: provider.id,
    redirect_uri: provider.callback,
    response_type: 'code',
    scope: provider.scope,
    state,
    code_challenge: oauthDigest(verifier),
    code_challenge_method: 'S256'
  });
  if (provider.nonce) url.searchParams.set('nonce', state);
  return url.href;
}

export async function verifiedIdentity(provider, code, state, verifier) {
  const data = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: provider.callback,
    code_verifier: verifier
  });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (provider.name === 'telegram') {
    headers.Authorization = 'Basic ' + Buffer.from(provider.id + ':' + provider.secret).toString('base64');
    data.set('client_id', provider.id);
  } else {
    data.set('client_id', provider.id);
    data.set('client_secret', provider.secret);
  }
  const response = await fetch(provider.token, { method: 'POST', headers, body: data, signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok) throw new Error('Token exchange failed');
  const { id_token: idToken } = await response.json();
  const { payload } = await jwtVerify(idToken, provider.keys, {
    issuer: provider.issuer,
    audience: provider.id,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'iat', 'exp'],
    maxTokenAge: '10 minutes',
    clockTolerance: 30
  });
  if (typeof payload.sub !== 'string' || !payload.sub || (provider.nonce && payload.nonce !== state)) throw new Error('Invalid identity');
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  // Google is authoritative for Gmail and verified Workspace addresses.
  const trustedEmail = provider.name === 'google' && payload.email_verified === true &&
    (email.endsWith('@gmail.com') || (typeof payload.hd === 'string' && payload.hd && email.split('@')[1] === payload.hd.toLowerCase()));
  return { subject: payload.sub, email: trustedEmail ? email : '' };
}
