import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const demo = process.env.WALKER_DEMO === '1';
const directory = process.env.WALKER_DATA || (demo ? 'data/demo' : 'data/live');
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(directory + '/walker.sqlite');
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, teacher INTEGER REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user INTEGER REFERENCES users(id), expires INTEGER
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
`);

function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}

function addUser(name, email, password, teacher = null) {
  return db.prepare('INSERT INTO users(name,email,password,teacher) VALUES (?,?,?,?)')
    .run(name, email, passwordHash(password), teacher).lastInsertRowid;
}

if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  const password = demo ? 'WalkerDemo2026' : process.env.WALKER_TEACHER_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set WALKER_TEACHER_PASSWORD (at least 12 characters) or WALKER_DEMO=1.');
  const email = (demo ? 'teacher@walker.test' : process.env.WALKER_TEACHER_EMAIL || 'teacher@walker.local').toLowerCase();
  const teacher = addUser('Walker Teacher', email, password);
  if (demo) {
    addUser('Madina Karimova', 'student@walker.test', password, teacher);
    addUser('Aziz Rahimov', 'aziz@walker.test', password, teacher);
    addUser('Sevara Aliyeva', 'sevara@walker.test', password, teacher);
    const insert = db.prepare('INSERT INTO assignments(teacher,kind,title,prompt,level,keys) VALUES (?,?,?,?,?,?)');
    insert.run(teacher, 'Reading', 'The future of urban transport', 'The city of Oslo has expanded its cycling network. In the first year, the number of cyclists increased by twenty percent.\n\n1. Which city expanded its cycling network?\n2. Did the number of cyclists increase? (Yes/No)', 'Academic', '["Oslo","Yes"]');
    insert.run(teacher, 'Writing', 'Education and technology', 'Some people believe technology makes learning more effective. To what extent do you agree or disagree? Write at least 250 words.', 'Academic', '[]');
    insert.run(teacher, 'Speaking', 'A place you enjoy visiting', 'Describe a place you enjoy visiting. Say where it is, what you do there, and why you enjoy visiting it.', 'Academic', '[]');
    db.prepare('INSERT INTO submissions(assignment,student,response,raw) VALUES(1,2,?,2)').run('["Oslo","Yes"]');
  }
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
    if (size > 32 * 1024 * 1024) fail(413, 'Fayl juda katta.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { fail(400, 'Ma’lumot formati xato.'); }
}

function file(value, type) {
  if (!value) return null;
  if (typeof value.data !== 'string') fail(400, 'Fayl formati xato.');
  const buffer = Buffer.from(value.data, 'base64');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) fail(400, 'Har bir fayl 10 MB gacha bo‘lishi kerak.');
  if (type === 'pdf' && buffer.subarray(0, 5).toString() !== '%PDF-') fail(400, 'PDF faylni tanlang.');
  if (type === 'audio' && !/^audio\/(mpeg|mp4|wav|x-wav|ogg|webm|aac|flac)$/.test(value.type || '')) fail(400, 'Audio faylni tanlang.');
  return buffer;
}

async function extractPDF(pdf) {
  return new Promise((resolve, reject) => {
    const child = spawn('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { timeout: 8000 });
    const chunks = [];
    let size = 0;
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 400000) child.kill();
      else chunks.push(chunk);
    });
    child.stdin.on('error', () => {});
    child.on('error', reject);
    child.on('close', code => resolve(code === 0 ? Buffer.concat(chunks).toString().trim() : ''));
    child.stdin.end(pdf);
  });
}

const publicFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8']
};
const assignmentColumns = 'id,kind,title,prompt,due,level,keys,(pdf IS NOT NULL) AS hasPdf,(audio IS NOT NULL) AS hasAudio';
const submissionColumns = 'assignment,student,response,raw,band,criteria,feedback,submitted,(audio IS NOT NULL) AS hasAudio';

function cookie(req) {
  return /(?:^|;\s*)walker=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
}

function scopedAssignment(user, id, columns = assignmentColumns) {
  const assignment = db.prepare('SELECT ' + columns + ' FROM assignments WHERE id=? AND teacher=?')
    .get(id, user.teacher ?? user.id);
  if (!assignment) fail(404, 'Vazifa topilmadi.');
  return assignment;
}

function requireTeacher(user) {
  if (user.teacher !== null) fail(403, 'Faqat ustoz uchun.');
}

function send(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const post = req.method === 'POST';
    if (post && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'JSON yuboring.');
    if (req.method === 'GET' && publicFiles[path]) {
      const [name, contentType] = publicFiles[path];
      res.writeHead(200, { 'Content-Type': contentType }).end(readFileSync(new URL('./public/' + name, import.meta.url)));
      return;
    }
    const token = cookie(req);
    if (path === '/api/session' && !post) {
      const user = token && db.prepare('SELECT u.id,u.name,u.teacher FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.expires>?').get(token, Date.now());
      return send(res, { user: user || null, demo });
    }
    const secure = process.env.WALKER_SECURE_COOKIE === '1' ? '; Secure' : '';
    if (path === '/api/login' && post) {
      const { email, password } = await body(req);
      const user = db.prepare('SELECT * FROM users WHERE email=?').get(normalize(email));
      if (typeof password !== 'string' || password.length > 200) fail(400, 'Parol formati xato.');
      const computed = passwordHash(password, user?.password.split(':')[0] || 'invalid-user');
      if (!user || !timingSafeEqual(Buffer.from(computed), Buffer.from(user.password))) fail(401, 'Email yoki parol xato.');
      const next = randomBytes(32).toString('hex');
      if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(next, user.id, Date.now() + 604800000);
      res.setHeader('Set-Cookie', 'walker=' + next + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800' + secure);
      return send(res, { id: user.id, name: user.name, teacher: user.teacher });
    }
    if (path === '/api/logout' && post) {
      if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
      res.setHeader('Set-Cookie', 'walker=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure);
      return send(res, {});
    }
    const user = token && db.prepare('SELECT u.id,u.name,u.teacher FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.expires>?').get(token, Date.now());
    if (!user) fail(401, 'Kirish talab qilinadi.');
    const isTeacher = user.teacher === null;
    if (path === '/api/dashboard' && !post) {
      const assignments = db.prepare('SELECT ' + assignmentColumns + ' FROM assignments WHERE teacher=? ORDER BY id DESC').all(user.teacher ?? user.id)
        .map(({keys, ...row}) => ({ ...row, questions: JSON.parse(keys).length, ...(isTeacher ? { keys: JSON.parse(keys) } : {}) }));
      const students = isTeacher ? db.prepare('SELECT id,name,email FROM users WHERE teacher=? ORDER BY name').all(user.id) : [];
      const submissions = isTeacher
        ? db.prepare('SELECT ' + submissionColumns + ' FROM submissions WHERE assignment IN (SELECT id FROM assignments WHERE teacher=?) ORDER BY submitted DESC').all(user.id)
        : db.prepare('SELECT ' + submissionColumns + ' FROM submissions WHERE student=? ORDER BY submitted DESC').all(user.id);
      return send(res, { assignments, students, submissions });
    }
    if (path === '/api/students' && post) {
      requireTeacher(user);
      const { name, email, password } = await body(req);
      if (typeof name !== 'string' || !name.trim() || name.length > 100 || !/^\S+@\S+\.\S+$/.test(normalize(email)) || typeof password !== 'string' || password.length < 12 || password.length > 200) fail(400, 'Ism, email va kamida 12 belgili parol kiriting.');
      if (db.prepare('SELECT 1 FROM users WHERE email=?').get(normalize(email))) fail(409, 'Bu email band.');
      return send(res, { id: addUser(name.trim(), normalize(email), password, user.id) }, 201);
    }
    if (path === '/api/assignments' && post) {
      requireTeacher(user);
      const form = await body(req);
      const objective = ['Reading', 'Listening'].includes(form.kind);
      const title = String(form.title || '').trim();
      const due = String(form.due || '');
      if (!kinds.includes(form.kind) || !title || title.length > 180 || (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))) fail(400, 'Vazifa ma’lumotlarini tekshiring.');
      const pdf = objective ? file(form.pdf, 'pdf') : null;
      const audio = form.kind === 'Listening' ? file(form.audio, 'audio') : null;
      if (objective && !pdf) fail(400, 'PDF yuklang.');
      if (form.kind === 'Listening' && !audio) fail(400, 'Listening audio faylini yuklang.');
      const keys = objective ? String(form.keys || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [];
      if (objective && (!keys.length || keys.length > 40 || keys.some(line => !line.split('|').some(normalize)))) fail(400, 'Javob kalitiga 1–40 ta javobni alohida qatorlarda yozing.');
      const prompt = objective ? await extractPDF(pdf) : String(form.prompt || '').trim();
      if (!objective && (!prompt || prompt.length > 40000)) fail(400, 'Savol matnini kiriting.');
      const result = db.prepare('INSERT INTO assignments(teacher,kind,title,prompt,due,level,keys,pdf,audio,audio_type) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(user.id, form.kind, title, prompt, due || null, form.level === 'General' ? 'General' : 'Academic', JSON.stringify(keys), pdf, audio, audio ? form.audio.type : null);
      return send(res, { id: result.lastInsertRowid }, 201);
    }
    const attachment = /^\/api\/assignments\/(\d+)\/(pdf|audio)$/.exec(path);
    if (attachment && !post) {
      const column = attachment[2];
      const row = scopedAssignment(user, Number(attachment[1]), column + ',audio_type');
      if (!row[column]) fail(404, 'Fayl topilmadi.');
      return res.writeHead(200, { 'Content-Type': column === 'pdf' ? 'application/pdf' : row.audio_type }).end(row[column]);
    }
    const submit = /^\/api\/assignments\/(\d+)\/submit$/.exec(path);
    if (submit && post) {
      if (isTeacher) fail(403, 'Faqat o‘quvchi topshirishi mumkin.');
      const assignment = scopedAssignment(user, Number(submit[1]));
      const form = await body(req);
      const keys = JSON.parse(assignment.keys);
      let raw = null;
      let band = null;
      let audio = null;
      let response = '';
      if (keys.length) {
        if (!Array.isArray(form.answers) || form.answers.length !== keys.length || form.answers.some(value => typeof value !== 'string' || value.length > 500)) fail(400, 'Javoblar sonini tekshiring.');
        response = JSON.stringify(form.answers);
        raw = keys.filter((key, i) => normalize(form.answers[i]) && key.split('|').some(option => normalize(option) === normalize(form.answers[i]))).length;
        if (keys.length === 40) band = benchmarks[assignment.kind === 'Listening' ? 'Listening' : assignment.level].find(([minimum]) => raw >= minimum)[1];
      } else if (assignment.kind === 'Speaking') {
        audio = file(form.audio, 'audio');
        if (!audio) fail(400, 'Audio javobingizni yuklang.');
      } else {
        response = String(form.response || '').trim();
        if (!response || response.length > 40000) fail(400, 'Writing javobingizni kiriting.');
      }
      const result = db.prepare('INSERT OR IGNORE INTO submissions(assignment,student,response,audio,audio_type,raw,band) VALUES (?,?,?,?,?,?,?)')
        .run(assignment.id, user.id, response, audio, audio ? form.audio.type : null, raw, band);
      if (!result.changes) fail(409, 'Bu vazifa allaqachon topshirilgan.');
      return send(res, { raw, band }, 201);
    }
    const submission = /^\/api\/submissions\/(\d+)\/(\d+)\/(audio|review)$/.exec(path);
    if (submission) {
      const [, assignmentId, studentId, action] = submission;
      const assignment = scopedAssignment(user, Number(assignmentId));
      if (!isTeacher && user.id !== Number(studentId)) fail(403, 'Bu topshiriqqa kirish yo‘q.');
      const row = db.prepare('SELECT * FROM submissions WHERE assignment=? AND student=?').get(assignment.id, Number(studentId));
      if (!row) fail(404, 'Javob topilmadi.');
      if (action === 'audio' && !post && row.audio) return res.writeHead(200, { 'Content-Type': row.audio_type }).end(row.audio);
      if (action === 'review' && post) {
        requireTeacher(user);
        if (!['Writing', 'Speaking'].includes(assignment.kind)) fail(400, 'Bu vazifa avtomatik tekshiriladi.');
        const form = await body(req);
        const validBand = value => typeof value === 'number' && value >= 0 && value <= 9 && Number.isInteger(value * 2);
        const criteria = form.criteria;
        let band = form.band;
        if (assignment.kind === 'Writing') {
          if (!Array.isArray(criteria) || criteria.length !== criteriaKeys.length || !criteria.every(validBand)) fail(400, 'Har bir mezon uchun 0–9 band kiriting.');
          band = Math.round(criteria.reduce((sum, value) => sum + value, 0) / criteriaKeys.length * 2) / 2;
        }
        if (!validBand(band)) fail(400, '0–9 band kiriting.');
        db.prepare('UPDATE submissions SET band=?,criteria=?,feedback=? WHERE assignment=? AND student=?')
          .run(band, assignment.kind === 'Writing' ? JSON.stringify(criteria) : null, String(form.feedback || '').slice(0, 10000), assignment.id, Number(studentId));
        return send(res, { band });
      }
    }
    fail(404, 'Sahifa topilmadi.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) send(res, { error: error.status ? error.message : 'Serverda xatolik yuz berdi.' }, error.status || 500);
  }
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Walker IELTS is ready.'));
