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
const labels = { home: 'Dashboard', tasks: 'Assignments', students: 'Students', results: 'Results' };
let user;
let demo;
const pathsByPage = { home: '/', tasks: '/assignments', students: '/students', results: '/results' };
const skillPath = kind => pathsByPage.tasks + (kind ? '/' + kind.toLowerCase() : '');

function readRoute(path = location.pathname) {
  const normalized = path.replace(/\/$/, '') || '/';
  if (normalized === '/login') return { page: 'login' };
  for (const [page, url] of Object.entries(pathsByPage)) {
    if (url === normalized) return { page };
  }
  const skill = kinds.find(kind => skillPath(kind) === normalized);
  if (skill) return { page: 'tasks', skill };
  const assignment = /^\/assignments\/(\d+)$/.exec(normalized);
  if (assignment) return { page: 'tasks', assignment: Number(assignment[1]) };
  const student = /^\/students\/(\d+)$/.exec(normalized);
  if (student) return { page: 'students', student: Number(student[1]) };
  const result = /^\/results\/(\d+)\/(\d+)$/.exec(normalized);
  if (result) return { page: 'results', result: [Number(result[1]), Number(result[2])] };
  return { page: 'not-found' };
}

function navigate(path, { replace = false, detail = false } = {}) {
  if (location.pathname + location.search !== path) {
    history[replace ? 'replaceState' : 'pushState']({ detail }, '', path);
  }
  showRoute();
}

function showRoute() {
  const route = readRoute();
  if (modal.open) modal.close();
  if (!user) {
    if (route.page !== 'login') {
      const next = route.page === 'not-found' ? '/' : location.pathname;
      history.replaceState(null, '', '/login' + (next === '/' ? '' : '?next=' + encodeURIComponent(next)));
    }
    login();
    return;
  }
  if (route.page === 'login') {
    const next = new URLSearchParams(location.search).get('next');
    const validNext = next?.startsWith('/') && !next.startsWith('//') && !['login', 'not-found'].includes(readRoute(next).page);
    navigate(validNext ? next : '/', { replace: true });
    return;
  }
  if (!dashboard) return;
  render(route);
}
let dashboard;
let maxUpload = 10 * 1024 * 1024;

async function api(path, values) {
  const options = values === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) };
  const response = await fetch('/api/' + path, options);
  if (response.status === 413) throw new Error('The files exceed the upload size limit.');
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || 'Unable to connect to the server.');
  return data;
}

async function refresh() {
  dashboard = await api('dashboard');
  showRoute();
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
const link = (path, text, style = 'light', glyph = '') =>
  '<a class="btn ' + style + '" href="' + path + '" data-route>' + (glyph ? icon(glyph, 16) : '') + text + '</a>';
const initials = name => esc(name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase());

function login(email = '', message = '') {
  document.title = 'Sign in | Walker IELTS';
  app.innerHTML = '<main class="login"><section class="login-aside">' + brand +
    '<div><h1>IELTS practice<br>in one place.</h1><p>Assignments, submissions, and results.</p></div></section>' +
    '<section class="login-main"><div class="login-box"><h2>Sign in</h2><form>' +
    (message ? '<p class="help notice" role="status">' + esc(message) + '</p>' : '') +
    '<label>Email<input required type="email" name="email" autocomplete="username" value="' + esc(email) + '"></label>' +
    '<label>Password<input required type="password" name="password" autocomplete="current-password"></label>' +
    errorLine + '<button type="submit" class="btn">Sign in ' + icon('arrow', 16) + '</button></form>' +
    '<div>' + action('register', 'Create an account with an invite code') + '</div>' +
    (demo ? '<div class="demo-buttons">' + action('demo-teacher', 'Teacher demo') + action('demo-student', 'Student demo') + '</div>' : '') +
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
  openModal('Create a student account', '<form><label>Email<input name="email" required type="email" autocomplete="username"></label>' +
    '<label>Invite code<input name="code" required autocomplete="off" spellcheck="false"></label>' +
    '<label>New password<input name="password" type="password" required minlength="12" maxlength="200" autocomplete="new-password"></label>' +
    submitButton('Create account') + '</form>');
  const emailInput = app.querySelector('[name=email]');
  if (emailInput) modal.querySelector('[name=email]').value = emailInput.value;
  bindForm(modal, async values => {
    await api('register', Object.fromEntries(values));
    modal.close();
    login(values.get('email'), 'Account created. Sign in with your new password.');
  });
}

async function signIn(values) {
  user = await api('login', values);
  await refresh();
}

const stat = (name, value, key, color) =>
  '<div class="stat">' + tile(key, color) + '<div><small>' + name + '</small><strong>' + value + '</strong></div></div>';

function score(result, assignment) {
  if (result.band !== null) return (assignment.questions ? 'Estimated ' : '') + result.band.toFixed(1) + ' band';
  if (result.raw !== null) return result.raw + ' / ' + assignment.questions;
  return 'Pending review';
}

function assignmentRow(a) {
  const result = dashboard.submissions.find(item => item.assignment === a.id);
  const status = teacher() ? '' : result ? score(result, a) : 'Not submitted';
  const date = a.due ? ' · ' + a.due : '';
  return '<div class="row">' + tile(a.kind.toLowerCase()) + '<div class="grow"><strong>' + esc(a.title) + '</strong><small>' + a.kind + date +
    '</small></div>' + (status ? '<span class="pill ' + (!result || status === 'Pending review' ? 'pending' : '') + '">' + status + '</span>' : '') +
    link('/assignments/' + a.id, 'Open', 'light', 'next') + '</div>';
}

function resultRow(row) {
  const assignment = dashboard.assignments.find(a => a.id === row.assignment);
  const student = dashboard.students.find(s => s.id === row.student);
  if (!assignment) return '';
  const status = score(row, assignment);
  return '<div class="row">' + tile(assignment.kind.toLowerCase()) + '<div class="grow"><strong>' + esc(assignment.title) +
    '</strong><small>' + esc(student?.name || assignment.kind) + ' · ' + esc(row.submitted.slice(0, 10)) + '</small></div><span class="pill ' +
    (status === 'Pending review' ? 'pending' : '') + '">' + status + '</span>' +
    link('/results/' + row.assignment + '/' + row.student, 'Open', 'light', 'next') + '</div>';
}

function home() {
  const counts = {
    pending: dashboard.submissions.filter(s => s.raw === null && s.band === null).length,
    done: dashboard.submissions.length
  };
  return '<section class="hero"><div class="hero-art" aria-hidden="true">IELTS</div><div class="eyebrow"><span class="dot"></span>' +
    (teacher() ? 'Teacher workspace' : 'Student workspace') + '</div><h1>Hello, ' + esc(user.name) +
    '!</h1><p>' + (teacher() ? 'Assign homework, review submissions, and track student progress.' : 'Complete your IELTS assignments and track your results.') +
    '</p>' + (teacher() ? action('create', 'New assignment', 'lime', 'plus') : link('/assignments', 'View assignments', 'lime', 'arrow')) + '</section>' +
    '<section class="stats" aria-label="Overview">' + stat('Total assignments', dashboard.assignments.length, 'tasks', 'sage') +
    (teacher() ? stat('Students', dashboard.students.length, 'students', 'lilac') : stat('Submitted', counts.done, 'check', 'lilac')) +
    stat('Pending review', counts.pending, 'clock', 'sand') + '</section>' +
    '<div class="headline"><h2>IELTS skills</h2></div><section class="tiles">' + kinds.map(kind => {
      const count = dashboard.assignments.filter(a => a.kind === kind).length;
      return '<a class="skill" href="' + skillPath(kind) + '" data-route><span class="skill-title">' + tile(kind.toLowerCase()) + icon('arrow', 16) +
        '</span><strong>' + kind + '</strong><small>' + count + (count === 1 ? ' assignment' : ' assignments') + '</small></a>';
    }).join('') +
    '</section><div class="headline"><h2>Recent assignments</h2>' + link('/assignments', 'View all', 'light', 'arrow') + '</div><section class="panel">' +
    (dashboard.assignments.slice(0, 4).map(assignmentRow).join('') || empty('No assignments yet.')) + '</section>';
}

function tasks({ skill: filter = '' }) {
  const rows = dashboard.assignments.filter(a => !filter || a.kind === filter);
  return '<div class="headline"><div><h1>Assignments</h1><p class="subhead">IELTS homework by skill</p></div>' +
    (teacher() ? action('create', 'New assignment', '', 'plus') : '') + '</div><div class="filters" aria-label="Skills">' +
    ['', ...kinds].map(kind => '<a href="' + skillPath(kind) + '" data-route' +
      (kind === filter ? ' class="active" aria-current="page"' : '') + '>' + (kind || 'All skills') + '</a>').join('') +
    '</div><section class="panel">' + (rows.map(assignmentRow).join('') || empty('No assignments for this skill.')) + '</section>';
}

function students() {
  const list = dashboard.students.map(s => {
    const submissions = dashboard.submissions.filter(row => row.student === s.id);
    return '<div class="row"><div class="avatar">' + initials(s.name) + '</div><div class="grow"><strong>' + esc(s.name) + '</strong><small>' +
      esc(s.email) + '</small></div><span class="pill">' + submissions.length + ' / ' + dashboard.assignments.length + ' submitted</span>' +
      link('/students/' + s.id, 'Progress', 'light', 'next') + '</div>';
  }).join('');
  return '<div class="headline"><div><h1>Students</h1><p class="subhead">Accounts and progress</p></div>' +
    action('add-student', 'Invite a student', '', 'plus') + '</div><section class="panel">' + (list || empty('No student accounts yet.')) + '</section>';
}

function results() {
  return '<div class="headline"><div><h1>Results</h1><p class="subhead">Submissions, band scores, and feedback</p></div></div><section class="panel">' +
    (dashboard.submissions.map(resultRow).join('') || empty('No submissions yet.')) + '</section>';
}

function render(route) {
  const { page } = route;
  const role = teacher() ? 'Teacher' : 'Student';
  const navigation = ['home', 'tasks', ...(teacher() ? ['students'] : []), 'results'];
  const unavailable = page === 'not-found' || (page === 'students' && !teacher());
  const title = unavailable ? 'Page not found' : labels[page];
  const view = unavailable ? () => '<div class="headline"><h1>Page not found</h1></div>' + link('/', 'Back to dashboard')
    : { home, tasks, students, results }[page];
  document.title = title + ' | Walker IELTS';
  app.innerHTML = '<div class="shell"><aside class="sidebar">' + brand + '<div class="label">WORKSPACE</div><nav class="nav" aria-label="Workspace">' +
    navigation.map(item => '<a href="' + pathsByPage[item] + '" data-route class="' + (item === page ? 'active' : '') + '"' +
      (item === page ? ' aria-current="page"' : '') + '>' + icon(item) + labels[item] + '</a>').join('') +
    '</nav><div class="sidebar-bottom"><div class="profile"><div class="avatar">' + initials(user.name) + '</div><div><strong>' + esc(user.name) +
    '</strong><small>' + role + '</small></div><button class="logout" aria-label="Sign out" title="Sign out" data-action="logout">' + icon('logout') +
    '</button></div></div></aside><div><header class="top"><div class="crumb">Workspace ' + icon('next', 13) + '<strong>' + title +
    '</strong></div><span class="top-role">' + role + ' workspace</span></header><main class="content">' + view(route) + errorLine + '</main></div></div>';
  if (unavailable) return;
  if (route.assignment) {
    const assignment = dashboard.assignments.find(item => item.id === route.assignment);
    if (assignment) viewAssignment(assignment);
    else openModal('Assignment not found', '');
  }
  if (route.student) studentProgress(route.student);
  if (route.result) viewResult(...route.result);
}

function openModal(title, contents) {
  modal.innerHTML = '<div class="modal-inner"><div class="headline"><h2 id="modal-title">' + esc(title) +
    '</h2><button type="button" class="modal-close" data-action="close" aria-label="Close">' + icon('close', 18) + '</button></div>' + contents + '</div>';
  modal.setAttribute('aria-labelledby', 'modal-title');
  if (!modal.open) modal.showModal();
}

function upload(file) {
  if (!file?.size) return Promise.resolve(null);
  if (file.size > maxUpload) throw new Error('Each file must be at most ' + (maxUpload / 1048576) + ' MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ data: reader.result.split(',')[1], type: file.type });
    reader.onerror = () => reject(new Error('Unable to read the file.'));
    reader.readAsDataURL(file);
  });
}

const submitButton = label => errorLine + '<button type="submit" class="btn">' + label + '</button>';

function create() {
  openModal('New assignment', '<form><label>Skill<select name="kind">' + kinds.map(kind => '<option>' + kind + '</option>').join('') +
    '</select></label><label>Title<input name="title" required maxlength="180"></label><label>Due date<input type="date" name="due"></label><div id="kind-fields"></div>' +
    submitButton('Publish assignment') + '</form>');
  const selector = modal.querySelector('[name=kind]');
  const fields = modal.querySelector('#kind-fields');
  function renderFields() {
    const kind = selector.value;
    fields.innerHTML = ['Listening', 'Reading'].includes(kind)
      ? '<label>Assignment PDF<input name="pdf" type="file" accept=".pdf,application/pdf" required></label>' +
        (kind === 'Listening' ? '<label>Listening audio<input name="audio" type="file" accept="audio/*" required></label>' :
          '<label>Reading test type<select name="level"><option value="Academic">Academic</option><option value="General">General Training</option></select></label>') +
        '<label>Answer key<textarea name="keys" required placeholder="One answer per line"></textarea></label>' +
        (maxUpload < 10 * 1024 * 1024 ? '<p class="help">The PDF and audio together must be at most ' + (maxUpload / 1048576) + ' MB.</p>' : '') +
        '<p class="help">Separate acceptable alternatives with |. An estimated IELTS band is available for 40-question assignments.</p>'
      : '<label>Prompt and instructions<textarea name="prompt" required maxlength="40000"></textarea></label>';
  }
  selector.onchange = renderFields;
  renderFields();
  bindForm(modal, async values => {
    const form = Object.fromEntries(values);
    if (maxUpload < 10 * 1024 * 1024 && (form.pdf?.size || 0) + (form.audio?.size || 0) > maxUpload) {
      throw new Error('The PDF and audio together must be at most ' + (maxUpload / 1048576) + ' MB.');
    }
    form.pdf = await upload(form.pdf);
    form.audio = await upload(form.audio);
    await api('assignments', form);
    dashboard = await api('dashboard');
    navigate(pathsByPage.tasks);
  });
}

function addStudent() {
  openModal('Invite a student', '<form><label>Full name<input name="name" required maxlength="100"></label>' +
    '<label>Student email<input name="email" type="email" required autocomplete="off"></label>' +
    submitButton('Generate invite code') + '</form>');
  bindForm(modal, async values => {
    const { email, code } = await api('invitations', Object.fromEntries(values));
    openModal('Invite code ready', '<p class="help">Share this code with ' + esc(email) +
      ' directly. It expires in 7 days and can only be used once.</p>' +
      '<label class="invite-code">Invite code<input readonly value="' + esc(code) + '"></label>');
    const input = modal.querySelector('input');
    input.focus();
    input.select();
  });
}

function viewAssignment(a) {
  const result = dashboard.submissions.find(row => row.assignment === a.id);
  const media = (a.hasPdf ? '<a href="/api/assignments/' + a.id + '/pdf" target="_blank" rel="noopener">Open PDF ↗</a>' : '') +
    (a.hasAudio ? '<audio controls preload="none" src="/api/assignments/' + a.id + '/audio"></audio>' : '');
  const questions = Array.from({ length: a.questions }, (_, i) => '<label>' + (i + 1) + '. Answer<input name="a' + i + '" maxlength="500"></label>').join('');
  const response = a.questions ? '<div class="answer-grid">' + questions + '</div>'
    : a.kind === 'Speaking' ? '<label>Audio response<input name="audio" type="file" accept="audio/*" required></label>'
    : '<label>Writing response<textarea name="response" required maxlength="40000"></textarea></label>';
  openModal(a.title, '<span class="pill">' + a.kind + (a.due ? ' · ' + esc(a.due) : '') + '</span>' +
    (a.prompt ? '<div class="prompt">' + esc(a.prompt) + '</div>' : '') + (media ? '<div class="media">' + media + '</div>' : '') +
    (teacher() ? (a.questions ? '<div class="notice"><strong>Answer key</strong><ol>' + a.keys.map(key => '<li>' + esc(key) + '</li>').join('') + '</ol></div>' : '') :
      result ? '<div class="notice">' + esc(score(result, a)) + '</div>' + link('/results/' + a.id + '/' + user.id, 'View result') :
        '<form>' + response + submitButton('Submit assignment') + '</form>'));
  if (!teacher() && !result) bindForm(modal, async values => {
    const form = a.questions ? { answers: Array.from({ length: a.questions }, (_, i) => values.get('a' + i)) }
      : a.kind === 'Speaking' ? { audio: await upload(values.get('audio')) } : { response: values.get('response') };
    await api('assignments/' + a.id + '/submit', form);
    await refresh();
  });
}

function viewResult(assignmentId, studentId) {
  const a = dashboard.assignments.find(item => item.id === assignmentId);
  const row = dashboard.submissions.find(item => item.assignment === assignmentId && item.student === studentId);
  const student = dashboard.students.find(item => item.id === studentId);
  if (!a || !row) return openModal('Result not found', '');
  const route = 'submissions/' + assignmentId + '/' + studentId;
  const breakdown = row.criteria ? JSON.parse(row.criteria) : [];
  const answer = a.questions ? '<ol>' + JSON.parse(row.response).map(value => '<li>' + esc(value || '—') + '</li>').join('') + '</ol>'
    : row.hasAudio ? '<div class="media"><audio controls preload="none" src="/api/' + route + '/audio"></audio></div>'
    : '<div class="prompt">' + esc(row.response) + '</div>';
  const input = (label, name, value) => '<label>' + label + '<input type="number" min="0" max="9" step="0.5" required name="' + name + '" value="' + esc(value) + '"></label>';
  const review = a.questions ? '' : teacher() ? '<form>' +
    (a.kind === 'Writing' ? criteria.map((label, i) => input(label, 'c' + i, breakdown[i])).join('') : input('Speaking band', 'band', row.band)) +
    '<label>Feedback<textarea name="feedback" maxlength="10000">' + esc(row.feedback) + '</textarea></label>' + submitButton('Save score') + '</form>' :
    (breakdown.length ? '<ul>' + criteria.map((label, i) => '<li>' + label + ' · ' + breakdown[i] + '</li>').join('') + '</ul>' : '') +
    (row.feedback ? '<div class="prompt">' + esc(row.feedback) + '</div>' : '');
  openModal(a.title, '<p class="subhead">' + esc(student?.name || a.kind) + '</p><div class="notice">' + esc(score(row, a)) + '</div>' + answer + review);
  if (teacher() && !a.questions) bindForm(modal, async values => {
    const payload = { feedback: values.get('feedback') };
    if (a.kind === 'Writing') payload.criteria = criteria.map((_, i) => Number(values.get('c' + i)));
    else payload.band = Number(values.get('band'));
    await api(route + '/review', payload);
    await refresh();
  });
}

function studentProgress(id) {
  const student = dashboard.students.find(item => item.id === id);
  if (!student) return openModal('Student not found', '');
  const rows = dashboard.submissions.filter(item => item.student === id);
  const sections = kinds.map(kind => {
    const assignments = dashboard.assignments.filter(a => a.kind === kind);
    const submitted = rows.filter(row => assignments.some(a => a.id === row.assignment));
    return '<div class="row">' + tile(kind.toLowerCase()) + '<div class="grow"><strong>' + kind + '</strong></div><span class="pill">' + submitted.length + ' / ' + assignments.length + '</span></div>';
  }).join('');
  openModal(student.name, '<div class="panel">' + sections + '</div><div class="headline notice"><h2>Results</h2></div><div class="panel">' +
    (rows.map(resultRow).join('') || empty('No submissions yet.')) + '</div>');
}

async function handleAction(event) {
  const anchor = event.target.closest('a[data-route]');
  if (anchor && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    const route = readRoute(anchor.pathname);
    navigate(anchor.pathname, { detail: Boolean(route.assignment || route.student || route.result) });
    return;
  }
  const key = event.target.closest('[data-action]')?.dataset.action;
  try {
    if (key === 'logout') {
      await api('logout', {});
      user = null;
      dashboard = null;
      navigate('/login', { replace: true });
    }
    if (key === 'close') modal.close();
    if (key === 'register') register();
    if (key === 'create') create();
    if (key === 'add-student') addStudent();
  } catch (error) {
    showError(error, modal.open ? modal : app);
  }
}

document.addEventListener('click', handleAction);
window.addEventListener('popstate', showRoute);
modal.addEventListener('close', () => {
  if (modal.open || !user) return;
  const route = readRoute();
  if (!route.assignment && !route.student && !route.result) return;
  if (history.state?.detail) history.back();
  else navigate(pathsByPage[route.page], { replace: true });
});
try {
  ({ user, demo, maxUpload } = await api('session'));
  if (user) await refresh();
  else showRoute();
} catch (error) {
  app.innerHTML = '<main class="content"><p class="error" role="alert"></p></main>';
  showError(error);
}
