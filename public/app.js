const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const kinds = ['Listening', 'Reading', 'Writing', 'Speaking'];
const criteria = ['Task achievement / response', 'Coherence and cohesion', 'Lexical resource', 'Grammatical range and accuracy'];
const paths = {
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
const brand = '<img class="brand" src="/walker-logo.png" width="568" height="255" alt="Walker IELTS">';
const labels = { home: 'Dashboard', tasks: 'Assignments', students: 'Students', results: 'Results' };
let user;
let demo;
const pathsByPage = { home: '/dashboard', tasks: '/assignments', students: '/students', results: '/results' };
const skillPath = kind => pathsByPage.tasks + (kind ? '/' + kind.toLowerCase() : '');

function readRoute(path = location.pathname) {
  const normalized = path.replace(/\/$/, '') || '/';
  if (normalized === '/') return { page: 'landing' };
  if (normalized === '/admin') return { page: 'admin' };
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
  stopLandingScroll?.();
  stopLandingScroll = undefined;
  if (route.page === 'admin') {
    loadAdmin();
    return;
  }
  if (route.page === 'landing') {
    landing();
    return;
  }
  if (!user) {
    if (route.page !== 'login') {
      const next = route.page === 'not-found' ? pathsByPage.home : location.pathname;
      history.replaceState(null, '', '/login' + (next === pathsByPage.home ? '' : '?next=' + encodeURIComponent(next)));
    }
    login();
    return;
  }
  if (route.page === 'login') {
    const next = new URLSearchParams(location.search).get('next');
    const validNext = next?.startsWith('/') && !next.startsWith('//') && !['admin', 'landing', 'login', 'not-found'].includes(readRoute(next).page);
    navigate(validNext ? next : pathsByPage.home, { replace: true });
    return;
  }
  if (!dashboard) return;
  render(route);
}
let dashboard;
let stopLandingScroll;
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

function landing() {
  const entry = user ? pathsByPage.home : '/login';
  const primary = user ? 'Open dashboard' : 'Sign in';
  const skills = [
    ['Listening', 'Listen to your assignment recording, then submit your answers.', 'Check your score after you submit.'],
    ['Reading', 'Read the passage and answer the questions your teacher assigned.', 'Check how many answers you got right.'],
    ['Writing', 'Respond to your prompt and get feedback on the four IELTS writing criteria.', 'Review your teacher’s comments alongside your band score.'],
    ['Speaking', 'Record your response and upload it for your teacher to review.', 'Return to Results to see your score and feedback.']
  ];
  document.title = 'Walker IELTS | Practice and progress';
  app.innerHTML = '<div class="landing"><picture class="landing-desk"><source media="(max-width:680px)" srcset="/landing-desk-mobile.webp"><img src="/landing-desk.webp" width="1448" height="1086" alt="" fetchpriority="high"></picture><header class="landing-header"><div class="landing-width landing-bar">' +
    '<a href="/" class="landing-brand" aria-label="Walker IELTS home">' + brand + '</a>' +
    '<nav aria-label="Main navigation"><a href="#skills" class="landing-nav-link">Explore skills</a>' +
    link(entry, user ? 'Dashboard' : 'Sign in', 'accent', 'arrow') + '</nav></div></header>' +
    '<main><section class="landing-hero"><div class="landing-width landing-hero-grid"><div class="landing-intro">' +
    '<h1>Build your IELTS skills.<br><em><span class="hero-underline">With</span> your <mark class="hero-marker">teacher</mark>.</em></h1>' +
    '<p>Complete assignments, get teacher feedback, and track your progress.</p>' +
    '<div class="landing-actions">' + link(entry, primary, 'accent', 'arrow') +
    '<a class="landing-secondary" href="#skills">Explore skills ' + icon('next', 15) + '</a></div></div>' +
    '<div class="landing-preview">' +
    '<div class="landing-preview-card"><img class="landing-paper" src="/assignment-paper.webp" width="800" height="600" alt=""><div class="landing-preview-header">' +
    tile('tasks', 'blue-soft') + '<div><h2>Assignments</h2><p>Example workspace</p></div></div>' +
    '<div class="landing-preview-rows">' +
    [['listening', 'Campus tour', 'Listening', 'To do'], ['reading', 'Urban transport', 'Reading', '7.0 band'], ['writing', 'Education and technology', 'Writing', 'In review']].map(([key, title, kind, status]) =>
      '<div class="landing-preview-row">' + tile(key) + '<div class="grow"><strong>' + title + '</strong><small>' + kind + '</small></div>' +
      '<span class="pill' + (status === 'In review' ? ' pending' : status === '7.0 band' ? ' scored' : '') + '">' + status + '</span></div>').join('') +
    '</div></div></div>' +
    '</div></section><section class="landing-width landing-skills" id="skills"><h2>Practice all four skills</h2>' +
    '<div class="landing-notebook">' + skills.map(([kind, description, outcome]) =>
      '<article class="landing-note"><img class="landing-paper" src="/notebook-paper.webp" width="1200" height="300" alt="" loading="lazy">' +
      tile(kind.toLowerCase()) + '<div><h3>' + kind + '</h3><p>' + description + ' ' + outcome + '</p></div></article>').join('') +
    '</div></section></main><footer class="landing-footer"><div class="landing-width landing-bar">' +
    '<a href="/" class="landing-brand" aria-label="Walker IELTS home">' + brand + '</a>' +
    link(entry, user ? 'Dashboard' : 'Sign in', 'accent', 'arrow') + '</div></footer></div>';
  stopLandingScroll = animateLanding(app.querySelector('.landing'));
}

function animateLanding(landingPage) {
  const header = landingPage.querySelector('.landing-header');
  const notebook = landingPage.querySelector('.landing-notebook');
  const notes = [...notebook.children];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const edge = 10;
  let frame = 0;

  function updateScroll() {
    frame = 0;
    const scroll = window.scrollY;
    header.classList.toggle('landing-header-floating', scroll > 8);
    if (motion.matches) {
      notebook.classList.remove('notebook-stacked');
      return;
    }
    notebook.classList.add('notebook-stacked');
    const offsets = notes.map(note => note.offsetTop);
    const top = notebook.getBoundingClientRect().top + scroll;
    const end = document.documentElement.scrollHeight - innerHeight;
    const stages = notes.length - 1;
    const firstNoteCenter = top + offsets[0] + notes[0].offsetHeight / 2;
    const start = Math.max(0, firstNoteCenter - innerHeight / 2);
    const step = Math.max(1, Math.min(210, innerHeight * .25, (end - start) / stages));

    let position = offsets[0];
    for (let index = 0; index < notes.length; index++) {
      const progress = index === 0 ? 1 : Math.min(1, Math.max(0, (scroll - start) / step - (index - 1)));
      if (index > 0) {
        const distance = offsets[index] - offsets[index - 1];
        const eased = progress * progress * (3 - 2 * progress);
        position += edge + (distance - edge) * eased;
      }
      notes[index].style.setProperty('--note-offset', (position - offsets[index]) + 'px');
      notes[index].style.setProperty('--note-open', progress);
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(updateScroll);
  }

  updateScroll();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  motion.addEventListener('change', schedule);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    motion.removeEventListener('change', schedule);
  };
}

const providerNames = { google: 'Google', telegram: 'Telegram' };
const providerIcons = {
  google: '<svg aria-hidden="true" viewBox="0 0 48 48" width="21" height="21">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.19 5.48-4.73 7.18l7.73 6C44.45 38.04 46.98 31.91 46.98 24.55z"/>' +
    '<path fill="#FBBC05" d="M10.54 28.59a14.41 14.41 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.94-5.8l-7.73-6c-2.15 1.45-4.94 2.3-8.21 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
  telegram: '<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">' +
    '<circle cx="12" cy="12" r="12" fill="#229ED9"/>' +
    '<path fill="#fff" d="M5.31 11.75c3.5-1.52 5.84-2.52 7.01-3 3.34-1.39 4.03-1.63 4.49-1.64.1 0 .33.02.48.15.13.11.16.25.17.36.02.1.04.32.02.49-.18 1.9-.95 6.52-1.34 8.65-.17.9-.5 1.2-.82 1.24-.7.06-1.23-.46-1.91-.9-1.07-.7-1.67-1.14-2.71-1.82-1.2-.79-.42-1.22.26-1.92.18-.18 3.28-3 3.34-3.25.01-.03.01-.16-.06-.22s-.18-.04-.26-.02c-.11.02-1.81 1.15-5.11 3.38-.48.33-.92.49-1.31.48-.43-.01-1.27-.24-1.89-.44-.76-.25-1.37-.38-1.32-.8.03-.22.33-.45.96-.69z"/></svg>'
};
let providers = [];
let oauthLink;

function providerOptions() {
  const next = new URLSearchParams(location.search).get('next') || '/dashboard';
  return '<div class="login-providers" aria-label="Other sign-in methods">' + Object.entries(providerNames).map(([provider, name]) => {
    const text = providerIcons[provider] + '<span>Continue with ' + name + '</span>';
    if (!providers.includes(provider)) return '<button class="btn light" type="button" disabled>' + text + '</button>';
    return '<a class="btn light" href="/api/oauth/' + provider + '/start?next=' + encodeURIComponent(next) + '">' + text + '</a>';
  }).join('') + '</div>' +
    (providers.length < 2 ? '<p class="help">Unavailable providers require configuration.</p>' : '');
}

function login(email = '', message = '') {
  document.title = 'Sign in | Walker IELTS';
  const status = new URLSearchParams(location.search).get('oauth');
  const connecting = status === 'link' && Object.hasOwn(providerNames, oauthLink);
  const formTitle = connecting ? 'Link your ' + providerNames[oauthLink] + ' account' : 'Sign in';
  const statusMessage = status === 'failed' ? 'Provider sign-in could not be completed. Try again or sign in with your email.'
    : status === 'link' && !connecting ? 'This connection has expired. Start again with your sign-in provider.' : '';
  app.innerHTML = '<main class="login"><section class="login-aside">' + brand +
    '<div><h1>IELTS practice<br>in one place.</h1><p>Assignments, submissions, and results.</p></div></section>' +
    '<section class="login-main"><div class="login-box"><h2>' + formTitle + '</h2>' +
    (statusMessage ? '<p class="error" role="status">' + statusMessage + '</p>' : '') +
    (connecting ? '<p class="help">Sign in with your Walker IELTS email and password once to link your account.</p>' :
      providerOptions() + '<div class="login-divider">Or use your email</div>') + '<form>' +
    (message ? '<p class="help notice" role="status">' + esc(message) + '</p>' : '') +
    '<label>Email<input required type="email" name="email" autocomplete="username" value="' + esc(email) + '"></label>' +
    '<label>Password<input required type="password" name="password" autocomplete="current-password"></label>' +
    errorLine + '<button type="submit" class="btn accent">' + (connecting ? 'Link account and sign in' : 'Sign in') + ' ' + icon('arrow', 16) + '</button></form>' +
    '<div>' + action('register', 'Create an account with an invite code') + '</div>' +
    '<a href="/" data-route>Back to home</a>' +
    (demo ? '<div class="demo-buttons">' + action('demo-teacher', 'Teacher demo') + action('demo-student', 'Student demo') + '</div>' : '') +
    '</div></section></main>';
  bindForm(app, values => signIn({ ...Object.fromEntries(values), connectProvider: connecting }));
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
    link('/results/' + row.assignment + '/' + row.student, assignment.cd ? 'Review answers' : 'Open', 'light', 'next') + '</div>';
}

function home() {
  const counts = {
    pending: dashboard.submissions.filter(s => s.raw === null && s.band === null).length,
    done: dashboard.submissions.length
  };
  return '<section class="hero"><div class="hero-art" aria-hidden="true">IELTS</div><div class="eyebrow"><span class="dot"></span>' +
    (teacher() ? 'Teacher workspace' : 'Student workspace') + '</div><h1>Hello, ' + esc(user.name) +
    '!</h1><p>' + (teacher() ? 'Assign homework, review submissions, and track student progress.' : 'Complete your IELTS assignments and track your results.') +
    '</p>' + (teacher() ? link('/admin', 'Manage assignments', 'accent', 'arrow') : link('/assignments', 'View assignments', 'accent', 'arrow')) + '</section>' +
    '<section class="stats" aria-label="Overview">' + stat('Total assignments', dashboard.assignments.length, 'tasks', 'blue-soft') +
    (teacher() ? stat('Students', dashboard.students.length, 'students', 'blue-rich') : stat('Submitted', counts.done, 'check', 'blue-rich')) +
    stat('Pending review', counts.pending, 'clock', 'red-soft') + '</section>' +
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
    (teacher() ? link('/admin', 'Manage assignments', '', 'arrow') : '') + '</div><div class="filters" aria-label="Skills">' +
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
  const view = unavailable ? () => '<div class="headline"><h1>Page not found</h1></div>' + link(pathsByPage.home, 'Back to dashboard')
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

function openModal(title, contents, wide = false) {
  modal.classList.toggle('cd-dialog', wide);
  modal.innerHTML = '<div class="modal-inner"><div class="headline"><h2 id="modal-title">' + esc(title) +
    '</h2><button type="button" class="modal-close" data-action="close" aria-label="Close">' + icon('close', 18) + '</button></div>' + contents + '</div>';
  modal.setAttribute('aria-labelledby', 'modal-title');
  if (!modal.open) modal.showModal();
}

function upload(file, limit = maxUpload) {
  if (!file?.size) return Promise.resolve(null);
  if (file.size > limit) throw new Error('Each file must be at most ' + (limit / 1048576) + ' MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ data: reader.result.split(',')[1], type: file.type });
    reader.onerror = () => reject(new Error('Unable to read the file.'));
    reader.readAsDataURL(file);
  });
}

const submitButton = label => errorLine + '<button type="submit" class="btn">' + label + '</button>';

let adminAssignments = [];
let adminUploadLimit = 0;

async function loadAdmin() {
  document.title = 'Admin | Walker IELTS';
  try {
    const state = await api('admin/session');
    if (readRoute().page !== 'admin') return;
    adminUploadLimit = state.maxUpload;
    if (state.signedIn) await showAdminAssignments();
    else adminLogin();
  } catch (error) {
    if (readRoute().page !== 'admin') return;
    adminLogin();
    showError(error);
  }
}

function adminLogin() {
  app.innerHTML = '<main class="admin-login"><div class="admin-login-brand">' + brand + '</div>' +
    '<section class="admin-login-box"><h1>Admin sign in</h1><form>' +
    '<label>Username<input name="username" required autocomplete="username" maxlength="100" autocapitalize="none"></label>' +
    '<label>Password<input name="password" type="password" required autocomplete="current-password" maxlength="200"></label>' +
    submitButton('Sign in') + '</form><a href="/">Back to home</a></section></main>';
  bindForm(app, async values => {
    await api('admin/login', Object.fromEntries(values));
    await loadAdmin();
  });
}

async function showAdminAssignments(message = '') {
  const assignments = await api('admin/assignments');
  if (readRoute().page !== 'admin') return;
  adminAssignments = assignments;
  app.innerHTML = '<div class="admin-page"><header class="admin-bar"><a href="/" aria-label="Walker IELTS home">' + brand + '</a>' +
    '<span>Admin</span><div class="admin-actions">' + action('admin-password', 'Change password') +
    action('admin-logout', 'Sign out', 'light', 'logout') + '</div></header>' +
    '<main class="admin-content"><div class="headline"><div><h1>Manage assignments</h1>' +
    '<p class="subhead">Publish and manage IELTS tests for your class.</p></div>' +
    '<div class="admin-actions">' + action('admin-demo-student', 'Demo student', 'light') +
    action('admin-import-reading', 'Import CD Reading', 'light') +
    action('admin-create', 'New assignment', 'accent', 'plus') + '</div></div>' +
    (message ? '<p class="notice" role="status">' + esc(message) + '</p>' : '') + errorLine +
    '<section class="panel" aria-label="Assignments">' + (assignments.map(assignment =>
      '<article class="row admin-assignment">' + tile(assignment.kind.toLowerCase()) +
      '<div class="grow"><strong>' + esc(assignment.title) + '</strong><small>' + assignment.kind + ' · ' +
      assignment.submissionCount + (assignment.submissionCount === 1 ? ' submission' : ' submissions') + '</small></div>' +
      '<div class="admin-actions">' + action('admin-edit:' + assignment.id, 'Edit', 'light', 'writing') +
      action('admin-delete:' + assignment.id, 'Delete') + '</div></article>'
    ).join('') || empty('No assignments yet.')) + '</section></main></div>';
}

function editAssignment(existing) {
  if (existing?.cd) return editCdReading(existing);
  const locked = Boolean(existing?.submissionCount);
  openModal(existing ? 'Edit assignment' : 'New assignment', '<form><label>Skill<select name="kind"' + (locked ? ' disabled' : '') + '>' +
    kinds.map(kind => '<option' + (kind === existing?.kind ? ' selected' : '') + '>' + kind + '</option>').join('') +
    '</select></label><label>Title<input name="title" required maxlength="180" value="' + esc(existing?.title) +
    '"></label><label>Due date<input type="date" name="due" value="' + esc(existing?.due) + '"></label><div id="kind-fields"></div>' +
    (locked ? '<p class="help">The skill, reading type, and answer key are locked because students have submitted this assignment.</p>' : '') +
    submitButton(existing ? 'Save changes' : 'Publish assignment') + '</form>');
  const selector = modal.querySelector('[name=kind]');
  const fields = modal.querySelector('#kind-fields');
  function renderFields() {
    const kind = selector.value;
    const sameKind = existing?.kind === kind;
    const general = sameKind && existing.level === 'General';
    const retained = sameKind && existing.hasPdf;
    const hasAudio = sameKind && existing.hasAudio;
    fields.innerHTML = ['Listening', 'Reading'].includes(kind)
      ? '<label>' + (retained ? 'Replace assignment PDF (optional)' : 'Assignment PDF') +
        '<input name="pdf" type="file" accept=".pdf,application/pdf"' + (!sameKind ? ' required' : '') + '></label>' +
        (kind === 'Listening' ? '<label>' + (hasAudio ? 'Replace listening audio (optional)' : 'Listening audio') +
          '<input name="audio" type="file" accept="audio/*"' + (hasAudio ? '' : ' required') + '></label>' :
          '<label>Reading test type<select name="level"' + (locked ? ' disabled' : '') +
          '><option value="Academic">Academic</option><option value="General"' + (general ? ' selected' : '') +
          '>General Training</option></select></label>') +
        '<label>Answer key<textarea name="keys" required placeholder="One answer per line"' + (locked ? ' readonly' : '') + '>' +
        (sameKind ? esc(existing.keys.join('\n')) : '') + '</textarea></label>' +
        (adminUploadLimit < 10 * 1024 * 1024 ? '<p class="help">The PDF and audio together must be at most ' + (adminUploadLimit / 1048576) + ' MB.</p>' : '') +
        '<p class="help">Separate acceptable alternatives with |. An estimated IELTS band is available for 40-question assignments.</p>'
      : '<label>Prompt and instructions<textarea name="prompt" required maxlength="40000">' +
        (sameKind ? esc(existing.prompt) : '') + '</textarea></label>';
  }
  selector.onchange = renderFields;
  renderFields();
  bindForm(modal, async values => {
    const form = Object.fromEntries(values);
    form.kind = selector.value;
    if (locked && existing.level) form.level = existing.level;
    if (adminUploadLimit < 10 * 1024 * 1024 && (form.pdf?.size || 0) + (form.audio?.size || 0) > adminUploadLimit) {
      throw new Error('The PDF and audio together must be at most ' + (adminUploadLimit / 1048576) + ' MB.');
    }
    form.pdf = await upload(form.pdf, adminUploadLimit);
    form.audio = await upload(form.audio, adminUploadLimit);
    await api(existing ? 'admin/assignments/' + existing.id + '/edit' : 'admin/assignments', form);
    modal.close();
    await showAdminAssignments(existing ? 'Assignment updated.' : 'Assignment published.');
  });
}

let readingPack = [];

function importCdReading() {
  openModal('Import CD Reading', '<form><label>Reading pack JSON<input type="file" name="pack" accept=".json,application/json"></label>' +
    '<label>Test<select name="test" aria-label="Test" required></select></label>' + submitButton('Review test') + '</form>');
  const input = modal.querySelector('[name=pack]');
  const picker = modal.querySelector('[name=test]');
  function listTests() {
    picker.innerHTML = readingPack.length ? readingPack.map((test, index) =>
      '<option value="' + index + '">' + esc(test.title) + '</option>').join('') : '<option value="">Select a reading pack</option>';
  }
  listTests();
  input.onchange = async () => {
    readingPack = [];
    try {
      const file = input.files[0];
      if (!file || file.size > 2 * 1024 * 1024) throw new Error('Select a reading pack under 2 MB.');
      const pack = JSON.parse(await file.text());
      if (pack.format !== 'walker-reading-cd-v1' || !Array.isArray(pack.tests) || !pack.tests.length ||
          pack.tests.some(test => !test || typeof test.title !== 'string' || !Array.isArray(test.sections) ||
            !Array.isArray(test.keys) || test.sections.some(section => !section || !Array.isArray(section.groups) || section.groups.some(group => !group || !Array.isArray(group.numbers))))) {
        throw new Error('Select a valid Walker IELTS CD reading pack.');
      }
      readingPack = pack.tests;
      modal.querySelector('[role=alert]').textContent = '';
    } catch (error) {
      showError(error, modal);
    }
    listTests();
  };
  bindForm(modal, values => {
    const test = readingPack[Number(values.get('test'))];
    if (!test) return;
    editCdReading({ ...test, cd: test.sections });
  });
}

function editCdReading(test) {
  const locked = Boolean(test.submissionCount);
  const notes = Array.isArray(test.review) ? test.review : [];
  let answerIndex = 0;
  const details = test.cd.map((section, sectionIndex) => '<details class="cd-editor"><summary>Passage ' +
    (sectionIndex + 1) + ' · ' + esc(section.title) + '</summary><label>Passage title<input name="title-' + sectionIndex + '" required maxlength="180" value="' +
    esc(section.title) + '"></label><label>Reading passage<textarea name="passage-' + sectionIndex + '" required maxlength="40000">' +
    esc(section.passage) + '</textarea></label>' + section.groups.map((group, groupIndex) => {
      const name = sectionIndex + '-' + groupIndex;
      return '<label>Questions ' + group.numbers.map(esc).join(', ') + '<textarea name="group-' + name + '" required maxlength="18000">' +
        esc(group.text) + '</textarea></label><label>Choices (separate with |)<input name="choices-' + name + '" value="' +
        esc(Array.isArray(group.choices) ? group.choices.join(' | ') : '') + '"></label><div class="answer-grid">' + group.numbers.map(number => {
          const index = answerIndex++;
          return '<label>Answer ' + esc(number) + '<input name="key-' + index + '" required' + (locked ? ' readonly' : '') +
            ' value="' + esc(test.keys[index]) + '"></label>';
        }).join('') + '</div>';
    }).join('') + '</details>').join('');
  openModal(test.id ? 'Edit CD Reading' : 'Review CD Reading', '<form><label>Title<input name="title" required maxlength="180" value="' +
    esc(test.title) + '"></label><label>Due date<input name="due" type="date" value="' + esc(test.due) + '"></label>' +
    (notes.length ? '<div class="notice"><strong>Check the source before publishing</strong><ul>' + notes.map(note => '<li>' + esc(note) + '</li>').join('') + '</ul></div>' : '') +
    details + (!test.id ? '<label class="cd-confirm"><input type="checkbox" required> I have reviewed the passages, questions, and answer key.</label>' : '') +
    submitButton(test.id ? 'Save changes' : 'Publish assignment') + '</form>', true);
  // Open a collapsed section if one of its required fields fails browser validation.
  modal.querySelector('form').addEventListener('invalid', event => {
    const section = event.target.closest('details');
    if (section) section.open = true;
  }, true);
  bindForm(modal, async values => {
    const cd = test.cd.map((section, sectionIndex) => ({
      title: values.get('title-' + sectionIndex), passage: values.get('passage-' + sectionIndex),
      groups: section.groups.map((group, groupIndex) => {
        const name = sectionIndex + '-' + groupIndex;
        return { ...group, text: values.get('group-' + name),
          choices: String(values.get('choices-' + name)).split('|').map(choice => choice.trim()).filter(Boolean) };
      })
    }));
    const keys = test.keys.map((_, index) => values.get('key-' + index)).join('\n');
    await api(test.id ? 'admin/assignments/' + test.id + '/edit' : 'admin/assignments',
      { kind: 'Reading', title: values.get('title'), due: values.get('due'), keys, cd });
    modal.close();
    await showAdminAssignments(test.id ? 'Assignment updated.' : 'Assignment published.');
  });
}

function deleteAssignment(assignment) {
  openModal('Delete assignment', '<form><p>Delete <strong>' + esc(assignment.title) + '</strong> and all of its submissions? This is permanent.</p>' +
    '<div class="admin-actions">' + action('close', 'Cancel') +
    '<button type="submit" class="btn accent">Delete assignment</button></div>' + errorLine + '</form>');
  bindForm(modal, async () => {
    await api('admin/assignments/' + assignment.id + '/delete', {});
    modal.close();
    await showAdminAssignments('Assignment deleted.');
  });
}

async function manageDemoStudent() {
  const { email, exists } = await api('admin/demo-student');
  if (readRoute().page !== 'admin') return;
  const details = '<p>Email: <strong>' + esc(email) + '</strong></p>';
  if (exists) {
    openModal('Demo student ready', details + '<p class="help">Use this email and the password you chose on the regular sign-in page.</p>' +
      '<a class="btn" href="/login" target="_blank" rel="noopener">Open sign in</a>');
    return;
  }
  openModal('Create a demo student', details + '<form>' +
    '<label>Demo password<input name="password" type="password" required minlength="12" maxlength="200" autocomplete="new-password"></label>' +
    submitButton('Create demo student') + '</form>');
  bindForm(modal, async values => {
    await api('admin/demo-student', { password: values.get('password') });
    await manageDemoStudent();
  });
}

function changeAdminPassword() {
  openModal('Change admin password', '<form><label>Current password<input name="current" type="password" required autocomplete="current-password" maxlength="200"></label>' +
    '<label>New password<input name="password" type="password" required minlength="12" maxlength="200" autocomplete="new-password"></label>' +
    '<label>Confirm new password<input name="confirmation" type="password" required minlength="12" maxlength="200" autocomplete="new-password"></label>' +
    submitButton('Save password') + '</form>');
  bindForm(modal, async values => {
    const { current, password, confirmation } = Object.fromEntries(values);
    if (password !== confirmation) throw new Error('The new passwords do not match.');
    await api('admin/password', { current, password });
    modal.close();
    await showAdminAssignments('Password changed. Other admin sessions were signed out.');
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
  if (a.cd && !teacher()) return openCdReading(a, result);
  const media = (a.hasPdf ? '<a href="/api/assignments/' + a.id + '/pdf" target="_blank" rel="noopener">Open PDF ↗</a>' : '') +
    (a.hasAudio ? '<audio controls preload="none" src="/api/assignments/' + a.id + '/audio"></audio>' : '');
  const questions = Array.from({ length: a.questions }, (_, i) => '<label>' + (i + 1) + '. Answer<input name="a' + i + '" maxlength="500"></label>').join('');
  const response = a.questions ? '<div class="answer-grid">' + questions + '</div>'
    : a.kind === 'Speaking' ? '<label>Audio response<input name="audio" type="file" accept="audio/*" required></label>'
    : '<label>Writing response<textarea name="response" required maxlength="40000"></textarea></label>';
  openModal(a.title, '<span class="pill">' + a.kind + (a.due ? ' · ' + esc(a.due) : '') + '</span>' +
    (a.cd ? '<p class="help">Computer-delivered Reading · ' + a.questions + ' questions</p>' : '') +
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

function cdAnswerControl(group, number, field) {
  const name = 'cd-answer-' + field;
  const label = 'Answer ' + number;
  if (group.choices.includes('NOT GIVEN')) {
    return '<fieldset class="cd-choice-set" aria-label="' + label + '">' + group.choices.map(choice =>
      '<label><input type="radio" name="' + name + '" value="' + esc(choice) + '"><span>' +
      esc(choice === 'NOT GIVEN' ? 'Not Given' : choice[0] + choice.slice(1).toLowerCase()) + '</span></label>'
    ).join('') + '</fieldset>';
  }
  if (group.choices.length) return '<select class="cd-answer-field" name="' + name + '" aria-label="' + label +
    '"><option value="">Select an answer</option>' + group.choices.map(choice => '<option>' + esc(choice) + '</option>').join('') + '</select>';
  return '<input class="cd-answer-field" name="' + name + '" aria-label="' + label +
    '" maxlength="500" autocomplete="off" placeholder="Type your answer">';
}

function cdAnswerReview(check) {
  if (!check) return '<p class="help">Answer details unavailable.</p>';
  const status = check.answer?.trim() ? (check.correct ? 'Correct' : 'Incorrect') : 'Unanswered';
  return '<div class="cd-answer-review"><span class="pill' + (check.correct ? '' : ' pending') + '">' + status + '</span>' +
    '<dl><div><dt>' + (teacher() ? 'Student answer' : 'Your answer') + '</dt><dd>' + esc(check.answer || '—') + '</dd></div>' +
    '<div><dt>Correct answer</dt><dd>' + esc(check.key) + '</dd></div></dl></div>';
}

function renderCdGroup(group, offset, checks) {
  const answer = (number, index) => checks
    ? cdAnswerReview(checks.get(number))
    : cdAnswerControl(group, number, offset + index);
  const anchor = /^(\d{1,2})[.)]?\s+(?=\S)|\(?(\d{1,2})\)?\s*(?:_{3,}|[.…]{3,})/gm;
  const matches = [];
  let next = 0;
  if (!group.unordered) {
    for (const match of group.text.matchAll(anchor)) {
      const number = Number(match[1] || match[2]);
      const index = group.numbers.indexOf(number, next);
      if (index === -1) continue;
      matches.push({ match, number, index });
      next = index + 1;
    }
  }
  const prompt = (text, className) => text.trim() ? '<div class="' + className + '">' + esc(text.trim()) + '</div>' : '';
  const rows = matches.map(({ match, number, index }, i) => {
    const body = group.text.slice(match.index + match[0].length, matches[i + 1]?.match.index);
    return '<div class="cd-question-row"><span class="cd-question-number">' + number + '</span><div>' +
      (match[2] ? '<span class="cd-blank">Blank ' + number + '</span>' : prompt(body, 'cd-question-text')) +
      answer(number, index) + (match[2] ? prompt(body, 'cd-question-text cd-continuation') : '') + '</div></div>';
  });
  const remaining = group.numbers.flatMap((number, index) => matches.some(item => item.index === index) ? [] :
    ['<div class="cd-question-row"><span class="cd-question-number">' + number + '</span><div>' +
      answer(number, index) + '</div></div>']);
  return '<div class="cd-question-group">' +
    prompt(group.text.slice(0, matches.length ? matches[0].match.index : group.text.length), 'cd-group-instructions') +
    rows.join('') + remaining.join('') + '</div>';
}

function openCdReading(assignment, result) {
  const checks = result ? new Map((result.checks || []).map(check => [check.number, check])) : null;
  const summary = result ? '<div class="notice cd-score" role="status"><strong>Submitted score</strong><span>' +
    esc(score(result, assignment)) + (result.band === null ? '' : ' · ' + result.raw + ' / ' + assignment.questions) +
    '</span><span class="help">Read any passage again and compare your answers.</span></div>' : '';
  const tabs = assignment.cd.map((_, index) => '<button type="button" class="btn light" data-cd-part="' + index +
    '">Passage ' + (index + 1) + '</button>').join('');
  let answerCount = 0;
  const sections = assignment.cd.map((section, index) => '<section class="cd-part" ' + (index ? 'hidden' : '') + '>' +
    '<div class="cd-passage" tabindex="0" aria-label="Reading passage"><h3>' + esc(section.title) +
    '</h3><div class="cd-passage-copy">' + esc(section.passage) + '</div></div>' +
    '<div class="cd-questions" tabindex="0" aria-label="Questions">' + section.groups.map(group => {
      const markup = renderCdGroup(group, answerCount, checks);
      answerCount += group.numbers.length;
      return markup;
    }).join('') + '</div></section>').join('');
  const tag = result ? 'div' : 'form';
  openModal(assignment.title, '<' + tag + ' class="cd-test">' + summary + '<div class="cd-tools">' +
    '<a class="cd-telegram" href="https://t.me/walker_ielts" target="_blank" rel="noopener">' + providerIcons.telegram + 'Walker IELTS on Telegram</a>' +
    '<div class="cd-utility"><label>Text size<select name="text-size"><option value="standard">Standard</option><option value="large">Large</option></select></label>' +
    '<button type="button" class="btn light" data-highlight>Highlight selection</button><button type="button" class="btn light" data-clear-highlight>Clear highlights</button></div></div>' +
    '<nav class="cd-tabs" aria-label="Passages">' + tabs + '</nav>' + sections +
    (result ? '' : '<div class="cd-submit"><span class="cd-progress" role="status">0 / ' + answerCount + ' answered</span>' +
      submitButton('Submit assignment') + '</div>') + '</' + tag + '>', true);
  const form = modal.querySelector('.cd-test');
  const panels = [...modal.querySelectorAll('.cd-part')];
  const tabButtons = [...modal.querySelectorAll('.cd-tabs button')];
  function select(part) {
    panels.forEach((panel, index) => { panel.hidden = index !== part; });
    tabButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === part)));
  }
  select(0);
  for (const button of tabButtons) button.onclick = () => select(Number(button.dataset.cdPart));
  form.querySelector('[name=text-size]').onchange = event => form.classList.toggle('cd-large', event.target.value === 'large');
  const highlight = form.querySelector('[data-highlight]');
  highlight.onmousedown = event => event.preventDefault();
  highlight.onclick = () => {
    const copy = form.querySelector('.cd-part:not([hidden]) .cd-passage-copy');
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!copy.contains(range.startContainer) || !copy.contains(range.endContainer)) return;
    const mark = document.createElement('mark');
    mark.append(range.extractContents());
    range.insertNode(mark);
    selection.removeAllRanges();
  };
  form.querySelector('[data-clear-highlight]').onclick = () => {
    const copy = form.querySelector('.cd-part:not([hidden]) .cd-passage-copy');
    copy.querySelectorAll('mark').forEach(mark => mark.replaceWith(...mark.childNodes));
    copy.normalize();
  };
  if (result) return;
  const readAnswers = values => Array.from({ length: answerCount }, (_, index) => values.get('cd-answer-' + index) || '');
  form.addEventListener('input', () => {
    const count = readAnswers(new FormData(form)).filter(answer => answer.trim()).length;
    form.querySelector('.cd-progress').textContent = count + ' / ' + answerCount + ' answered';
  });
  bindForm(modal, async values => {
    await api('assignments/' + assignment.id + '/submit', { answers: readAnswers(values) });
    dashboard = await api('dashboard');
    navigate('/results/' + assignment.id + '/' + user.id, { replace: true });
  });
}

function viewResult(assignmentId, studentId) {
  const a = dashboard.assignments.find(item => item.id === assignmentId);
  const row = dashboard.submissions.find(item => item.assignment === assignmentId && item.student === studentId);
  const student = dashboard.students.find(item => item.id === studentId);
  if (!a || !row) return openModal('Result not found', '');
  if (a.cd) return openCdReading(a, row);
  const passage = a.kind === 'Reading' && (a.hasPdf || a.prompt)
    ? '<details class="cd-editor"><summary>Read the passage again</summary>' +
      (a.hasPdf ? '<a href="/api/assignments/' + a.id + '/pdf" target="_blank" rel="noopener">Open PDF ↗</a>' : '') +
      (a.prompt ? '<div class="prompt">' + esc(a.prompt) + '</div>' : '') + '</details>' : '';
  const route = 'submissions/' + assignmentId + '/' + studentId;
  const breakdown = row.criteria ? JSON.parse(row.criteria) : [];
  const answer = a.questions ? '<div class="cd-review"><table><caption>Answers</caption><thead><tr><th scope="col">Question</th>' +
    '<th scope="col">Submitted answer</th><th scope="col">Answer key</th><th scope="col">Result</th></tr></thead><tbody>' +
    (row.checks || []).map(check => '<tr><th scope="row">' + check.number + '</th><td>' + esc(check.answer || '—') +
      '</td><td>' + esc(check.key) + '</td><td><span class="pill ' + (check.correct ? '' : 'pending') + '">' +
      (check.correct ? 'Correct' : 'Incorrect') + '</span></td></tr>').join('') + '</tbody></table></div>'
    : row.hasAudio ? '<div class="media"><audio controls preload="none" src="/api/' + route + '/audio"></audio></div>'
    : '<div class="prompt">' + esc(row.response) + '</div>';
  const input = (label, name, value) => '<label>' + label + '<input type="number" min="0" max="9" step="0.5" required name="' + name + '" value="' + esc(value) + '"></label>';
  const review = a.questions ? '' : teacher() ? '<form>' +
    (a.kind === 'Writing' ? criteria.map((label, i) => input(label, 'c' + i, breakdown[i])).join('') : input('Speaking band', 'band', row.band)) +
    '<label>Feedback<textarea name="feedback" maxlength="10000">' + esc(row.feedback) + '</textarea></label>' + submitButton('Save score') + '</form>' :
    (breakdown.length ? '<ul>' + criteria.map((label, i) => '<li>' + label + ' · ' + breakdown[i] + '</li>').join('') + '</ul>' : '') +
    (row.feedback ? '<div class="prompt">' + esc(row.feedback) + '</div>' : '');
  openModal(a.title, '<p class="subhead">' + esc(student?.name || a.kind) + '</p><div class="notice">' + esc(score(row, a)) + (a.questions && row.band !== null ? ' · ' + row.raw + ' / ' + a.questions : '') + '</div>' + passage + answer + review);
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
    if (user && !dashboard && !['admin', 'landing', 'login'].includes(route.page)) {
      try {
        dashboard = await api('dashboard');
      } catch (error) {
        location.assign(anchor.href);
        return;
      }
    }
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
    if (key === 'admin-create') editAssignment();
    if (key === 'admin-demo-student') await manageDemoStudent();
    if (key === 'admin-import-reading') importCdReading();
    if (key === 'admin-password') changeAdminPassword();
    if (key === 'admin-logout') {
      await api('admin/logout', {});
      adminAssignments = [];
      adminLogin();
    }
    if (key?.startsWith('admin-edit:') || key?.startsWith('admin-delete:')) {
      const assignment = adminAssignments.find(item => item.id === Number(key.split(':')[1]));
      if (assignment) {
        if (key.startsWith('admin-edit:')) editAssignment(assignment);
        else deleteAssignment(assignment);
      }
    }
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
if (readRoute().page === 'landing') landing();
try {
  if (readRoute().page === 'admin') await loadAdmin();
  else {
    ({ user, demo, maxUpload, providers, oauthLink } = await api('session'));
    if (user && readRoute().page !== 'landing') await refresh();
    else if (readRoute().page !== 'landing' || user) showRoute();
  }
} catch (error) {
  if (readRoute().page !== 'landing') {
    app.innerHTML = '<main class="content"><p class="error" role="alert"></p></main>';
    showError(error);
  }
}
