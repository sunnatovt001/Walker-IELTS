import http from 'node:http';
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
  CREATE TABLE IF NOT EXISTS invitations (
    email TEXT PRIMARY KEY, name TEXT NOT NULL, teacher INTEGER NOT NULL REFERENCES users(id),
    code_hash TEXT NOT NULL, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY, teacher INTEGER REFERENCES users(id), kind TEXT NOT NULL,
    title TEXT NOT NULL, prompt TEXT NOT NULL, due TEXT, level TEXT NOT NULL,
    keys TEXT NOT NULL, pdf BLOB, audio BLOB, audio_type TEXT
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
  '/walker-logo.png': ['walker-logo.png', 'image/png']
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
    const pageRoute = /^\/(?:login|dashboard|assignments(?:\/(?:listening|reading|writing|speaking|\d+))?|students(?:\/\d+)?|results(?:\/\d+\/\d+)?)\/?$/.test(path);
    const asset = publicFiles[pageRoute ? '/' : path];
    if (req.method === 'GET' && Array.isArray(asset)) {
      const [name, contentType] = asset;
      res.writeHead(200, { 'Content-Type': contentType }).end(readFileSync(new URL('./public/' + name, import.meta.url)));
      return;
    }
    await databaseReady();
    const token = cookie(req);
    if (path === '/api/session' && !post) {
      const user = token && await get('SELECT u.id,u.name,u.teacher FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.expires>?', token, Date.now());
      return send(res, { user: user || null, demo, maxUpload: fileLimit });
    }
    const secure = vercel || process.env.WALKER_SECURE_COOKIE === '1' ? '; Secure' : '';
    if (path === '/api/login' && post) {
      const { email, password } = await body(req);
      const user = await get('SELECT * FROM users WHERE email=?', emailAddress(email));
      if (typeof password !== 'string' || password.length > 200) fail(400, 'Invalid password format.');
      const computed = passwordHash(password, user?.password.split(':')[0] || 'invalid-user');
      if (!user || !timingSafeEqual(Buffer.from(computed), Buffer.from(user.password))) fail(401, 'Incorrect email or password.');
      const next = randomBytes(32).toString('hex');
      if (token) await run('DELETE FROM sessions WHERE token=?', token);
      await run('DELETE FROM sessions WHERE expires<=?', Date.now());
      await run('INSERT INTO sessions VALUES (?,?,?)', next, user.id, Date.now() + 604800000);
      res.setHeader('Set-Cookie', 'walker=' + next + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800' + secure);
      return send(res, { id: user.id, name: user.name, teacher: user.teacher });
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
      res.setHeader('Set-Cookie', 'walker=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure);
      return send(res, {});
    }
    const user = token && await get('SELECT u.id,u.name,u.teacher FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.expires>?', token, Date.now());
    if (!user) fail(401, 'Sign in to continue.');
    const isTeacher = user.teacher === null;
    if (path === '/api/dashboard' && !post) {
      const assignments = (await all('SELECT ' + assignmentColumns + ' FROM assignments WHERE teacher=? ORDER BY id DESC', user.teacher ?? user.id))
        .map(({keys, ...row}) => ({ ...row, questions: JSON.parse(keys).length, ...(isTeacher ? { keys: JSON.parse(keys) } : {}) }));
      const students = isTeacher ? await all('SELECT id,name,email FROM users WHERE teacher=? ORDER BY name', user.id) : [];
      const submissions = isTeacher
        ? await all('SELECT ' + submissionColumns + ' FROM submissions WHERE assignment IN (SELECT id FROM assignments WHERE teacher=?) ORDER BY submitted DESC', user.id)
        : await all('SELECT ' + submissionColumns + ' FROM submissions WHERE student=? ORDER BY submitted DESC', user.id);
      return send(res, { assignments, students, submissions });
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
    if (path === '/api/assignments' && post) {
      requireTeacher(user);
      const form = await body(req);
      const objective = ['Reading', 'Listening'].includes(form.kind);
      const title = String(form.title || '').trim();
      const due = String(form.due || '');
      if (!kinds.includes(form.kind) || !title || title.length > 180 || (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))) fail(400, 'Check the assignment details.');
      const pdf = objective ? file(form.pdf, 'pdf') : null;
      const audio = form.kind === 'Listening' ? file(form.audio, 'audio') : null;
      if (vercel && (pdf?.length || 0) + (audio?.length || 0) > fileLimit) fail(413, 'The PDF and audio together must be at most 3 MB.');
      if (objective && !pdf) fail(400, 'Upload a PDF file.');
      if (form.kind === 'Listening' && !audio) fail(400, 'Upload the listening audio file.');
      const keys = objective ? String(form.keys || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [];
      if (objective && (!keys.length || keys.length > 40 || keys.some(line => !line.split('|').some(normalize)))) fail(400, 'Enter 1–40 answers in the answer key, one per line.');
      const prompt = objective ? await extractPDF(pdf) : String(form.prompt || '').trim();
      if (!objective && (!prompt || prompt.length > 40000)) fail(400, 'Enter the assignment prompt.');
      const result = await run('INSERT INTO assignments(teacher,kind,title,prompt,due,level,keys,pdf,audio,audio_type) VALUES (?,?,?,?,?,?,?,?,?,?)', user.id, form.kind, title, prompt, due || null, form.level === 'General' ? 'General' : 'Academic', JSON.stringify(keys), pdf, audio, audio ? form.audio.type : null);
      return send(res, { id: Number(result.lastInsertRowid) }, 201);
    }
    const attachment = /^\/api\/assignments\/(\d+)\/(pdf|audio)$/.exec(path);
    if (attachment && !post) {
      const column = attachment[2];
      const row = await scopedAssignment(user, Number(attachment[1]), column + ',audio_type');
      if (!row[column]) fail(404, 'File not found.');
      return res.writeHead(200, { 'Content-Type': column === 'pdf' ? 'application/pdf' : row.audio_type }).end(Buffer.from(row[column]));
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
        if (!Array.isArray(form.answers) || form.answers.length !== keys.length || form.answers.some(value => typeof value !== 'string' || value.length > 500)) fail(400, 'Check the number and length of your answers.');
        response = JSON.stringify(form.answers);
        raw = keys.filter((key, i) => normalize(form.answers[i]) && key.split('|').some(option => normalize(option) === normalize(form.answers[i]))).length;
        if (keys.length === 40) band = benchmarks[assignment.kind === 'Listening' ? 'Listening' : assignment.level].find(([minimum]) => raw >= minimum)[1];
      } else if (assignment.kind === 'Speaking') {
        audio = file(form.audio, 'audio');
        if (!audio) fail(400, 'Upload your audio response.');
      } else {
        response = String(form.response || '').trim();
        if (!response || response.length > 40000) fail(400, 'Enter your writing response.');
      }
      const result = await run('INSERT OR IGNORE INTO submissions(assignment,student,response,audio,audio_type,raw,band) VALUES (?,?,?,?,?,?,?)', assignment.id, user.id, response, audio, audio ? form.audio.type : null, raw, band);
      if (!result.rowsAffected) fail(409, 'You have already submitted this assignment.');
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
