import http from 'node:http';
import { gradeAnswers, questionGroups, readCdPrompt, validatedReading } from './reading.js';
import { authorizationUrl, oauthDigest, oauthToken, providerConfig, verifiedIdentity, workspacePath } from './oauth.js';
import { createClient } from '@libsql/client';
import { extractText, getDocumentProxy } from 'unpdf';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';

const vercel = process.env.VERCEL === '1';
const demo = !vercel && process.env.WALKER_DEMO === '1';
const fileLimit = (vercel ? 3 : 10) * 1024 * 1024;
let db;
let initialization;

function openDatabase() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (vercel && (!/^libsql:\/\/|^https:\/\//.test(url || '') || !authToken)) {
    fail(503, 'Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to the Vercel project settings.');
  }
  if (url) return createClient({ url, authToken, intMode: 'number' });
  const directory = process.env.WALKER_DATA || (demo ? 'data/demo' : 'data/live');
  mkdirSync(directory, { recursive: true });
  return createClient({ url: pathToFileURL(resolve(directory, 'walker.sqlite')).href, intMode: 'number' });
}

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, teacher INTEGER REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user INTEGER REFERENCES users(id), expires INTEGER
  );
  CREATE TABLE IF NOT EXISTS demo_students (
    teacher INTEGER PRIMARY KEY REFERENCES users(id),
    student INTEGER NOT NULL UNIQUE REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS admin_account (
    id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL, password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    key TEXT PRIMARY KEY, password_version TEXT NOT NULL, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_attempts (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    key TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT NOT NULL, next TEXT NOT NULL, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_links_pending (
    key TEXT PRIMARY KEY, provider TEXT NOT NULL, subject TEXT NOT NULL, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_identities (
    provider TEXT NOT NULL, subject TEXT NOT NULL, user INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY(provider, subject), UNIQUE(provider, user)
  );
  CREATE TABLE IF NOT EXISTS invitations (
    email TEXT PRIMARY KEY, name TEXT NOT NULL, teacher INTEGER NOT NULL REFERENCES users(id),
    code_hash TEXT NOT NULL, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY, teacher INTEGER REFERENCES users(id), kind TEXT NOT NULL,
    title TEXT NOT NULL, prompt TEXT NOT NULL, due TEXT, level TEXT NOT NULL,
    keys TEXT NOT NULL, pdf BLOB, audio BLOB, audio_type TEXT
  );
  CREATE TABLE IF NOT EXISTS reading_attempts (
    assignment INTEGER NOT NULL REFERENCES assignments(id), student INTEGER NOT NULL REFERENCES users(id),
    deadline INTEGER, remaining INTEGER NOT NULL, answers TEXT NOT NULL,
    PRIMARY KEY(assignment, student)
  );
  CREATE TABLE IF NOT EXISTS submissions (
    assignment INTEGER REFERENCES assignments(id), student INTEGER REFERENCES users(id),
    response TEXT NOT NULL, audio BLOB, audio_type TEXT, raw INTEGER, band REAL,
    criteria TEXT, feedback TEXT, submitted TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(assignment, student)
  );
`;

const run = (sql, ...args) => db.execute({ sql, args });
const all = async (sql, ...args) => (await run(sql, ...args)).rows;
const get = async (sql, ...args) => (await all(sql, ...args))[0];

function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}

const emailAddress = value => String(value ?? '').trim().toLowerCase();
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 200;
const teacherEmail = emailAddress(process.env.WALKER_TEACHER_EMAIL);
const invitationHash = code => createHash('sha256').update(code).digest('hex');
async function initializeDatabase() {
  db ??= openDatabase();
  await db.batch(schema.split(';').map(sql => sql.trim()).filter(Boolean), 'write');
  if (!demo && teacherEmail && !validEmail(teacherEmail)) fail(503, 'Set WALKER_TEACHER_EMAIL to a valid email address.');
  if (!await get('SELECT 1 FROM users LIMIT 1')) {
    const password = demo ? 'WalkerDemo2026' : process.env.WALKER_TEACHER_PASSWORD;
    if (!demo && (!teacherEmail || !validPassword(password))) {
      fail(503, 'Set WALKER_TEACHER_EMAIL and a WALKER_TEACHER_PASSWORD of 12–200 characters.');
    }
    const email = demo ? 'teacher@walker.test' : teacherEmail;
    await run('INSERT OR IGNORE INTO users(name,email,password) VALUES (?,?,?)', 'Walker Teacher', email, passwordHash(password));
    if (demo) {
      const { id: teacher } = await get('SELECT id FROM users WHERE email=?', email);
      const addUser = 'INSERT INTO users(name,email,password,teacher) VALUES (?,?,?,?)';
      const addAssignment = 'INSERT INTO assignments(teacher,kind,title,prompt,level,keys) VALUES (?,?,?,?,?,?)';
      await db.batch([
        { sql: addUser, args: ['Madina Karimova', 'student@walker.test', passwordHash(password), teacher] },
        { sql: addUser, args: ['Aziz Rahimov', 'aziz@walker.test', passwordHash(password), teacher] },
        { sql: addUser, args: ['Sevara Aliyeva', 'sevara@walker.test', passwordHash(password), teacher] },
        { sql: addAssignment, args: [teacher, 'Reading', 'The future of urban transport', 'The city of Oslo has expanded its cycling network. In the first year, the number of cyclists increased by twenty percent.\n\n1. Which city expanded its cycling network?\n2. Did the number of cyclists increase? (Yes/No)', 'Academic', '["Oslo","Yes"]'] },
        { sql: addAssignment, args: [teacher, 'Writing', 'Education and technology', 'Some people believe technology makes learning more effective. To what extent do you agree or disagree? Write at least 250 words.', 'Academic', '[]'] },
        { sql: addAssignment, args: [teacher, 'Speaking', 'A place you enjoy visiting', 'Describe a place you enjoy visiting. Say where it is, what you do there, and why you enjoy visiting it.', 'Academic', '[]'] },
        { sql: 'INSERT INTO submissions(assignment,student,response,raw) VALUES(1,2,?,2)', args: ['["Oslo","Yes"]'] }
      ], 'write');
    }
  }
  if (!demo && teacherEmail) {
    await run("UPDATE users SET email=? WHERE teacher IS NULL AND email='teacher@walker.local'", teacherEmail);
  }
}

function databaseReady() {
  initialization ??= initializeDatabase().catch(error => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

const kinds = ['Listening', 'Reading', 'Writing', 'Speaking'];
const criteriaKeys = ['Task achievement / response', 'Coherence and cohesion', 'Lexical resource', 'Grammatical range and accuracy'];
const benchmarks = {
  Listening: [[39,9],[37,8.5],[35,8],[32,7.5],[30,7],[26,6.5],[23,6],[18,5.5],[16,5],[13,4.5],[10,4],[8,3.5],[6,3],[4,2.5],[3,2],[2,1.5],[1,1],[0,0]],
  Academic: [[39,9],[37,8.5],[35,8],[33,7.5],[30,7],[27,6.5],[23,6],[19,5.5],[15,5],[13,4.5],[10,4],[8,3.5],[6,3],[4,2.5],[3,2],[2,1.5],[1,1],[0,0]],
  General: [[40,9],[39,8.5],[37,8],[36,7.5],[34,7],[32,6.5],[30,6],[27,5.5],[23,5],[19,4.5],[15,4],[12,3.5],[9,3],[6,2.5],[4,2],[3,1.5],[1,1],[0,0]]
};
const normalize = value => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32 * 1024 * 1024) fail(413, 'The upload is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { fail(400, 'Invalid request data.'); }
}

function file(value, type) {
  if (!value) return null;
  if (typeof value.data !== 'string') fail(400, 'Invalid file format.');
  const buffer = Buffer.from(value.data, 'base64');
  if (!buffer.length || buffer.length > fileLimit) fail(413, 'The file must be at most ' + (fileLimit / 1048576) + ' MB.');
  if (type === 'pdf' && buffer.subarray(0, 5).toString() !== '%PDF-') fail(400, 'Select a PDF file.');
  if (type === 'audio' && !/^audio\/(mpeg|mp4|wav|x-wav|ogg|webm|aac|flac)$/.test(value.type || '')) fail(400, 'Select an audio file.');
  return buffer;
}

async function extractPDF(pdf) {
  let document;
  try {
    document = await getDocumentProxy(new Uint8Array(pdf));
    if (document.numPages > 100) return '';
    const { text } = await extractText(document, { mergePages: false });
    return text.join('\n\n').trim().slice(0, 150000);
  } catch {
    return '';
  } finally {
    if (document) await document.loadingTask.destroy();
  }
}

const publicFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/walker-logo.png': ['walker-logo.png', 'image/png'],
  '/landing-desk.webp': ['landing-desk.webp', 'image/webp'],
  '/landing-desk-top.webp': ['landing-desk-top.webp', 'image/webp'],
  '/landing-leather.webp': ['landing-leather.webp', 'image/webp'],
  '/landing-desk-mobile.webp': ['landing-desk-mobile.webp', 'image/webp'],
  '/login-desk.webp': ['login-desk.webp', 'image/webp'],
  '/assignment-paper.webp': ['assignment-paper.webp', 'image/webp'],
  '/notebook-paper.webp': ['notebook-paper.webp', 'image/webp']
};
const assignmentColumns = 'id,kind,title,prompt,due,level,keys,(pdf IS NOT NULL) AS hasPdf,(audio IS NOT NULL) AS hasAudio';
const submissionColumns = 'assignment,student,response,raw,band,criteria,feedback,submitted,(audio IS NOT NULL) AS hasAudio';

function cookie(req) {
  return /(?:^|;\s*)walker=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
}

async function scopedAssignment(user, id, columns = assignmentColumns) {
  const assignment = await get('SELECT ' + columns + ' FROM assignments WHERE id=? AND teacher=?', id, user.teacher ?? user.id);
  if (!assignment) fail(404, 'Assignment not found.');
  return assignment;
}

function requireTeacher(user) {
  if (user.teacher !== null) fail(403, 'Only teachers can perform this action.');
}

function send(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(data));
}

const cookieSecure = vercel || process.env.WALKER_SECURE_COOKIE === '1' ? '; Secure' : '';
const cookieOptions = '; Path=/; HttpOnly; SameSite=Lax' + cookieSecure;
const oauthLifetime = 600;
const sessionAge = 604800;
const publicUser = user => ({ id: user.id, name: user.name, teacher: user.teacher });

function oauthCookie(req, name) {
  return new RegExp('(?:^|;\\s*)' + name + '=([A-Za-z0-9_-]{43})(?:;|$)').exec(req.headers.cookie || '')?.[1];
}

function setCookie(res, name, value, age) {
  const previous = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...previous, name + '=' + value + cookieOptions + '; Max-Age=' + age]);
}

async function createSession(res, user, token) {
  const next = randomBytes(32).toString('hex');
  if (token) await run('DELETE FROM sessions WHERE token=?', token);
  await run('DELETE FROM sessions WHERE expires<=?', Date.now());
  await run('INSERT INTO sessions VALUES (?,?,?)', next, user.id, Date.now() + sessionAge * 1000);
  setCookie(res, 'walker', next, sessionAge);
}

function redirect(res, path) {
  res.writeHead(303, { Location: path }).end();
}

function oauthLoginPath(next, status) {
  return '/login?' + new URLSearchParams({next, oauth: status});
}

async function handleOAuth(req, res, url, providerName, phase, token) {
  const provider = providerConfig(providerName);
  if (!provider) fail(503, 'This sign-in provider is not configured.');
  if (req.method !== 'GET') fail(405, 'Use GET for this endpoint.');
  const now = Date.now();
  if (phase === 'start') {
    const state = oauthToken();
    const verifier = oauthToken();
    await run('DELETE FROM oauth_states WHERE expires<=?', now);
    await run('DELETE FROM oauth_links_pending WHERE expires<=?', now);
    await run('INSERT INTO oauth_states VALUES (?,?,?,?,?)',
      oauthDigest(state), providerName, verifier, workspacePath(url.searchParams.get('next')), now + oauthLifetime * 1000);
    setCookie(res, 'walker_oauth', state, oauthLifetime);
    setCookie(res, 'walker_link', '', 0);
    return redirect(res, authorizationUrl(provider, state, verifier));
  }

  const state = url.searchParams.get('state');
  if (url.searchParams.getAll('state').length !== 1 || !state || state !== oauthCookie(req, 'walker_oauth')) return redirect(res, oauthLoginPath('/dashboard', 'failed'));
  const flow = await get('DELETE FROM oauth_states WHERE key=? AND provider=? AND expires>? RETURNING verifier,next',
    oauthDigest(state), providerName, now);
  setCookie(res, 'walker_oauth', '', 0);
  const code = url.searchParams.get('code');
  if (!flow || !code || url.searchParams.getAll('code').length !== 1) return redirect(res, oauthLoginPath(flow?.next || '/dashboard', 'failed'));

  let identity;
  try {
    identity = await verifiedIdentity(provider, code, state, flow.verifier);
  } catch {
    return redirect(res, oauthLoginPath(flow.next, 'failed'));
  }

  const findLinked = () => get('SELECT u.id FROM oauth_identities i JOIN users u ON u.id=i.user WHERE i.provider=? AND i.subject=?',
    providerName, identity.subject);
  let user = await findLinked();
  if (!user && identity.email) {
    const candidate = await get('SELECT id FROM users WHERE email=?', identity.email);
    if (candidate) {
      await run('INSERT OR IGNORE INTO oauth_identities VALUES (?,?,?)', providerName, identity.subject, candidate.id);
      user = await findLinked();
    }
  }
  if (user) {
    await createSession(res, user, token);
    return redirect(res, flow.next);
  }

  const ticket = oauthToken();
  await run('INSERT INTO oauth_links_pending VALUES (?,?,?,?)',
    oauthDigest(ticket), providerName, identity.subject, Date.now() + oauthLifetime * 1000);
  setCookie(res, 'walker_link', ticket, oauthLifetime);
  return redirect(res, oauthLoginPath(flow.next, 'link'));
}

const adminAge = 8 * 60 * 60;

function passwordMatches(hash, password) {
  if (typeof password !== 'string' || password.length > 200) return false;
  const computed = passwordHash(password, hash?.split(':')[0] || 'invalid-user');
  return Boolean(hash && timingSafeEqual(Buffer.from(computed), Buffer.from(hash)));
}

async function adminSession(res, hash) {
  const token = oauthToken();
  const version = oauthDigest(hash);
  await run('DELETE FROM admin_sessions WHERE expires<=?', Date.now());
  const result = await run('INSERT INTO admin_sessions SELECT ?,?,? FROM admin_account WHERE id=1 AND password=?',
    oauthDigest(token), version, Date.now() + adminAge * 1000, hash);
  if (!result.rowsAffected) fail(409, 'The password changed. Sign in again.');
  setCookie(res, 'walker_admin', token, adminAge);
}

async function saveAssignment(form, owner, existing) {
  const objective = ['Reading', 'Listening'].includes(form.kind);
  const cd = form.kind === 'Reading' && form.cd !== undefined;
  const title = String(form.title || '').trim();
  const due = String(form.due || '');
  const level = form.kind === 'Reading' && form.level === 'General' ? 'General' : 'Academic';
  if (!kinds.includes(form.kind) || !title || title.length > 180 || (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))) fail(400, 'Check the assignment details.');
  const preserveFiles = existing?.kind === form.kind;
  const newPdf = objective && !cd ? file(form.pdf, 'pdf') : null;
  const pdf = objective && !cd ? newPdf || (preserveFiles ? existing.pdf : null) : null;
  const newAudio = form.kind === 'Listening' ? file(form.audio, 'audio') : null;
  const audio = form.kind === 'Listening' ? newAudio || (preserveFiles ? existing.audio : null) : null;
  const audioType = newAudio ? form.audio.type : audio ? existing.audio_type : null;
  if (vercel && (pdf?.byteLength || 0) + (audio?.byteLength || 0) > fileLimit) fail(413, 'The PDF and audio together must be at most 3 MB.');
  // Older demo and imported assignments can contain an inline text passage.
  if (objective && !cd && !pdf && !preserveFiles) fail(400, 'Upload a PDF file.');
  if (form.kind === 'Listening' && !audio) fail(400, 'Upload the listening audio file.');
  const keys = objective ? String(form.keys || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [];
  if (objective && (!keys.length || keys.length > 40 || keys.some(line => !line.split('|').some(normalize)))) fail(400, 'Enter 1–40 answers in the answer key, one per line.');
  const encodedKeys = JSON.stringify(keys);
  const prompt = cd ? validatedReading(form.cd, keys) : objective
    ? (newPdf ? await extractPDF(newPdf) : existing.prompt) : String(form.prompt || '').trim();
  if (!objective && (!prompt || prompt.length > 40000)) fail(400, 'Enter the assignment prompt.');
  const values = [form.kind, title, prompt, due || null, level, encodedKeys, pdf, audio, audioType];
  if (!existing) {
    const result = await run('INSERT INTO assignments(teacher,kind,title,prompt,due,level,keys,pdf,audio,audio_type) VALUES (?,?,?,?,?,?,?,?,?,?)', owner.id, ...values);
    return Number(result.lastInsertRowid);
  }
  const oldSections = readCdPrompt(existing.prompt);
  const sectionGrading = sections => sections && questionGroups(sections).map(group => [group.numbers, group.unordered]);
  const gradingChanged = existing.kind !== form.kind || existing.keys !== encodedKeys || existing.level !== level ||
    JSON.stringify(sectionGrading(oldSections)) !== JSON.stringify(sectionGrading(readCdPrompt(prompt)));
  const result = await run(`UPDATE assignments SET kind=?,title=?,prompt=?,due=?,level=?,keys=?,pdf=?,audio=?,audio_type=?
    WHERE id=? AND teacher=? AND (?=0 OR NOT EXISTS (SELECT 1 FROM submissions WHERE assignment=assignments.id))`,
    ...values, existing.id, owner.id, Number(gradingChanged));
  if (!result.rowsAffected) fail(409, 'The assignment was removed, or its skill, reading type or answer key is locked by submissions.');
  return existing.id;
}

function answerReview(submission, assignment) {
  if (!assignment?.questions) return submission;
  const answers = JSON.parse(submission.response);
  const correct = gradeAnswers(answers, assignment.keys, assignment.cd, normalize);
  const groups = assignment.cd ? questionGroups(assignment.cd) : [{ numbers: answers.map((_, index) => index + 1) }];
  let offset = 0;
  const checks = groups.flatMap(group => {
    const groupedKey = group.unordered
      ? assignment.keys.slice(offset, offset + group.numbers.length).join(', ') + ' (any order)' : '';
    return group.numbers.map(number => {
      const index = offset++;
      return { number, answer: answers[index], correct: correct[index], key: groupedKey || assignment.keys[index] };
    });
  });
  return { ...submission, checks };
}

const readingDuration = 60 * 60 * 1000;

function validateAnswers(answers, count) {
  if (!Array.isArray(answers) || answers.length !== count ||
      answers.some(value => typeof value !== 'string' || value.length > 500)) {
    fail(400, 'Check the number and length of your answers.');
  }
}

async function readingTimer(user, assignment, form) {
  if (user.teacher === null || assignment.kind !== 'Reading' || !readCdPrompt(assignment.prompt)) fail(403, 'This test has no student timer.');
  const id = assignment.id;
  const student = user.id;
  const now = Date.now();
  const count = JSON.parse(assignment.keys).length;
  if (await get('SELECT 1 FROM submissions WHERE assignment=? AND student=?', id, student)) fail(409, 'This assignment is already submitted.');
  if (form.action === 'start') {
    await run('INSERT OR IGNORE INTO reading_attempts VALUES (?,?,?,?,?)', id, student, now + readingDuration, readingDuration,
      JSON.stringify(Array(count).fill('')));
  } else if (form.action === 'resume') {
    await run('UPDATE reading_attempts SET deadline=?+remaining WHERE assignment=? AND student=? AND deadline IS NULL AND remaining>0', now, id, student);
  } else if (form.action === 'save' || form.action === 'pause') {
    validateAnswers(form.answers, count);
    const answers = JSON.stringify(form.answers);
    if (form.action === 'pause') {
      await run('UPDATE reading_attempts SET remaining=deadline-?,deadline=NULL,answers=? WHERE assignment=? AND student=? AND deadline>?',
        now, answers, id, student, now);
    } else {
      await run('UPDATE reading_attempts SET answers=? WHERE assignment=? AND student=? AND deadline>?', answers, id, student, now);
    }
  } else fail(400, 'Unknown timer action.');
  const attempt = await get('SELECT * FROM reading_attempts WHERE assignment=? AND student=?', id, student);
  if (!attempt) fail(409, 'Open the test to start the timer.');
  return { paused: attempt.deadline === null, remaining: Math.max(0, attempt.deadline === null ? attempt.remaining : attempt.deadline - Date.now()),
    answers: JSON.parse(attempt.answers) };
}

async function handleAdmin(req, res, path) {
  const password = process.env.WALKER_ADMIN_PASSWORD;
  let account = await get('SELECT username,password FROM admin_account WHERE id=1');
  if (!account && !validPassword(password)) fail(503, 'Set WALKER_ADMIN_PASSWORD to enable admin sign-in.');
  const token = oauthCookie(req, 'walker_admin');
  const key = token ? oauthDigest(token) : '';
  const admin = account && key && await get('SELECT key FROM admin_sessions WHERE key=? AND password_version=? AND expires>?',
    key, oauthDigest(account.password), Date.now());
  if (path === '/api/admin/session' && req.method === 'GET') return send(res, { signedIn: Boolean(admin), maxUpload: fileLimit });
  if (path === '/api/admin/login' && req.method === 'POST') {
    const form = await body(req);
    const now = Date.now();
    const address = vercel ? req.headers['x-vercel-forwarded-for'] : req.socket.remoteAddress;
    const rateKey = oauthDigest(String(address || 'unknown'));
    const attempt = await get(`INSERT INTO admin_attempts VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,
      expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count`,
      rateKey, now + 15 * 60 * 1000, now, now);
    if (attempt.count > 10) fail(429, 'Too many attempts. Try again in 15 minutes.');
    if (!account) {
      await run('INSERT OR IGNORE INTO admin_account VALUES (1,?,?)',
        process.env.WALKER_ADMIN_USERNAME || 'walkerielts', passwordHash(password));
      account = await get('SELECT username,password FROM admin_account WHERE id=1');
    }
    if (!passwordMatches(account.password, form.password) || form.username !== account.username) fail(401, 'Incorrect username or password.');
    await run('DELETE FROM admin_attempts WHERE key=? OR expires<=?', rateKey, now);
    if (key) await run('DELETE FROM admin_sessions WHERE key=?', key);
    await adminSession(res, account.password);
    return send(res, {});
  }
  if (!admin) fail(401, 'Sign in to the admin panel.');
  if (path === '/api/admin/logout' && req.method === 'POST') {
    await run('DELETE FROM admin_sessions WHERE key=?', key);
    setCookie(res, 'walker_admin', '', 0);
    return send(res, {});
  }
  if (path === '/api/admin/password' && req.method === 'POST') {
    const form = await body(req);
    if (!passwordMatches(account.password, form.current)) fail(400, 'Incorrect current password.');
    if (!validPassword(form.password) || form.password === form.current) fail(400, 'Choose a different password with 12–200 characters.');
    const hash = passwordHash(form.password);
    if (!(await run('UPDATE admin_account SET password=? WHERE id=1 AND password=?', hash, account.password)).rowsAffected) {
      fail(409, 'The password changed. Sign in again.');
    }
    await adminSession(res, hash);
    return send(res, {});
  }

  const owner = teacherEmail
    ? await get('SELECT id FROM users WHERE email=? AND teacher IS NULL', teacherEmail)
    : await get('SELECT id FROM users WHERE teacher IS NULL ORDER BY id LIMIT 1');
  if (!owner) fail(503, 'The teacher workspace is unavailable.');
  if (path === '/api/admin/demo-student' && ['GET', 'POST'].includes(req.method)) {
    const email = 'demo.student@walker.test';
    const existing = await get('SELECT u.email FROM demo_students d JOIN users u ON u.id=d.student WHERE d.teacher=?', owner.id);
    if (req.method === 'GET') return send(res, { email: existing?.email || email, exists: Boolean(existing) });
    if (existing) return send(res, { email: existing.email, exists: true });
    const { password } = await body(req);
    if (!validPassword(password)) fail(400, 'Choose a password with 12–200 characters.');
    const result = await db.batch([
      { sql: 'INSERT OR IGNORE INTO users(name,email,password,teacher) VALUES (?,?,?,?)',
        args: ['Demo Student', email, passwordHash(password), owner.id] },
      { sql: 'INSERT INTO demo_students (teacher,student) SELECT ?,id FROM users WHERE email=? AND changes()=1',
        args: [owner.id, email] }
    ], 'write');
    if (!result[1].rowsAffected) {
      const created = await get('SELECT student FROM demo_students WHERE teacher=?', owner.id);
      if (!created) fail(409, 'The demo email is already in use.');
      return send(res, { email, exists: true });
    }
    return send(res, { email, exists: true }, 201);
  }
  if (path === '/api/admin/assignments') {
    if (req.method === 'GET') {
      const assignments = await all('SELECT ' + assignmentColumns +
        ', (SELECT COUNT(*) FROM submissions WHERE assignment=assignments.id) AS submissionCount FROM assignments WHERE teacher=? ORDER BY id DESC', owner.id);
      return send(res, assignments.map(assignment => {
        const cd = assignment.kind === 'Reading' ? readCdPrompt(assignment.prompt) : null;
        return { ...assignment, prompt: cd ? '' : assignment.prompt, cd, keys: JSON.parse(assignment.keys) };
      }));
    }
    if (req.method === 'POST') return send(res, { id: await saveAssignment(await body(req), owner) }, 201);
  }
  const change = /^\/api\/admin\/assignments\/(\d+)\/(edit|delete)$/.exec(path);
  if (change && req.method === 'POST') {
    const id = Number(change[1]);
    if (change[2] === 'edit') {
      const existing = await get('SELECT * FROM assignments WHERE id=? AND teacher=?', id, owner.id);
      if (!existing) fail(404, 'Assignment not found.');
      return send(res, { id: await saveAssignment(await body(req), owner, existing) });
    }
    const results = await db.batch([
      { sql: 'DELETE FROM submissions WHERE assignment IN (SELECT id FROM assignments WHERE id=? AND teacher=?)', args: [id, owner.id] },
      { sql: 'DELETE FROM reading_attempts WHERE assignment IN (SELECT id FROM assignments WHERE id=? AND teacher=?)', args: [id, owner.id] },
      { sql: 'DELETE FROM assignments WHERE id=? AND teacher=?', args: [id, owner.id] }
    ], 'write');
    if (!results[2].rowsAffected) fail(404, 'Assignment not found.');
    return send(res, {});
  }
  fail(404, 'Page not found.');
}

export async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname === '/api/walker' && url.searchParams.has('route')
      ? '/api/' + url.searchParams.get('route')
      : url.pathname;
    const post = req.method === 'POST';
    if (post && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'Send a JSON request.');
    const pageRoute = /^\/(?:admin|login|dashboard|assignments(?:\/(?:listening|reading|writing|speaking|\d+))?|students(?:\/\d+)?|results(?:\/\d+\/\d+)?)\/?$/.test(path);
    const asset = publicFiles[pageRoute ? '/' : path];
    if (req.method === 'GET' && Array.isArray(asset)) {
      const [name, contentType] = asset;
      res.writeHead(200, { 'Content-Type': contentType }).end(readFileSync(new URL('./public/' + name, import.meta.url)));
      return;
    }
    await databaseReady();
    if (path.startsWith('/api/admin/')) return await handleAdmin(req, res, path);
    const token = cookie(req);
    const oauthRoute = /^\/api\/oauth\/(google|telegram)\/(start|callback)$/.exec(path);
    if (oauthRoute) return await handleOAuth(req, res, url, oauthRoute[1], oauthRoute[2], token);
    if (path === '/api/session' && !post) {
      const user = token && await get('SELECT u.id,u.name,u.teacher FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.expires>?', token, Date.now());
      const ticket = oauthCookie(req, 'walker_link');
      const pending = ticket && await get('SELECT provider FROM oauth_links_pending WHERE key=? AND expires>?', oauthDigest(ticket), Date.now());
      return send(res, { user: user || null, demo, maxUpload: fileLimit,
        providers: ['google', 'telegram'].filter(name => providerConfig(name)), oauthLink: pending?.provider || null });
    }
    if (path === '/api/login' && post) {
      const { email, password, connectProvider } = await body(req);
      const user = await get('SELECT * FROM users WHERE email=?', emailAddress(email));
      if (typeof password !== 'string' || password.length > 200) fail(400, 'Invalid password format.');
      if (!passwordMatches(user?.password, password)) fail(401, 'Incorrect email or password.');
      if (connectProvider) {
        const ticket = oauthCookie(req, 'walker_link');
        if (!ticket) fail(400, 'This connection has expired. Start again with your sign-in provider.');
        const pending = await get('DELETE FROM oauth_links_pending WHERE key=? AND expires>? RETURNING provider,subject', oauthDigest(ticket), Date.now());
        setCookie(res, 'walker_link', '', 0);
        if (!pending) fail(400, 'This connection has expired. Start again with your sign-in provider.');
        const result = await run('INSERT OR IGNORE INTO oauth_identities VALUES (?,?,?)', pending.provider, pending.subject, user.id);
        if (!result.rowsAffected) fail(409, 'This provider or Walker account is already linked. Sign in with your email or try your linked provider.');
      }
      await createSession(res, user, token);
      return send(res, publicUser(user));
    }
    if (path === '/api/register' && post) {
      const { email, code, password } = await body(req);
      const address = emailAddress(email);
      if (!validEmail(address) || typeof code !== 'string' || !/^[A-Za-z0-9_-]{24}$/.test(code.trim()) || !validPassword(password)) {
        fail(400, 'Enter your email, invite code, and a password of 12–200 characters.');
      }
      const hash = invitationHash(code.trim());
      const results = await db.batch([
        { sql: `INSERT OR IGNORE INTO users(name,email,password,teacher)
                SELECT name,email,?,teacher FROM invitations WHERE email=? AND code_hash=? AND expires>?`,
          args: [passwordHash(password), address, hash, Date.now()] },
        { sql: 'DELETE FROM invitations WHERE email=? AND code_hash=? AND changes() > 0', args: [address, hash] }
      ], 'write');
      if (!results[0].rowsAffected) fail(400, 'The invite code is invalid or has expired.');
      return send(res, {}, 201);
    }
    if (path === '/api/logout' && post) {
      if (token) await run('DELETE FROM sessions WHERE token=?', token);
      setCookie(res, 'walker', '', 0);
      setCookie(res, 'walker_link', '', 0);
      return send(res, {});
    }
    const user = token && await get('SELECT u.id,u.name,u.teacher FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.expires>?', token, Date.now());
    if (!user) fail(401, 'Sign in to continue.');
    const isTeacher = user.teacher === null;
    if (path === '/api/dashboard' && !post) {
      const assignments = (await all('SELECT ' + assignmentColumns + ' FROM assignments WHERE teacher=? ORDER BY id DESC', user.teacher ?? user.id))
        .map(({ keys, ...row }) => {
          const cd = row.kind === 'Reading' ? readCdPrompt(row.prompt) : null;
          const keyList = JSON.parse(keys);
          return { ...row, prompt: cd ? '' : row.prompt, cd, questions: keyList.length, keys: keyList };
        });
      const students = isTeacher ? await all('SELECT id,name,email FROM users WHERE teacher=? ORDER BY name', user.id) : [];
      const submissions = isTeacher
        ? await all('SELECT ' + submissionColumns + ' FROM submissions WHERE assignment IN (SELECT id FROM assignments WHERE teacher=?) ORDER BY submitted DESC', user.id)
        : await all('SELECT ' + submissionColumns + ' FROM submissions WHERE student=? ORDER BY submitted DESC', user.id);
      const byAssignment = new Map(assignments.map(assignment => [assignment.id, assignment]));
      const results = submissions.map(submission => answerReview(submission, byAssignment.get(submission.assignment)));
      return send(res, { assignments: isTeacher ? assignments : assignments.map(({ keys, ...assignment }) => assignment), students, submissions: results });
    }
    if (path === '/api/invitations' && post) {
      requireTeacher(user);
      const { name, email } = await body(req);
      const address = emailAddress(email);
      if (typeof name !== 'string' || !name.trim() || name.length > 100 || !validEmail(address)) fail(400, 'Check the name and email address.');
      if (await get('SELECT 1 FROM users WHERE email=?', address)) fail(409, 'An account already exists for this email.');
      const existing = await get('SELECT teacher,expires FROM invitations WHERE email=?', address);
      if (existing && existing.teacher !== user.id && existing.expires > Date.now()) fail(409, 'An invitation already exists for this email.');
      const code = randomBytes(18).toString('base64url');
      const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await run(`
        INSERT INTO invitations(email,name,teacher,code_hash,expires) VALUES (?,?,?,?,?)
        ON CONFLICT(email) DO UPDATE SET name=excluded.name,teacher=excluded.teacher,code_hash=excluded.code_hash,expires=excluded.expires
      `, address, name.trim(), user.id, invitationHash(code), expires);
      return send(res, { email: address, code }, 201);
    }
    if (path === '/api/assignments' && post) fail(403, 'Manage assignments in the admin panel.');
    const attachment = /^\/api\/assignments\/(\d+)\/(pdf|audio)$/.exec(path);
    if (attachment && !post) {
      const column = attachment[2];
      const row = await scopedAssignment(user, Number(attachment[1]), column + ',audio_type');
      if (!row[column]) fail(404, 'File not found.');
      return res.writeHead(200, { 'Content-Type': column === 'pdf' ? 'application/pdf' : row.audio_type }).end(Buffer.from(row[column]));
    }
    const timer = /^\/api\/assignments\/(\d+)\/timer$/.exec(path);
    if (timer && post) {
      const form = await body(req);
      return send(res, await readingTimer(user, await scopedAssignment(user, Number(timer[1])), form));
    }
    const submit = /^\/api\/assignments\/(\d+)\/submit$/.exec(path);
    if (submit && post) {
      if (isTeacher) fail(403, 'Only students can submit assignments.');
      const assignment = await scopedAssignment(user, Number(submit[1]));
      const form = await body(req);
      const keys = JSON.parse(assignment.keys);
      let raw = null;
      let band = null;
      let audio = null;
      let response = '';
      if (keys.length) {
        const cd = readCdPrompt(assignment.prompt);
        let answers = form.answers;
        if (cd) {
          const attempt = await get('SELECT deadline,answers FROM reading_attempts WHERE assignment=? AND student=?', assignment.id, user.id);
          if (!attempt || attempt.deadline === null) fail(409, 'Resume the test before submitting.');
          if (attempt.deadline <= Date.now()) answers = JSON.parse(attempt.answers);
        }
        validateAnswers(answers, keys.length);
        response = JSON.stringify(answers);
        raw = gradeAnswers(answers, keys, cd, normalize).filter(Boolean).length;
        if (keys.length === 40) band = benchmarks[assignment.kind === 'Listening' ? 'Listening' : assignment.level].find(([minimum]) => raw >= minimum)[1];
      } else if (assignment.kind === 'Speaking') {
        audio = file(form.audio, 'audio');
        if (!audio) fail(400, 'Upload your audio response.');
      } else {
        response = String(form.response || '').trim();
        if (!response || response.length > 40000) fail(400, 'Enter your writing response.');
      }
      const result = await run(`INSERT OR IGNORE INTO submissions(assignment,student,response,audio,audio_type,raw,band)
        SELECT id,?,?,?,?,?,? FROM assignments WHERE id=? AND kind=? AND level=? AND keys=? AND prompt=?`,
        user.id, response, audio, audio ? form.audio.type : null, raw, band, assignment.id, assignment.kind, assignment.level, assignment.keys, assignment.prompt);
      if (!result.rowsAffected) fail(409, 'You already submitted this assignment, or it changed. Refresh and try again.');
      return send(res, { raw, band }, 201);
    }
    const submission = /^\/api\/submissions\/(\d+)\/(\d+)\/(audio|review)$/.exec(path);
    if (submission) {
      const [, assignmentId, studentId, action] = submission;
      const assignment = await scopedAssignment(user, Number(assignmentId));
      if (!isTeacher && user.id !== Number(studentId)) fail(403, 'You do not have access to this submission.');
      const row = await get('SELECT * FROM submissions WHERE assignment=? AND student=?', assignment.id, Number(studentId));
      if (!row) fail(404, 'Submission not found.');
      if (action === 'audio' && !post && row.audio) return res.writeHead(200, { 'Content-Type': row.audio_type }).end(Buffer.from(row.audio));
      if (action === 'review' && post) {
        requireTeacher(user);
        if (!['Writing', 'Speaking'].includes(assignment.kind)) fail(400, 'This assignment is graded automatically.');
        const form = await body(req);
        const validBand = value => typeof value === 'number' && value >= 0 && value <= 9 && Number.isInteger(value * 2);
        const criteria = form.criteria;
        let band = form.band;
        if (assignment.kind === 'Writing') {
          if (!Array.isArray(criteria) || criteria.length !== criteriaKeys.length || !criteria.every(validBand)) fail(400, 'Enter a band score from 0 to 9 for each criterion.');
          band = Math.round(criteria.reduce((sum, value) => sum + value, 0) / criteriaKeys.length * 2) / 2;
        }
        if (!validBand(band)) fail(400, 'Enter a band score from 0 to 9.');
        await run('UPDATE submissions SET band=?,criteria=?,feedback=? WHERE assignment=? AND student=?', band, assignment.kind === 'Writing' ? JSON.stringify(criteria) : null, String(form.feedback || '').slice(0, 10000), assignment.id, Number(studentId));
        return send(res, { band });
      }
    }
    fail(404, 'Page not found.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) send(res, { error: error.status ? error.message : 'An unexpected server error occurred.' }, error.status || 500);
  }
}

if (!vercel && process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  http.createServer(handler).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Walker IELTS is ready.'));
}
