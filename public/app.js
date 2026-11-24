const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const kinds = ['Listening', 'Reading', 'Writing', 'Speaking'];
const criteria = ['Task achievement / response', 'Coherence and cohesion', 'Lexical resource', 'Grammatical range and accuracy'];
const paths = {
  logo: '<path d="m3 6 4 13 5-9 5 9 4-13"/>',
  home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  tasks: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6m-6 4h6m-6 4h4"/>',
  students: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2m2-14a3 3 0 0 1 0 6m1 2a4 4 0 0 1 3 4v2"/>',
  results: '<path d="M4 4v16h16M8 16v-3m5 3V9m5 7V6"/>',
  listening: '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="5" height="8" rx="2"/><rect x="16" y="12" width="5" height="8" rx="2"/>',
  reading: '<path d="M12 6a9 9 0 0 0-9-2v15a9 9 0 0 1 9 2 9 9 0 0 1 9-2V4a9 9 0 0 0-9 2Zm0 0v15"/>',
  writing: '<path d="m3 21 4-1 13-13-3-3L4 17l-1 4Zm11-14 3 3"/>',
  speaking: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-3 0h6"/>',
  logout: '<path d="M10 4H4v16h6m4-4 4-4-4-4m-6 4h10"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
};
const icon = (name, size = 19) => '<svg aria-hidden="true" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const brand = '<div class="brand"><div class="logo">' + icon('logo', 24) + '</div><span>Walker<span>IELTS</span></span></div>';
const labels = { home: 'Bosh sahifa', tasks: 'Vazifalar', students: 'O‘quvchilar', results: 'Natijalar' };
let user;
let demo;
let page = 'home';
let filter = '';
let dashboard;

async function api(path, values) {
  const options = values === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) };
  const response = await fetch('/api/' + path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

async function refresh() {
  dashboard = await api('dashboard');
  render();
}

function showError(error, target = app) {
  const alert = target.querySelector('[role=alert]');
  if (alert) alert.textContent = error.message;
}

function bindForm(container, handler) {
  const form = container.querySelector('form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    container.querySelector('[role=alert]').textContent = '';
    try {
      await handler(new FormData(form));
    } catch (error) {
      showError(error, container);
    } finally {
      button.disabled = false;
    }
  });
}

const errorLine = '<p class="error" role="alert"></p>';
const teacher = () => user.teacher === null;
const empty = text => '<p class="empty">' + esc(text) + '</p>';
const tile = (key, color = key) => '<div class="tile-icon ' + color + '">' + icon(key) + '</div>';
const action = (name, text, style = 'light', glyph = '') => '<button type="button" class="btn ' + style + '" data-action="' + name + '">' + (glyph ? icon(glyph, 16) : '') + text + '</button>';
const initials = name => esc(name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase());

function login(email = '', message = '') {
  app.innerHTML = '<main class="login"><section class="login-aside">' + brand +
    '<div><h1>IELTS darslari<br>bir joyda.</h1><p>Topshiriqlar, javoblar va natijalar.</p></div></section>' +
    '<section class="login-main"><div class="login-box"><h2>Kabinetga kirish</h2><form>' +
    (message ? '<p class="help notice" role="status">' + esc(message) + '</p>' : '') +
    '<label>Email<input required type="email" name="email" autocomplete="username" value="' + esc(email) + '"></label>' +
    '<label>Parol<input required type="password" name="password" autocomplete="current-password"></label>' +
    errorLine + '<button type="submit" class="btn">Kirish ' + icon('arrow', 16) + '</button></form>' +
    '<div>' + action('register', 'Taklif kodi bilan hisob ochish') + '</div>' +
    (demo ? '<div class="demo-buttons">' + action('demo-teacher', 'Ustoz demo') + action('demo-student', 'O‘quvchi demo') + '</div>' : '') +
    '</div></section></main>';
  bindForm(app, values => signIn(Object.fromEntries(values)));
  app.querySelectorAll('[data-action^=demo-]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try {
      const email = button.dataset.action === 'demo-teacher' ? 'teacher@walker.test' : 'student@walker.test';
      await signIn({ email, password: 'WalkerDemo2026' });
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  });
}

function register() {
  openModal('O‘quvchi hisobini ochish', '<form><label>Email<input name="email" required type="email" autocomplete="username"></label>' +
    '<label>Taklif kodi<input name="code" required autocomplete="off" spellcheck="false"></label>' +
    '<label>Yangi parol<input name="password" type="password" required minlength="12" maxlength="200" autocomplete="new-password"></label>' +
    submitButton('Hisob ochish') + '</form>');
  const emailInput = app.querySelector('[name=email]');
  if (emailInput) modal.querySelector('[name=email]').value = emailInput.value;
  bindForm(modal, async values => {
    await api('register', Object.fromEntries(values));
    modal.close();
    login(values.get('email'), 'Hisob ochildi. O‘zingiz yaratgan parol bilan kiring.');
  });
}

async function signIn(values) {
  user = await api('login', values);
  page = 'home';
  filter = '';
  await refresh();
}

const stat = (name, value, key, color) =>
  '<div class="stat">' + tile(key, color) + '<div><small>' + name + '</small><strong>' + value + '</strong></div></div>';

function score(result, assignment) {
  if (result.band !== null) return (assignment.questions ? 'Taxminiy ' : '') + result.band.toFixed(1) + ' band';
  if (result.raw !== null) return result.raw + ' / ' + assignment.questions;
  return 'Tekshiruvda';
}

function assignmentRow(a) {
  const result = dashboard.submissions.find(item => item.assignment === a.id);
  const status = teacher() ? '' : result ? score(result, a) : 'Topshirilmagan';
  const date = a.due ? ' · ' + a.due : '';
  return '<div class="row">' + tile(a.kind.toLowerCase()) + '<div class="grow"><strong>' + esc(a.title) + '</strong><small>' + a.kind + date +
    '</small></div>' + (status ? '<span class="pill ' + (!result || status === 'Tekshiruvda' ? 'pending' : '') + '">' + status + '</span>' : '') +
    action('assignment:' + a.id, 'Ochish', 'light', 'next') + '</div>';
}

function resultRow(row) {
  const assignment = dashboard.assignments.find(a => a.id === row.assignment);
  const student = dashboard.students.find(s => s.id === row.student);
  if (!assignment) return '';
  const status = score(row, assignment);
  return '<div class="row">' + tile(assignment.kind.toLowerCase()) + '<div class="grow"><strong>' + esc(assignment.title) +
    '</strong><small>' + esc(student?.name || assignment.kind) + ' · ' + esc(row.submitted.slice(0, 10)) + '</small></div><span class="pill ' +
    (status === 'Tekshiruvda' ? 'pending' : '') + '">' + status + '</span>' +
    action('result:' + row.assignment + ':' + row.student, 'Ochish', 'light', 'next') + '</div>';
}

function home() {
  const counts = {
    pending: dashboard.submissions.filter(s => s.raw === null && s.band === null).length,
    done: dashboard.submissions.length
  };
  return '<section class="hero"><div class="hero-art" aria-hidden="true">IELTS</div><div class="eyebrow"><span class="dot"></span>' +
    (teacher() ? 'Ustoz kabineti' : 'O‘quvchi kabineti') + '</div><h1>Salom, ' + esc(user.name) +
    '!</h1><p>' + (teacher() ? 'Vazifalarni bering, javoblarni tekshiring va o‘quvchilaringiz natijalarini kuzating.' : 'IELTS vazifalaringizni bajaring va natijalaringizni kuzating.') +
    '</p>' + (teacher() ? action('create', 'Yangi vazifa', 'lime', 'plus') : action('page:tasks', 'Vazifalarni ko‘rish', 'lime', 'arrow')) + '</section>' +
    '<section class="stats" aria-label="Ko‘rsatkichlar">' + stat('Jami vazifalar', dashboard.assignments.length, 'tasks', 'sage') +
    (teacher() ? stat('O‘quvchilar', dashboard.students.length, 'students', 'lilac') : stat('Topshirilgan', counts.done, 'check', 'lilac')) +
    stat('Tekshiruvda', counts.pending, 'clock', 'sand') + '</section>' +
    '<div class="headline"><h2>IELTS bo‘limlari</h2></div><section class="tiles">' + kinds.map(kind =>
      '<button class="skill" data-action="filter:' + kind + '"><span class="skill-title">' + tile(kind.toLowerCase()) + icon('arrow', 16) +
      '</span><strong>' + kind + '</strong><small>' + dashboard.assignments.filter(a => a.kind === kind).length + ' ta vazifa</small></button>').join('') +
    '</section><div class="headline"><h2>So‘nggi vazifalar</h2>' + action('page:tasks', 'Barchasi', 'light', 'arrow') + '</div><section class="panel">' +
    (dashboard.assignments.slice(0, 4).map(assignmentRow).join('') || empty('Hozircha vazifalar yo‘q.')) + '</section>';
}

function tasks() {
  const rows = dashboard.assignments.filter(a => !filter || a.kind === filter);
  return '<div class="headline"><div><h1>Vazifalar</h1><p class="subhead">Barcha IELTS topshiriqlari</p></div>' +
    (teacher() ? action('create', 'Yangi vazifa', '', 'plus') : '') + '</div><div class="filters" aria-label="Bo‘limlar">' +
    ['', ...kinds].map(kind => '<button type="button" data-action="filter:' + kind + '" aria-pressed="' + (kind === filter) +
      '" class="' + (kind === filter ? 'active' : '') + '">' + (kind || 'Barchasi') + '</button>').join('') +
    '</div><section class="panel">' + (rows.map(assignmentRow).join('') || empty('Bu bo‘limda vazifa yo‘q.')) + '</section>';
}

function students() {
  const list = dashboard.students.map(s => {
    const submissions = dashboard.submissions.filter(row => row.student === s.id);
    return '<div class="row"><div class="avatar">' + initials(s.name) + '</div><div class="grow"><strong>' + esc(s.name) + '</strong><small>' +
      esc(s.email) + '</small></div><span class="pill">' + submissions.length + ' / ' + dashboard.assignments.length + ' topshirilgan</span>' +
      action('student:' + s.id, 'Progress', 'light', 'next') + '</div>';
  }).join('');
  return '<div class="headline"><div><h1>O‘quvchilar</h1><p class="subhead">Hisoblar va o‘zlashtirish</p></div>' +
    action('add-student', 'O‘quvchini taklif qilish', '', 'plus') + '</div><section class="panel">' + (list || empty('O‘quvchi hisoblari hali yaratilmagan.')) + '</section>';
}

function results() {
  return '<div class="headline"><div><h1>Natijalar</h1><p class="subhead">Topshirilgan vazifalar, bandlar va fikr-mulohazalar</p></div></div><section class="panel">' +
    (dashboard.submissions.map(resultRow).join('') || empty('Hozircha topshirilgan vazifa yo‘q.')) + '</section>';
}

function render() {
  const role = teacher() ? 'Ustoz' : 'O‘quvchi';
  const navigation = ['home', 'tasks', ...(teacher() ? ['students'] : []), 'results'];
  const view = { home, tasks, students, results }[page];
  app.innerHTML = '<div class="shell"><aside class="sidebar">' + brand + '<div class="label">ISH MAYDONI</div><nav class="nav" aria-label="Kabinet">' +
    navigation.map(item => '<button data-action="page:' + item + '" class="' + (item === page ? 'active' : '') + '"' +
      (item === page ? ' aria-current="page"' : '') + '>' + icon(item) + labels[item] + '</button>').join('') +
    '</nav><div class="sidebar-bottom"><div class="profile"><div class="avatar">' + initials(user.name) + '</div><div><strong>' + esc(user.name) +
    '</strong><small>' + role + '</small></div><button class="logout" aria-label="Chiqish" title="Chiqish" data-action="logout">' + icon('logout') +
    '</button></div></div></aside><div><header class="top"><div class="crumb">Kabinet ' + icon('next', 13) + '<strong>' + labels[page] +
    '</strong></div><span class="top-role">' + role + ' kabineti</span></header><main class="content">' + view() + errorLine + '</main></div></div>';
}

function openModal(title, contents) {
  modal.innerHTML = '<div class="modal-inner"><div class="headline"><h2 id="modal-title">' + esc(title) +
    '</h2><button type="button" class="modal-close" data-action="close" aria-label="Yopish">' + icon('close', 18) + '</button></div>' + contents + '</div>';
  modal.setAttribute('aria-labelledby', 'modal-title');
  if (!modal.open) modal.showModal();
}

function upload(file) {
  if (!file?.size) return Promise.resolve(null);
  if (file.size > 10 * 1024 * 1024) throw new Error('Har bir fayl 10 MB gacha bo‘lishi kerak.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ data: reader.result.split(',')[1], type: file.type });
    reader.onerror = () => reject(new Error('Faylni o‘qib bo‘lmadi.'));
    reader.readAsDataURL(file);
  });
}

const submitButton = label => errorLine + '<button type="submit" class="btn">' + label + '</button>';

function create() {
  openModal('Yangi vazifa', '<form><label>Bo‘lim<select name="kind">' + kinds.map(kind => '<option>' + kind + '</option>').join('') +
    '</select></label><label>Sarlavha<input name="title" required maxlength="180"></label><label>Topshirish sanasi<input type="date" name="due"></label><div id="kind-fields"></div>' +
    submitButton('E’lon qilish') + '</form>');
  const selector = modal.querySelector('[name=kind]');
  const fields = modal.querySelector('#kind-fields');
  function renderFields() {
    const kind = selector.value;
    fields.innerHTML = ['Listening', 'Reading'].includes(kind)
      ? '<label>Topshiriq PDF fayli<input name="pdf" type="file" accept=".pdf,application/pdf" required></label>' +
        (kind === 'Listening' ? '<label>Listening audio<input name="audio" type="file" accept="audio/*" required></label>' :
          '<label>Reading turi<select name="level"><option value="Academic">Academic</option><option value="General">General Training</option></select></label>') +
        '<label>Javob kaliti<textarea name="keys" required placeholder="Har qatorda bitta javob"></textarea></label>' +
        '<p class="help">Bir javobning muqobil variantlarini | bilan ajrating. 40 savol uchun taxminiy IELTS bandi chiqadi.</p>'
      : '<label>Savol va ko‘rsatmalar<textarea name="prompt" required maxlength="40000"></textarea></label>';
  }
  selector.onchange = renderFields;
  renderFields();
  bindForm(modal, async values => {
    const form = Object.fromEntries(values);
    form.pdf = await upload(form.pdf);
    form.audio = await upload(form.audio);
    await api('assignments', form);
    page = 'tasks';
    filter = '';
    await refresh();
    modal.close();
  });
}

function addStudent() {
  openModal('O‘quvchini taklif qilish', '<form><label>Ism va familiya<input name="name" required maxlength="100"></label>' +
    '<label>O‘quvchining emaili<input name="email" type="email" required autocomplete="off"></label>' +
    submitButton('Taklif kodi yaratish') + '</form>');
  bindForm(modal, async values => {
    const { email, code } = await api('invitations', Object.fromEntries(values));
    openModal('Taklif kodi tayyor', '<p class="help">Kodni ' + esc(email) +
      ' egasiga shaxsan bering. Kod 7 kun amal qiladi va bir marta ishlatiladi.</p>' +
      '<label class="invite-code">Taklif kodi<input readonly value="' + esc(code) + '"></label>');
    const input = modal.querySelector('input');
    input.focus();
    input.select();
  });
}

function viewAssignment(a) {
  const result = dashboard.submissions.find(row => row.assignment === a.id);
  const media = (a.hasPdf ? '<a href="/api/assignments/' + a.id + '/pdf" target="_blank" rel="noopener">PDF faylni ochish ↗</a>' : '') +
    (a.hasAudio ? '<audio controls preload="none" src="/api/assignments/' + a.id + '/audio"></audio>' : '');
  const questions = Array.from({ length: a.questions }, (_, i) => '<label>' + (i + 1) + '. Javob<input name="a' + i + '" maxlength="500"></label>').join('');
  const response = a.questions ? '<div class="answer-grid">' + questions + '</div>'
    : a.kind === 'Speaking' ? '<label>Audio javob<input name="audio" type="file" accept="audio/*" required></label>'
    : '<label>Writing javobi<textarea name="response" required maxlength="40000"></textarea></label>';
  openModal(a.title, '<span class="pill">' + a.kind + (a.due ? ' · ' + esc(a.due) : '') + '</span>' +
    (a.prompt ? '<div class="prompt">' + esc(a.prompt) + '</div>' : '') + (media ? '<div class="media">' + media + '</div>' : '') +
    (teacher() ? (a.questions ? '<div class="notice"><strong>Javob kaliti</strong><ol>' + a.keys.map(key => '<li>' + esc(key) + '</li>').join('') + '</ol></div>' : '') :
      result ? '<div class="notice">' + esc(score(result, a)) + '</div>' + action('result:' + a.id + ':' + user.id, 'Natijani ko‘rish') :
        '<form>' + response + submitButton('Vazifani topshirish') + '</form>'));
  if (!teacher() && !result) bindForm(modal, async values => {
    const form = a.questions ? { answers: Array.from({ length: a.questions }, (_, i) => values.get('a' + i)) }
      : a.kind === 'Speaking' ? { audio: await upload(values.get('audio')) } : { response: values.get('response') };
    await api('assignments/' + a.id + '/submit', form);
    await refresh();
    viewAssignment(a);
  });
}

function viewResult(assignmentId, studentId) {
  const a = dashboard.assignments.find(item => item.id === assignmentId);
  const row = dashboard.submissions.find(item => item.assignment === assignmentId && item.student === studentId);
  const student = dashboard.students.find(item => item.id === studentId);
  if (!a || !row) return;
  const route = 'submissions/' + assignmentId + '/' + studentId;
  const breakdown = row.criteria ? JSON.parse(row.criteria) : [];
  const answer = a.questions ? '<ol>' + JSON.parse(row.response).map(value => '<li>' + esc(value || '—') + '</li>').join('') + '</ol>'
    : row.hasAudio ? '<div class="media"><audio controls preload="none" src="/api/' + route + '/audio"></audio></div>'
    : '<div class="prompt">' + esc(row.response) + '</div>';
  const input = (label, name, value) => '<label>' + label + '<input type="number" min="0" max="9" step="0.5" required name="' + name + '" value="' + esc(value) + '"></label>';
  const review = a.questions ? '' : teacher() ? '<form>' +
    (a.kind === 'Writing' ? criteria.map((label, i) => input(label, 'c' + i, breakdown[i])).join('') : input('Speaking band', 'band', row.band)) +
    '<label>Izoh<textarea name="feedback" maxlength="10000">' + esc(row.feedback) + '</textarea></label>' + submitButton('Bahoni saqlash') + '</form>' :
    (breakdown.length ? '<ul>' + criteria.map((label, i) => '<li>' + label + ' · ' + breakdown[i] + '</li>').join('') + '</ul>' : '') +
    (row.feedback ? '<div class="prompt">' + esc(row.feedback) + '</div>' : '');
  openModal(a.title, '<p class="subhead">' + esc(student?.name || a.kind) + '</p><div class="notice">' + esc(score(row, a)) + '</div>' + answer + review);
  if (teacher() && !a.questions) bindForm(modal, async values => {
    const payload = { feedback: values.get('feedback') };
    if (a.kind === 'Writing') payload.criteria = criteria.map((_, i) => Number(values.get('c' + i)));
    else payload.band = Number(values.get('band'));
    await api(route + '/review', payload);
    await refresh();
    viewResult(assignmentId, studentId);
  });
}

function studentProgress(id) {
  const student = dashboard.students.find(item => item.id === id);
  if (!student) return;
  const rows = dashboard.submissions.filter(item => item.student === id);
  const sections = kinds.map(kind => {
    const assignments = dashboard.assignments.filter(a => a.kind === kind);
    const submitted = rows.filter(row => assignments.some(a => a.id === row.assignment));
    return '<div class="row">' + tile(kind.toLowerCase()) + '<div class="grow"><strong>' + kind + '</strong></div><span class="pill">' + submitted.length + ' / ' + assignments.length + '</span></div>';
  }).join('');
  openModal(student.name, '<div class="panel">' + sections + '</div><div class="headline notice"><h2>Natijalar</h2></div><div class="panel">' +
    (rows.map(resultRow).join('') || empty('Topshirilgan vazifa yo‘q.')) + '</div>');
}

async function handleAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button || button.dataset.action.startsWith('demo-')) return;
  const [key, value, second] = button.dataset.action.split(':');
  try {
    if (key === 'logout') {
      await api('logout', {});
      user = null;
      login();
    }
    if (key === 'close') modal.close();
    if (key === 'page' || key === 'filter') {
      page = key === 'page' ? value : 'tasks';
      filter = key === 'filter' ? value : '';
      render();
    }
    if (key === 'register') register();
    if (key === 'create') create();
    if (key === 'add-student') addStudent();
    if (key === 'assignment') viewAssignment(dashboard.assignments.find(a => a.id === Number(value)));
    if (key === 'result') viewResult(Number(value), Number(second));
    if (key === 'student') studentProgress(Number(value));
  } catch (error) {
    showError(error, modal.open ? modal : app);
  }
}

document.addEventListener('click', handleAction);
try {
  ({ user, demo } = await api('session'));
  if (user) await refresh();
  else login();
} catch (error) {
  app.innerHTML = '<main class="content"><p class="error" role="alert"></p></main>';
  showError(error);
}
