// ████████████████████████████████████████████████████████████████
// APP.JS — EXAM TRACKER
// PART 1 OF 3 (Sections 1–13)
// ████████████████████████████████████████████████████████████████

// ── SECTION 1: Firebase Init ─────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC1aDvKtiUt_M68BdoCjXtrrV1QH3E6OdA",
  authDomain: "exam-tracker-81038.firebaseapp.com",
  projectId: "exam-tracker-81038",
  storageBucket: "exam-tracker-81038.firebasestorage.app",
  messagingSenderId: "286825354385",
  appId: "1:286825354385:web:586d46ef481cfb1afe9b30"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── SECTION 2: State Variables ───────────────────────────────────
let currentUser      = null;
let exams            = [];
let tags             = [];
let profile          = {};
let settings         = {};
let editId           = null;
let _importQueue     = [];
let sortState        = { column: 'deadlineDate', direction: 1 };
let filterState      = { status: '', tag: '', agency: '', applied: false, search: '' };
let isOffline        = false;
let offlinePollTimer = null;
let activePanelExamId = null;
let activeTabIndex   = 0;
let panelMode        = null; // current panel mode string
let expandedExamIds  = new Set(); // ids of expanded rows/cards

// ── SECTION 3: Constants ─────────────────────────────────────────
const DEFAULT_TAGS = [
  { name: 'Administration', color: '#4f46e5', bg: '#eef2ff' },
  { name: 'Banking',        color: '#0d9488', bg: '#ccfbf1' },
  { name: 'Railway',        color: '#ea580c', bg: '#ffedd5' },
  { name: 'Police',         color: '#1d4ed8', bg: '#dbeafe' },
  { name: 'Defence',        color: '#166534', bg: '#dcfce7' },
  { name: 'Teaching',       color: '#7c3aed', bg: '#ede9fe' },
  { name: 'PSU',            color: '#b45309', bg: '#fef3c7' },
  { name: 'Entrance',       color: '#7c3aed', bg: '#f3e8ff' },
  { name: 'Other',          color: '#555555', bg: '#f3f4f6' }
];

const DEFAULT_EXAMS = [
  { name: 'UPSC CSE',  examType: 'job',      agency: 'UPSC', tagName: 'Administration', website: 'https://upsc.gov.in' },
  { name: 'JEE Mains', examType: 'entrance', agency: 'NTA',  tagName: 'Entrance',       website: 'https://nta.nic.in' },
  { name: 'NEET UG',   examType: 'entrance', agency: 'NTA',  tagName: 'Entrance',       website: 'https://nta.nic.in' }
];

const LS_THEME   = 'gjtTh';
const LS_OFFLINE = 'et_offline';

// Default pattern — UPSC/Gov job style (6 columns, multi-stage)
function DEFAULT_PATTERN_ROWS() {
  return [
    ['Stage', 'Paper', 'Type', 'Duration', 'Marks', 'Remarks'],
    ['Prelims', 'GS Paper I', 'Objective (MCQ)', '2 hrs', '200', 'Counts for merit'],
    ['Prelims', 'GS Paper II (CSAT)', 'Objective (MCQ)', '2 hrs', '200', 'Qualifying — min 33%'],
    ['Mains', 'Essay (Paper I)', 'Descriptive', '3 hrs', '250', 'Counts for merit'],
    ['Mains', 'GS I (Paper II)', 'Descriptive', '3 hrs', '250', 'Counts for merit'],
    ['Mains', 'GS II (Paper III)', 'Descriptive', '3 hrs', '250', 'Counts for merit'],
    ['Mains', 'GS III (Paper IV)', 'Descriptive', '3 hrs', '250', 'Counts for merit'],
    ['Mains', 'GS IV — Ethics (Paper V)', 'Descriptive', '3 hrs', '250', 'Counts for merit'],
    ['Mains', 'Optional Paper I', 'Descriptive', '3 hrs', '250', 'Counts for merit'],
    ['Mains', 'Optional Paper II', 'Descriptive', '3 hrs', '250', 'Counts for merit'],
    ['Interview', 'Personality Test', 'Interview', '30–45 min', '275', 'Final stage'],
    ['', 'TOTAL (Merit)', '', '', '2025', 'Mains 1750 + Interview 275'],
  ];
}

// Default pattern — Entrance exam style (JEE/NEET)
function DEFAULT_ENTRANCE_PATTERN_ROWS() {
  return [
    ['Stage', 'Subject', 'Type', 'Duration', 'Marks', 'Remarks'],
    ['Paper 1', 'Physics', 'Objective (MCQ)', '3 hrs', '100', '25 Qs × 4 marks'],
    ['Paper 1', 'Chemistry', 'Objective (MCQ)', '3 hrs', '100', '25 Qs × 4 marks'],
    ['Paper 1', 'Mathematics / Biology', 'Objective (MCQ)', '3 hrs', '100', '25 Qs × 4 marks'],
    ['', 'TOTAL', '', '3 hrs', '300', '-1 for wrong answer'],
  ];
}

// ── SECTION 4: Utility Functions ─────────────────────────────────
function uid() { return crypto.randomUUID(); }
function now() { return Date.now(); }

function qs(sel, ctx = document) { return ctx.querySelector(sel); }
function qsa(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'className') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('data-')) e.setAttribute(k, v);
    else e[k] = v;
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string') e.appendChild(document.createTextNode(child));
    else e.appendChild(child);
  }
  return e;
}

function svgIcon(path, size = 14) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = path;
  return svg;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── SECTION 5: Firestore Refs + Data Functions ───────────────────
function userRef()       { return db.collection('users').doc(currentUser.uid); }
function examsRef()      { return userRef().collection('exams'); }
function examDocRef(id)  { return examsRef().doc(id); }

async function loadData() {
  setSyncDot('saving');
  const TIMEOUT = 5000;
  try {
    const race = await Promise.race([
      fetchAll(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT))
    ]);
    writeOfflineCache();
    setSyncDot('ok');
    return race;
  } catch (err) {
    const cache = readOfflineCache();
    if (cache) {
      exams    = cache.exams    || [];
      profile  = cache.profile  || {};
      settings = cache.settings || {};
      tags     = cache.tags     || [];
      goOffline();
      render();
    } else {
      hideLoading();
      showScreen('app');
      toast('Unable to load data. Check your connection.', 'err', false);
    }
    setSyncDot('error');
    throw err;
  }
}

async function fetchAll() {
  const [userSnap, examsSnap] = await Promise.all([
    userRef().get(),
    examsRef().get()
  ]);

  if (userSnap.exists) {
    const data = userSnap.data();
    profile  = data.profile  || {};
    settings = data.settings || {};
    tags     = data.tags     || [];
  } else {
    profile  = {};
    settings = {};
    tags     = [];
  }

  exams = [];
  examsSnap.forEach(doc => {
    const data = doc.data();
    if (data.pattern && data.pattern.rowsJson) {
      try { data.pattern = { rows: JSON.parse(data.pattern.rowsJson) }; } catch(e) {}
    }
    if (!data.pattern || !data.pattern.rows) {
      data.pattern = { rows: DEFAULT_PATTERN_ROWS() };
    }
    exams.push(data);
  });

  // Seed defaults for new users
  if (tags.length === 0 && exams.length === 0) {
    await seedDefaults();
  }

  render();
  hideLoading();
  showScreen('app');
}

async function seedDefaults() {
  // Seed tags
  tags = DEFAULT_TAGS.map(t => ({ id: uid(), ...t }));

  // Seed exams
  const batch = db.batch();
  const seededExams = DEFAULT_EXAMS.map(e => {
    const tagObj = tags.find(t => t.name === e.tagName) || {};
    const exam = {
      id: uid(),
      rank: 0,
      examType: e.examType,
      name: e.name,
      agency: e.agency,
      tag: tagObj.id || '',
      posts: '',
      subject: '',
      vacancies: '',
      seats: '',
      deadlineLabel: '',
      deadlineDate: '',
      eligible: 'no',
      age: '',
      fee: '',
      pay: '',
      website: e.website,
      notes: '',
      applied: false,
      pinned: false,
      eligibilityInfo: [],
      pattern: { rows: DEFAULT_PATTERN_ROWS() },
      syllabus: { link: '', curated: [] },
      createdAt: now(),
      updatedAt: now()
    };
    batch.set(examDocRef(exam.id), exam);
    return exam;
  });

  await userRef().set({
    profile: {},
    settings: { defaultSort: 'deadline' },
    tags,
    savedAt: now()
  }, { merge: true });

  await batch.commit();
  exams = seededExams;
}

async function saveExamDoc(exam) {
  exam.updatedAt = now();
  const toSave = { ...exam };
  if (toSave.pattern && toSave.pattern.rows) {
    toSave.pattern = { rowsJson: JSON.stringify(toSave.pattern.rows) };
  }
  await examDocRef(exam.id).set(toSave);
  writeOfflineCache();
}

async function deleteExamDoc(id) {
  await examDocRef(id).delete();
  writeOfflineCache();
}

async function saveUserDoc() {
  await userRef().set({
    profile,
    settings,
    tags,
    savedAt: now()
  }, { merge: true });
  writeOfflineCache();
}

// ── SECTION 6: Offline Cache ──────────────────────────────────────
function writeOfflineCache() {
  try {
    localStorage.setItem(LS_OFFLINE, JSON.stringify({ exams, profile, settings, tags }));
  } catch(e) {}
}

function readOfflineCache() {
  try {
    const raw = localStorage.getItem(LS_OFFLINE);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function goOffline() {
  isOffline = true;
  qs('#offline-banner').classList.add('show');
  disableEditButtons(true);
  hideLoading();
  showScreen('app');
  if (offlinePollTimer) clearInterval(offlinePollTimer);
  offlinePollTimer = setInterval(pollReconnect, 30000);
}

function goOnline() {
  isOffline = false;
  qs('#offline-banner').classList.remove('show');
  disableEditButtons(false);
  if (offlinePollTimer) { clearInterval(offlinePollTimer); offlinePollTimer = null; }
  loadData().catch(() => {});
}

async function pollReconnect() {
  try {
    await userRef().get();
    goOnline();
  } catch(e) {}
}

function disableEditButtons(disabled) {
  qsa('[data-action="add-exam"], [data-action="save-exam"], [data-action="delete-exam"], [data-action="save-elig"], [data-action="save-pattern"], [data-action="save-syllabus"], [data-action="save-profile"]')
    .forEach(b => { b.disabled = disabled; });
}

// ── SECTION 7: Status + Deadline Helpers ─────────────────────────
function diffDays(dateStr) {
  if (!dateStr) return null;
  const now2 = new Date(); now2.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - now2) / 86400000);
}

function computeStatus(exam) {
  if (!exam.deadlineDate) return 'na';
  return diffDays(exam.deadlineDate) >= 0 ? 'open' : 'closed';
}

function deadlineDisplay(exam) {
  const diff = diffDays(exam.deadlineDate);
  const cls  = diff === null ? 'dl-none' : diff < 0 ? 'dl-past' : diff === 0 ? 'dl-today' : diff <= 30 ? 'dl-soon' : 'dl-far';
  const span = el('span', { className: cls });
  if (diff === null) {
    span.textContent = '—';
  } else if (diff === 0) {
    span.textContent = 'TODAY';
  } else {
    span.textContent = fmtDate(exam.deadlineDate);
  }
  return span;
}

// ── SECTION 8: Render Helpers (Pills, Tags, Badges) ──────────────
function makeStatusPill(status) {
  const labels = { open: 'Open', closed: 'Closed', na: 'N/A' };
  const s = el('span', { className: `status-pill ${status}` });
  s.textContent = labels[status] || 'N/A';
  return s;
}

function makeTagPill(tagId) {
  const tag = tags.find(t => t.id === tagId);
  if (!tag) return null;
  const span = el('span', { className: 'tag-pill' });
  span.style.color      = tag.color;
  span.style.background = tag.bg;
  span.textContent      = tag.name;
  return span;
}

function makeEligBadge(eligible, examId) {
  const cls  = eligible === 'yes' ? 'yes' : eligible === 'no' ? 'no' : 'na';
  const text = eligible === 'yes' ? 'Y' : eligible === 'no' ? 'N' : '?';
  const b = el('span', {
    className: `eligible-badge ${cls}`,
    'data-action': 'open-elig-tab',
    'data-id': examId
  });
  b.textContent = text;
  b.title = eligible === 'yes' ? 'Eligible' : eligible === 'no' ? 'Not eligible' : 'Unknown';
  return b;
}

// ── SECTION 9: Main render() + getFiltered() ─────────────────────
function render() {
  updateFilterSelects();
  updateCountdownStrip();
  const filtered = getFiltered();
  renderTable(filtered);
  renderCards(filtered);
  const n = filtered.length;
  const fc = qs('#filter-count');
  if (fc) fc.textContent = `${n} exam${n !== 1 ? 's' : ''}`;
  const active = filterState.status || filterState.tag || filterState.agency || filterState.applied || filterState.search;
  qs('#filter-clear-btn').classList.toggle('show', !!active);
  updateUserDropdown();
}

function getFiltered() {
  let list = [...exams];

  // Search
  if (filterState.search) {
    const q = filterState.search.toLowerCase();
    list = list.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.agency || '').toLowerCase().includes(q) ||
      (tags.find(t => t.id === e.tag)?.name || '').toLowerCase().includes(q)
    );
  }

  // Status
  if (filterState.status) {
    list = list.filter(e => computeStatus(e) === filterState.status);
  }

  // Tag
  if (filterState.tag) {
    list = list.filter(e => e.tag === filterState.tag);
  }

  // Agency
  if (filterState.agency) {
    list = list.filter(e => (e.agency || '') === filterState.agency);
  }

  // Applied
  if (filterState.applied) {
    list = list.filter(e => e.applied);
  }

  // Sort
  list.sort((a, b) => {
    const col = sortState.column;
    let av, bv;
    if (col === 'rank') {
      av = a.rank || 9999; bv = b.rank || 9999;
    } else if (col === 'name') {
      av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase();
    } else if (col === 'agency') {
      av = (a.agency || '').toLowerCase(); bv = (b.agency || '').toLowerCase();
    } else if (col === 'deadlineDate') {
      av = a.deadlineDate || 'zzzzz'; bv = b.deadlineDate || 'zzzzz';
    } else {
      av = 0; bv = 0;
    }
    if (av < bv) return -sortState.direction;
    if (av > bv) return sortState.direction;
    return 0;
  });

  return list;
}

function updateFilterSelects() {
  // Tag select
  const tagSel = qs('#filter-tag');
  if (tagSel) {
    const cur = tagSel.value;
    tagSel.innerHTML = '<option value="">All Tags</option>';
    tags.forEach(t => {
      const o = el('option', { value: t.id });
      o.textContent = t.name;
      tagSel.appendChild(o);
    });
    tagSel.value = cur;
  }

  // Agency select
  const agSel = qs('#filter-agency');
  if (agSel) {
    const cur = agSel.value;
    const agencies = [...new Set(exams.map(e => e.agency).filter(Boolean))].sort();
    agSel.innerHTML = '<option value="">All Agencies</option>';
    agencies.forEach(a => {
      const o = el('option', { value: a });
      o.textContent = a;
      agSel.appendChild(o);
    });
    agSel.value = cur;
  }
}

function updateUserDropdown() {
  const nameEl  = qs('#dd-name');
  const emailEl = qs('#dd-email');
  const eduRow  = qs('#dd-edu-row');
  if (!nameEl) return;
  nameEl.textContent  = profile.name  || currentUser?.displayName || '—';
  emailEl.textContent = profile.email || currentUser?.email        || '—';
  if (eduRow) {
    eduRow.innerHTML = '';
    if (profile.tenth)      { const b = el('span', { className: 'dropdown-edu-badge' }); b.textContent = `10th: ${profile.tenth}`; eduRow.appendChild(b); }
    if (profile.twelfth)    { const b = el('span', { className: 'dropdown-edu-badge' }); b.textContent = `12th: ${profile.twelfth}`; eduRow.appendChild(b); }
    if (profile.graduation) { const b = el('span', { className: 'dropdown-edu-badge' }); b.textContent = `Grad: ${profile.graduation}`; eduRow.appendChild(b); }
  }
}

// ── SECTION 10: Render Table + Cards ─────────────────────────────
// ── Shared expand helpers (used by both table rows and cards) ─────

function buildExpandStatItems(exam) {
  const items = [];
  if (exam.examType === 'job') {
    if (exam.vacancies) items.push(['Vacancies', exam.vacancies]);
    if (exam.pay)       items.push(['Pay Scale', exam.pay]);
    if (exam.posts)     items.push(['Posts', exam.posts]);
  } else {
    if (exam.seats)   items.push(['Seats', exam.seats]);
    if (exam.subject) items.push(['Subject', exam.subject]);
  }
  if (exam.age) items.push(['Age Limit', exam.age]);
  if (exam.fee) items.push(['Fee', exam.fee]);
  return items;
}

function buildExpandStatsGrid(exam, gridClassName) {
  const statItems = buildExpandStatItems(exam);
  const statsGrid = el('div', { className: gridClassName });
  if (statItems.length === 0) {
    const none = el('span', { className: 'expand-empty' });
    none.textContent = 'No extra details added yet.';
    statsGrid.appendChild(none);
  } else {
    statItems.forEach(([k, v]) => {
      const item = el('div', { className: 'expand-stat-item' });
      const key  = el('span', { className: 'expand-stat-key' }); key.textContent = k;
      const val  = el('span', { className: 'expand-stat-val' }); val.textContent = v;
      item.appendChild(key);
      item.appendChild(val);
      statsGrid.appendChild(item);
    });
  }
  return statsGrid;
}

function expandBtnSep() { return el('div', { className: 'expand-btn-sep' }); }

function buildExpandActions(exam, wrapClassName) {
  const actions = el('div', { className: wrapClassName });

  const detailBtn = el('button', { className: 'expand-btn expand-btn-primary', 'data-action': 'open-detail', 'data-id': exam.id });
  detailBtn.appendChild(svgIcon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', 12));
  detailBtn.appendChild(document.createTextNode(' Full Details'));
  actions.appendChild(detailBtn);
  actions.appendChild(expandBtnSep());

  if (!isOffline) {
    const editBtn = el('button', { className: 'expand-btn', 'data-action': 'open-edit', 'data-id': exam.id });
    editBtn.appendChild(svgIcon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', 12));
    editBtn.appendChild(document.createTextNode(' Edit'));
    actions.appendChild(editBtn);
    actions.appendChild(expandBtnSep());
  }

  const pinBtn = el('button', { className: `expand-btn${exam.pinned ? ' expand-btn-pinned' : ''}`, 'data-action': 'toggle-pin', 'data-id': exam.id });
  pinBtn.appendChild(svgIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', 12));
  pinBtn.appendChild(document.createTextNode(exam.pinned ? ' Pinned' : ' Pin'));
  if (isOffline) pinBtn.disabled = true;
  actions.appendChild(pinBtn);

  if (exam.website) {
    actions.appendChild(expandBtnSep());
    const webBtn = el('a', { className: 'expand-btn', href: exam.website, target: '_blank', rel: 'noopener' });
    webBtn.appendChild(svgIcon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 12));
    webBtn.appendChild(document.createTextNode(' Apply'));
    actions.appendChild(webBtn);
  }

  return actions;
}

function buildExpandRow(exam, colspan) {
  const tr = el('tr', { className: 'expand-row' });
  tr.dataset.expandId = exam.id;
  const td = el('td', { className: 'expand-cell', colSpan: String(colspan) });
  const inner = el('div', { className: 'expand-inner' });

  // Info zone: stats + notes side by side
  const info = el('div', { className: 'expand-info' });
  info.appendChild(buildExpandStatsGrid(exam, 'expand-stats'));
  if (exam.notes) {
    const notesEl = el('div', { className: 'expand-notes' });
    notesEl.textContent = exam.notes.length > 120 ? exam.notes.slice(0, 120) + '…' : exam.notes;
    info.appendChild(notesEl);
  }
  inner.appendChild(info);

  // Action bar below
  inner.appendChild(buildExpandActions(exam, 'expand-actions'));
  td.appendChild(inner);
  tr.appendChild(td);
  return tr;
}

function renderTable(list) {
  const tbody = qs('#exam-tbody');
  const empty = qs('#table-empty');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (list.length === 0) {
    empty && empty.classList.remove('hidden');
    const hasFilters = filterState.status || filterState.tag || filterState.agency || filterState.applied || filterState.search;
    const title = qs('#table-empty-title');
    const sub   = qs('#table-empty-sub');
    const addBtn = qs('#table-empty-add-btn');
    if (title) title.textContent = hasFilters ? 'No matches' : 'No exams yet';
    if (sub)   sub.textContent   = hasFilters ? 'Try clearing filters.' : 'Add your first exam to get started.';
    if (addBtn) addBtn.style.display = hasFilters ? 'none' : '';
    return;
  }
  empty && empty.classList.add('hidden');

  list.forEach(exam => {
    const status   = computeStatus(exam);
    const diff     = diffDays(exam.deadlineDate);
    const isExpanded = expandedExamIds.has(exam.id);
    const tr       = el('tr', { className: `exam-tr${isExpanded ? ' row-expanded' : ''}` });
    if (exam.applied) tr.classList.add('applied-row');
    if (exam.examType) tr.classList.add(`type-${exam.examType}`);
    tr.dataset.examId = exam.id;

    // Merged expand-toggle + rank cell
    const tdRankExpand = el('td', { className: 'col-rank-expand' });
    const rankInner = el('div', { className: 'rank-expand-inner' });
    const chevron = el('button', { className: `expand-toggle${isExpanded ? ' open' : ''}`, 'data-action': 'toggle-expand', 'data-id': exam.id, title: isExpanded ? 'Collapse' : 'Expand' });
    chevron.appendChild(svgIcon('<polyline points="6 9 12 15 18 9"/>', 11));
    rankInner.appendChild(chevron);
    if (exam.rank) {
      const rankNum = el('span', { className: 'rank-num' });
      rankNum.textContent = exam.rank;
      rankInner.appendChild(rankNum);
    }
    tdRankExpand.appendChild(rankInner);
    tr.appendChild(tdRankExpand);

    // Name
    const tdName = el('td', { className: 'col-name', 'data-action': 'open-detail', 'data-id': exam.id });
    tdName.textContent = exam.name;
    tr.appendChild(tdName);

    // Agency
    const tdAg = el('td', { className: 'col-agency' });
    tdAg.textContent = exam.agency || '—';
    tr.appendChild(tdAg);

    // Tag
    const tdTag = el('td', { className: 'col-tag' });
    const pill  = makeTagPill(exam.tag);
    if (pill) tdTag.appendChild(pill);
    tr.appendChild(tdTag);

    // Deadline
    const tdDl = el('td', { className: 'col-deadline' });
    tdDl.appendChild(deadlineDisplay(exam));
    if (exam.deadlineLabel) {
      const lbl = el('div', { style: { fontSize: '10px', color: 'var(--muted)', marginTop: '2px', fontFamily: 'var(--mono)' } });
      lbl.textContent = exam.deadlineLabel;
      tdDl.appendChild(lbl);
    }
    tr.appendChild(tdDl);

    // Status
    const tdSt = el('td', { className: 'col-status' });
    tdSt.appendChild(makeStatusPill(status));
    tr.appendChild(tdSt);

    // Eligible
    const tdEl = el('td', { className: 'col-eligible' });
    tdEl.appendChild(makeEligBadge(exam.eligible, exam.id));
    tr.appendChild(tdEl);

    // Apply
    const tdAp = el('td', { className: 'col-apply' });
    if (exam.website) {
      const a = el('a', { className: 'apply-link', href: exam.website, target: '_blank', rel: 'noopener', title: 'Apply / Website' });
      a.appendChild(svgIcon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 12));
      tdAp.appendChild(a);
    }
    const cb = el('input', { type: 'checkbox', className: 'apply-checkbox', 'data-action': 'toggle-applied', 'data-id': exam.id, title: 'Mark applied' });
    cb.checked = !!exam.applied;
    if (isOffline) cb.disabled = true;
    tdAp.appendChild(cb);
    tr.appendChild(tdAp);

    tbody.appendChild(tr);

    // Expanded detail row
    if (isExpanded) {
      tbody.appendChild(buildExpandRow(exam, 9));
    }
  });

  // Update sort arrows
  qsa('#exam-table th.sortable').forEach(th => {
    const col = th.dataset.sort;
    th.classList.toggle('sorted', col === sortState.column);
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) {
      if (col === sortState.column) {
        arrow.textContent = sortState.direction === 1 ? '↑' : '↓';
      } else {
        arrow.textContent = '↕';
      }
    }
  });
}

function renderCards(list) {
  const container  = qs('#exam-cards');
  const emptyCards = qs('#cards-empty');
  if (!container) return;
  container.innerHTML = '';

  if (list.length === 0) {
    emptyCards && emptyCards.classList.remove('hidden');
    const hasFilters = filterState.status || filterState.tag || filterState.agency || filterState.applied || filterState.search;
    const title = qs('#cards-empty-title');
    const sub   = qs('#cards-empty-sub');
    if (title) title.textContent = hasFilters ? 'No matches' : 'No exams yet';
    if (sub)   sub.textContent   = hasFilters ? 'Try clearing filters.' : 'Tap + to add your first exam.';
    return;
  }
  emptyCards && emptyCards.classList.add('hidden');

  list.forEach(exam => {
    const status     = computeStatus(exam);
    const isExpanded = expandedExamIds.has(exam.id);
    const card       = el('div', { className: `exam-card${exam.applied ? ' applied-card' : ''}${isExpanded ? ' card-expanded' : ''}` });

    // Row 1: name + status pill + expand chevron
    const row1 = el('div', { className: 'card-row1' });
    const nameEl = el('div', { className: 'card-name', 'data-action': 'open-detail', 'data-id': exam.id });
    nameEl.textContent = exam.name;
    row1.appendChild(nameEl);
    const row1Right = el('div', { className: 'card-row1-right' });
    row1Right.appendChild(makeStatusPill(status));
    const chevron = el('button', { className: `card-expand-toggle${isExpanded ? ' open' : ''}`, 'data-action': 'toggle-expand', 'data-id': exam.id, title: isExpanded ? 'Collapse' : 'Expand' });
    chevron.appendChild(svgIcon('<polyline points="6 9 12 15 18 9"/>', 13));
    row1Right.appendChild(chevron);
    row1.appendChild(row1Right);
    card.appendChild(row1);

    // Row 2: agency + tag
    const row2 = el('div', { className: 'card-row2' });
    const agEl = el('span', { className: 'card-agency' });
    agEl.textContent = exam.agency || '—';
    row2.appendChild(agEl);
    const pill = makeTagPill(exam.tag);
    if (pill) {
      const sep = el('span', { className: 'card-sep' }); sep.textContent = '•';
      row2.appendChild(sep);
      row2.appendChild(pill);
    }
    card.appendChild(row2);

    // Row 3: deadline
    const row3 = el('div', { className: 'card-row3' });
    row3.appendChild(deadlineDisplay(exam));
    if (exam.deadlineLabel) {
      const lbl = el('span', { style: { color: 'var(--muted)' } });
      lbl.textContent = ' · ' + exam.deadlineLabel;
      row3.appendChild(lbl);
    }
    card.appendChild(row3);

    // Row 4: eligible badge + apply link + applied checkbox
    const row4 = el('div', { className: 'card-row4' });
    row4.appendChild(makeEligBadge(exam.eligible, exam.id));

    if (exam.website) {
      const a = el('a', { className: 'apply-link', href: exam.website, target: '_blank', rel: 'noopener', title: 'Apply / Website' });
      a.appendChild(svgIcon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 12));
      row4.appendChild(a);
    }

    const cb = el('input', { type: 'checkbox', className: 'apply-checkbox', 'data-action': 'toggle-applied', 'data-id': exam.id, title: 'Mark applied' });
    cb.checked = !!exam.applied;
    if (isOffline) cb.disabled = true;
    row4.appendChild(cb);

    card.appendChild(row4);

    // Expandable section
    if (isExpanded) {
      const expSection = el('div', { className: 'card-expand-body' });
      expSection.appendChild(buildExpandStatsGrid(exam, 'card-expand-stats'));

      if (exam.notes) {
        const notesEl = el('div', { className: 'expand-notes' });
        notesEl.textContent = exam.notes.length > 100 ? exam.notes.slice(0, 100) + '…' : exam.notes;
        expSection.appendChild(notesEl);
      }

      expSection.appendChild(buildExpandActions(exam, 'card-expand-actions'));
      card.appendChild(expSection);
    }

    container.appendChild(card);
  });
}

// ── SECTION 11: Render Countdown ─────────────────────────────────
function updateCountdownStrip() {
  const strip = qs('#countdown-strip');
  if (!strip) return;

  // Auto-unpin exams with deadline < -1 day
  exams.forEach(e => {
    if (e.pinned && e.deadlineDate) {
      const d = diffDays(e.deadlineDate);
      if (d !== null && d < -1) {
        e.pinned = false;
        if (!isOffline) saveExamDoc(e).catch(() => {});
      }
    }
  });

  const pinned = exams.filter(e => e.pinned);
  strip.innerHTML = '';

  if (pinned.length === 0) {
    strip.classList.remove('show');
    return;
  }
  strip.classList.add('show');

  pinned.forEach(exam => {
    const diff = diffDays(exam.deadlineDate);
    let circleClass = 'far';
    if (diff !== null && diff === 0) circleClass = 'today';
    else if (diff !== null && diff <= 30) circleClass = 'soon';

    const card = el('div', { className: 'countdown-card', 'data-action': 'open-detail', 'data-id': exam.id });

    const circle = el('div', { className: `countdown-circle ${circleClass}` });
    const num = el('div', { className: 'countdown-num' });
    num.textContent = diff === null ? '?' : diff === 0 ? '0' : String(Math.abs(diff));
    const unit = el('div', { className: 'countdown-unit' });
    unit.textContent = 'days';
    circle.appendChild(num);
    circle.appendChild(unit);

    const info = el('div', { className: 'countdown-info' });
    const nameEl = el('div', { className: 'countdown-name' });
    nameEl.textContent = exam.name;
    const sub = el('div', { className: 'countdown-sub' });
    sub.textContent = diff === null ? 'No date' : diff === 0 ? 'Today!' : diff > 0 ? `${diff} days left` : 'Closed';
    info.appendChild(nameEl);
    info.appendChild(sub);

    card.appendChild(circle);
    card.appendChild(info);
    strip.appendChild(card);
  });
}

// ── SECTION 12: Filter + Sort Controls ───────────────────────────
function initFilterControls() {
  const statusSel  = qs('#filter-status');
  const tagSel     = qs('#filter-tag');
  const agencySel  = qs('#filter-agency');
  const appliedCb  = qs('#filter-applied');
  const searchInp  = qs('#search-input');

  if (statusSel) statusSel.addEventListener('change', () => { filterState.status = statusSel.value; render(); });
  if (tagSel)    tagSel.addEventListener('change',    () => { filterState.tag    = tagSel.value;    render(); });
  if (agencySel) agencySel.addEventListener('change', () => { filterState.agency = agencySel.value; render(); });
  if (appliedCb) appliedCb.addEventListener('change', () => { filterState.applied = appliedCb.checked; render(); });
  if (searchInp) searchInp.addEventListener('input',  () => { filterState.search = searchInp.value.trim(); render(); });

  // Table header sort clicks
  qsa('#exam-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortState.column === col) {
        sortState.direction *= -1;
      } else {
        sortState.column    = col;
        sortState.direction = 1;
      }
      render();
    });
  });
}

// ── SECTION 13: Panel System ──────────────────────────────────────
function openPanel(buildFn) {
  const panel   = qs('#side-panel');
  const overlay = qs('#panel-overlay');
  const inner   = qs('#panel-inner');

  // Clear old content
  while (panel.firstChild) panel.removeChild(panel.firstChild);
  const newInner = el('div', { style: { display: 'contents' } });
  newInner.id = 'panel-inner';
  panel.appendChild(newInner);

  buildFn(newInner);

  overlay.classList.add('open');
  requestAnimationFrame(() => {
    panel.classList.add('open');
    requestAnimationFrame(() => overlay.classList.add('visible'));
  });
}

function closePanel() {
  const panel   = qs('#side-panel');
  const overlay = qs('#panel-overlay');
  panel.classList.remove('open');
  overlay.classList.remove('visible');
  setTimeout(() => {
    overlay.classList.remove('open');
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    const newInner = el('div', { style: { display: 'contents' } });
    newInner.id = 'panel-inner';
    panel.appendChild(newInner);
    activePanelExamId = null;
    panelMode = null;
  }, 280);
}

function makePanelHeader(metaChildren = []) {
  const header = el('div', { className: 'panel-header' });
  const meta   = el('div', { className: 'panel-header-meta' });
  metaChildren.forEach(c => c && meta.appendChild(c));
  header.appendChild(meta);
  const closeBtn = el('button', { className: 'panel-close', 'data-action': 'close-panel', title: 'Close' });
  closeBtn.appendChild(svgIcon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 16));
  header.appendChild(closeBtn);
  return header;
}

function makePanelFooter(buttons) {
  const footer = el('div', { className: 'panel-footer' });
  buttons.forEach(b => {
    if (b === 'spacer') {
      footer.appendChild(el('span', { className: 'spacer' }));
    } else {
      footer.appendChild(b);
    }
  });
  return footer;
}

function switchTab(idx) {
  activeTabIndex = idx;
  const panel = qs('#side-panel');
  qsa('.panel-tab', panel).forEach((t, i) => t.classList.toggle('active', i === idx));
  qsa('.tab-content', panel).forEach((c, i) => c.classList.toggle('active', i === idx));
}

// ████████████████████████████████████████████████████████████████
// END OF PART 1
// ████████████████████████████████████████████████████████████████

// ████████████████████████████████████████████████████████████████
// APP.JS — EXAM TRACKER
// PART 2 OF 3 (Sections 14–21)
// ████████████████████████████████████████████████████████████████

// ── SECTION 14: Detail Panel (DOM-built) ─────────────────────────
function openDetail(id) {
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  activePanelExamId = id;
  activeTabIndex    = 0;
  panelMode         = 'detail';

  openPanel(container => {
    const status = computeStatus(exam);

    // Header
    const metaItems = [];
    const tagPill   = makeTagPill(exam.tag);
    if (tagPill) metaItems.push(tagPill);
    metaItems.push(makeStatusPill(status));
    metaItems.push(makeEligBadge(exam.eligible, exam.id));

    const pinBtn = el('button', { className: `pin-btn${exam.pinned ? ' pinned' : ''}`, 'data-action': 'toggle-pin', 'data-id': exam.id, title: exam.pinned ? 'Unpin' : 'Pin to countdown' });
    pinBtn.textContent = exam.pinned ? '★' : '☆';
    metaItems.push(pinBtn);

    container.appendChild(makePanelHeader(metaItems));

    // Title block
    const titleBlock = el('div', { className: 'panel-title-block' });
    const titleEl    = el('div', { className: 'panel-title' });
    titleEl.textContent = exam.name;
    const subEl = el('div', { className: 'panel-sub' });
    subEl.textContent   = exam.agency || '';
    titleBlock.appendChild(titleEl);
    if (exam.agency) titleBlock.appendChild(subEl);
    container.appendChild(titleBlock);

    // Tabs
    const tabs     = el('div', { className: 'panel-tabs' });
    const tabNames = ['Overview', 'Eligibility', 'Pattern', 'Syllabus'];
    tabNames.forEach((name, i) => {
      const t = el('button', { className: `panel-tab${i === 0 ? ' active' : ''}`, 'data-action': 'switch-tab', 'data-tab': String(i) });
      t.textContent = name;
      tabs.appendChild(t);
    });
    container.appendChild(tabs);

    // Body (scrollable)
    const body = el('div', { className: 'panel-body' });

    // ── Tab 0: Overview ──
    const tab0 = el('div', { className: 'tab-content active' });
    const overviewRows = [];

    // Deadline
    const diff = diffDays(exam.deadlineDate);
    const dlRow = makeDetailRow('Deadline', null);
    const dlVal = dlRow.querySelector('.detail-value');
    dlVal.appendChild(deadlineDisplay(exam));
    if (exam.deadlineLabel) {
      dlVal.appendChild(document.createTextNode(' · ' + exam.deadlineLabel));
    }
    if (diff !== null) {
      const daysLeft = el('span', { style: { marginLeft: '6px', color: 'var(--muted)', fontSize: '11px' } });
      daysLeft.textContent = diff === 0 ? '(today)' : diff > 0 ? `(${diff} days left)` : `(${Math.abs(diff)} days ago)`;
      dlVal.appendChild(daysLeft);
    }
    tab0.appendChild(dlRow);

    // Type-specific fields
    if (exam.examType === 'job') {
      if (exam.posts)     tab0.appendChild(makeDetailRow('Posts', exam.posts));
      if (exam.vacancies) tab0.appendChild(makeDetailRow('Vacancies', exam.vacancies));
      if (exam.pay)       tab0.appendChild(makeDetailRow('Pay Scale', exam.pay));
    } else {
      if (exam.subject)   tab0.appendChild(makeDetailRow('Subject', exam.subject));
      if (exam.seats)     tab0.appendChild(makeDetailRow('Seats', exam.seats));
    }

    if (exam.age)     tab0.appendChild(makeDetailRow('Age Limit', exam.age));
    if (exam.fee)     tab0.appendChild(makeDetailRow('Fee', exam.fee));

    // Website
    if (exam.website) {
      const wr = makeDetailRow('Website', null);
      const wv = wr.querySelector('.detail-value');
      const wa = el('a', { href: exam.website, target: '_blank', rel: 'noopener' });
      wa.textContent = exam.website;
      wv.appendChild(wa);
      tab0.appendChild(wr);
    }

    if (exam.notes) tab0.appendChild(makeDetailRow('Notes', exam.notes));

    const appliedRow = makeDetailRow('Applied', null);
    const appliedVal = appliedRow.querySelector('.detail-value');
    const appliedToggle = el('button', { className: `btn btn-sm ${exam.applied ? 'btn-accent' : 'btn-ghost'}`, 'data-action': 'toggle-applied-detail', 'data-id': exam.id });
    appliedToggle.textContent = exam.applied ? '✓ Applied' : 'Mark as Applied';
    if (isOffline) appliedToggle.disabled = true;
    appliedVal.appendChild(appliedToggle);
    tab0.appendChild(appliedRow);

    body.appendChild(tab0);

    // ── Tab 1: Eligibility ──
    const tab1 = el('div', { className: 'tab-content' });
    buildEligibilityView(tab1, exam);
    body.appendChild(tab1);

    // ── Tab 2: Pattern ──
    const tab2 = el('div', { className: 'tab-content' });
    buildPatternView(tab2, exam);
    body.appendChild(tab2);

    // ── Tab 3: Syllabus ──
    const tab3 = el('div', { className: 'tab-content' });
    buildSyllabusView(tab3, exam);
    body.appendChild(tab3);

    container.appendChild(body);

    // Footer
    const editBtn = el('button', { className: 'btn btn-ghost', 'data-action': 'open-edit', 'data-id': exam.id });
    editBtn.appendChild(svgIcon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'));
    editBtn.appendChild(document.createTextNode(' Edit'));
    if (isOffline) editBtn.disabled = true;

    const delBtn = el('button', { className: 'btn btn-danger', 'data-action': 'delete-exam', 'data-id': exam.id });
    delBtn.appendChild(svgIcon('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>'));
    delBtn.appendChild(document.createTextNode(' Delete'));
    if (isOffline) delBtn.disabled = true;

    container.appendChild(makePanelFooter([editBtn, 'spacer', delBtn]));
  });
}

function makeDetailRow(label, value) {
  const row  = el('div', { className: 'detail-row' });
  const lbl  = el('div', { className: 'detail-label' });
  lbl.textContent = label;
  const val  = el('div', { className: 'detail-value' });
  if (value !== null) val.textContent = value || '—';
  row.appendChild(lbl);
  row.appendChild(val);
  return row;
}

function buildEligibilityView(container, exam) {
  const info = Array.isArray(exam.eligibilityInfo) ? exam.eligibilityInfo : [];
  if (info.length === 0) {
    const empty = el('div', { style: { padding: '16px', color: 'var(--muted)', fontSize: '12px' } });
    empty.textContent = 'No eligibility info added yet.';
    container.appendChild(empty);
  } else {
    const grid = el('div', { className: 'elig-grid' });
    info.forEach(row => {
      const r = makeDetailRow(row.label || '', row.value || '—');
      grid.appendChild(r);
    });
    container.appendChild(grid);
  }
  const editBtn = el('button', { className: 'btn btn-ghost btn-sm', 'data-action': 'open-elig-edit', 'data-id': exam.id, style: { margin: '12px 16px' } });
  editBtn.textContent = 'Edit Eligibility';
  if (isOffline) editBtn.disabled = true;
  container.appendChild(editBtn);
}

function buildPatternView(container, exam) {
  const rows = exam.pattern?.rows || [];
  if (rows.length < 2) {
    const empty = el('div', { style: { padding: '16px', color: 'var(--muted)', fontSize: '12px' } });
    empty.textContent = 'No pattern info added yet.';
    container.appendChild(empty);
  } else {
    const wrap  = el('div', { className: 'pattern-table-wrap', style: { margin: '12px 16px 0' } });
    const table = el('table', { className: 'pattern-table' });
    rows.forEach((row, ri) => {
      const tr = el('tr');
      row.forEach(cell => {
        const td = ri === 0 ? el('th') : el('td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    container.appendChild(wrap);
  }
  const editBtn = el('button', { className: 'btn btn-ghost btn-sm', 'data-action': 'open-pat-edit', 'data-id': exam.id, style: { margin: '12px 16px' } });
  editBtn.textContent = 'Edit Pattern';
  if (isOffline) editBtn.disabled = true;
  container.appendChild(editBtn);
}

function buildSyllabusView(container, exam) {
  const syl = exam.syllabus || {};
  if (syl.link) {
    const lr = el('div', { className: 'syllabus-link-row' });
    const la = el('a', { href: syl.link, target: '_blank', rel: 'noopener' });
    la.textContent = 'Official Syllabus PDF / Link';
    lr.appendChild(svgIcon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 13));
    lr.appendChild(la);
    container.appendChild(lr);
  }
  const curated = syl.curated || [];
  if (curated.length === 0 && !syl.link) {
    const empty = el('div', { style: { padding: '16px', color: 'var(--muted)', fontSize: '12px' } });
    empty.textContent = 'No syllabus info added yet.';
    container.appendChild(empty);
  }
  curated.forEach(sec => {
    const section = el('div', { className: 'syllabus-section' });
    const head    = el('div', { className: 'syllabus-head' });
    head.textContent = sec.head || 'Section';
    section.appendChild(head);
    const items = el('div', { className: 'syllabus-items' });
    (sec.items || []).forEach(item => {
      const i = el('div', { className: 'syllabus-item' });
      i.textContent = item;
      items.appendChild(i);
    });
    section.appendChild(items);
    container.appendChild(section);
  });
  const editBtn = el('button', { className: 'btn btn-ghost btn-sm', 'data-action': 'open-syl-edit', 'data-id': exam.id, style: { margin: '12px 16px' } });
  editBtn.textContent = 'Edit Syllabus';
  if (isOffline) editBtn.disabled = true;
  container.appendChild(editBtn);
}

// ── SECTION 15: Add/Edit Exam Form (DOM-built) ───────────────────
function openAddExam() {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  editId    = null;
  panelMode = 'add';
  openPanel(container => {
    container.appendChild(makePanelHeader([
      (() => { const t = el('span', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text)' } }); t.textContent = 'Add Exam'; return t; })()
    ]));
    // Type selector
    const body = el('div', { className: 'panel-body' });
    const sel  = el('div', { className: 'type-selector' });

    const jobCard = el('button', { className: 'type-card', 'data-action': 'select-type', 'data-type': 'job' });
    const jobIcon = el('span', { className: 'type-icon' }); jobIcon.textContent = '🏛️';
    const jobLbl  = el('span', { className: 'type-label' }); jobLbl.textContent = 'Government Job';
    const jobDesc = el('span', { className: 'type-desc' });  jobDesc.textContent = 'UPSC, SSC, PSC, Banking…';
    jobCard.appendChild(jobIcon); jobCard.appendChild(jobLbl); jobCard.appendChild(jobDesc);

    const entCard = el('button', { className: 'type-card', 'data-action': 'select-type', 'data-type': 'entrance' });
    const entIcon = el('span', { className: 'type-icon' }); entIcon.textContent = '📚';
    const entLbl  = el('span', { className: 'type-label' }); entLbl.textContent = 'Entrance Exam';
    const entDesc = el('span', { className: 'type-desc' });  entDesc.textContent = 'JEE, NEET, CUET…';
    entCard.appendChild(entIcon); entCard.appendChild(entLbl); entCard.appendChild(entDesc);

    sel.appendChild(jobCard);
    sel.appendChild(entCard);
    body.appendChild(sel);
    container.appendChild(body);

    const cancelBtn = el('button', { className: 'btn btn-ghost', 'data-action': 'close-panel' });
    cancelBtn.textContent = 'Cancel';
    container.appendChild(makePanelFooter([cancelBtn, 'spacer']));
  });
}

function selectExamType(type) {
  openExamForm(type, null);
}

function openEditExam(id) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  editId    = id;
  panelMode = 'edit';
  openExamForm(exam.examType, exam);
}

function openExamForm(type, exam) {
  openPanel(container => {
    const isEdit = !!exam;
    container.appendChild(makePanelHeader([
      (() => { const t = el('span', { style: { fontSize: '13px', fontWeight: '600' } }); t.textContent = isEdit ? 'Edit Exam' : `Add ${type === 'job' ? 'Government Job' : 'Entrance Exam'}`; return t; })()
    ]));

    const body = el('div', { className: 'panel-body' });
    const form = el('div', { className: 'panel-form' });

    // Basic fields
    form.appendChild(makeFormSection('Basic Info'));
    form.appendChild(makeFormField('name',  'Name *',   'text',   exam?.name   || '', 'e.g. UPSC CSE 2025'));
    form.appendChild(makeFormField('agency','Agency *', 'text',   exam?.agency || '', 'e.g. UPSC'));

    // Tag select
    const tagField = el('div', { className: 'form-field' });
    const tagLabel = el('label', { className: 'form-label', htmlFor: 'f-tag' }); tagLabel.textContent = 'Tag';
    const tagSel   = el('select', { className: 'form-select', id: 'f-tag' });
    const emptyOpt = el('option', { value: '' }); emptyOpt.textContent = '— No tag —';
    tagSel.appendChild(emptyOpt);
    tags.forEach(t => {
      const o = el('option', { value: t.id });
      o.textContent = t.name;
      if (exam?.tag === t.id) o.selected = true;
      tagSel.appendChild(o);
    });
    const tagManageLink = el('button', { className: 'btn-link', 'data-action': 'open-tags-manager', style: { marginTop: '4px', fontSize: '11px' } });
    tagManageLink.textContent = 'Manage Tags';
    tagField.appendChild(tagLabel);
    tagField.appendChild(tagSel);
    tagField.appendChild(tagManageLink);
    form.appendChild(tagField);

    // Eligible
    const eligField = el('div', { className: 'form-field' });
    const eligLabel = el('label', { className: 'form-label', htmlFor: 'f-eligible' }); eligLabel.textContent = 'Eligible';
    const eligSel   = el('select', { className: 'form-select', id: 'f-eligible' });
    [['no','No'],['yes','Yes']].forEach(([v,t]) => {
      const o = el('option', { value: v }); o.textContent = t;
      if ((exam?.eligible || 'no') === v) o.selected = true;
      eligSel.appendChild(o);
    });
    eligField.appendChild(eligLabel);
    eligField.appendChild(eligSel);
    form.appendChild(eligField);

    form.appendChild(makeFormField('rank', 'Rank / Priority', 'number', exam?.rank || '', 'Lower = higher priority'));

    form.appendChild(makeFormSection('Deadline'));
    form.appendChild(makeFormField('deadlineDate',  'Deadline Date',  'date', exam?.deadlineDate  || '', ''));
    form.appendChild(makeFormField('deadlineLabel', 'Deadline Label', 'text', exam?.deadlineLabel || '', 'e.g. Last date to apply'));

    form.appendChild(makeFormSection('Details'));
    form.appendChild(makeFormField('vacancies', 'Vacancies', 'text', exam?.vacancies || '', ''));
    form.appendChild(makeFormField('age',  'Age Limit', 'text', exam?.age  || '', 'e.g. 21–32 years'));
    form.appendChild(makeFormField('fee',  'Fee',       'text', exam?.fee  || '', 'e.g. ₹100 (UR), Free (SC/ST)'));

    // Type-specific
    if (type === 'job') {
      form.appendChild(makeFormField('pay',   'Pay Scale', 'text', exam?.pay   || '', 'e.g. Level-10'));
      form.appendChild(makeFormField('posts', 'Posts',     'text', exam?.posts || '', 'e.g. Assistant Commandant'));
    } else {
      form.appendChild(makeFormField('subject', 'Subject',       'text', exam?.subject || '', 'e.g. Engineering'));
      form.appendChild(makeFormField('seats',   'Seats / Intake', 'text', exam?.seats   || '', ''));
    }

    form.appendChild(makeFormField('website', 'Website', 'url',  exam?.website || '', 'https://'));
    form.appendChild(makeFormTextarea('notes', 'Notes', exam?.notes || '', 'Any notes…'));

    body.appendChild(form);
    container.appendChild(body);

    const cancelBtn = el('button', { className: 'btn btn-ghost', 'data-action': 'close-panel' });
    cancelBtn.textContent = 'Cancel';
    const saveBtn = el('button', { className: 'btn btn-accent', 'data-action': 'save-exam' });
    saveBtn.textContent = isEdit ? 'Save Changes' : 'Save Exam';

    container.appendChild(makePanelFooter([cancelBtn, 'spacer', saveBtn]));

    // Store type for save function
    container.dataset.examType = type;
  });
}

function makeFormSection(title) {
  const div = el('div', { className: 'form-section-title' });
  div.textContent = title;
  return div;
}

function makeFormField(id, label, type, value, placeholder) {
  const field = el('div', { className: 'form-field' });
  const lbl   = el('label', { className: 'form-label', htmlFor: `f-${id}` });
  lbl.textContent = label;
  const inp   = el('input', { className: 'form-input', type, id: `f-${id}`, value, placeholder });
  field.appendChild(lbl);
  field.appendChild(inp);
  return field;
}

function makeFormTextarea(id, label, value, placeholder) {
  const field = el('div', { className: 'form-field' });
  const lbl   = el('label', { className: 'form-label', htmlFor: `f-${id}` });
  lbl.textContent = label;
  const ta    = el('textarea', { className: 'form-textarea', id: `f-${id}`, placeholder, rows: 3 });
  ta.textContent = value;
  field.appendChild(lbl);
  field.appendChild(ta);
  return field;
}

function getFormVal(id) {
  const el2 = qs(`#f-${id}`);
  return el2 ? el2.value.trim() : '';
}

async function saveExamForm() {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const panel   = qs('#side-panel');
  const type    = panel?.dataset.examType || 'job';
  const name    = getFormVal('name');
  const agency  = getFormVal('agency');
  if (!name)   { toast('Name is required.', 'err'); return; }
  if (!agency) { toast('Agency is required.', 'err'); return; }

  setSyncDot('saving');
  try {
    let exam;
    if (editId) {
      exam = exams.find(e => e.id === editId);
      if (!exam) return;
    } else {
      exam = {
        id: uid(),
        examType: type,
        applied: false,
        pinned: false,
        eligibilityInfo: [],
        pattern: { rows: type === 'entrance' ? DEFAULT_ENTRANCE_PATTERN_ROWS() : DEFAULT_PATTERN_ROWS() },
        syllabus: { link: '', curated: [] },
        createdAt: now()
      };
    }

    exam.name          = name;
    exam.agency        = agency;
    exam.tag           = getFormVal('tag') || '';
    exam.eligible      = qs('#f-eligible')?.value || 'no';
    exam.rank          = parseInt(getFormVal('rank')) || 0;
    exam.deadlineDate  = getFormVal('deadlineDate');
    exam.deadlineLabel = getFormVal('deadlineLabel');
    exam.vacancies     = getFormVal('vacancies');
    exam.age           = getFormVal('age');
    exam.fee           = getFormVal('fee');
    exam.website       = getFormVal('website');
    exam.notes         = getFormVal('notes');

    if (type === 'job') {
      exam.pay   = getFormVal('pay');
      exam.posts = getFormVal('posts');
    } else {
      exam.subject = getFormVal('subject');
      exam.seats   = getFormVal('seats');
    }

    await saveExamDoc(exam);

    if (editId) {
      const idx = exams.findIndex(e => e.id === editId);
      if (idx !== -1) exams[idx] = exam;
    } else {
      exams.push(exam);
    }

    setSyncDot('ok');
    toast(editId ? 'Saved' : 'Exam added');
    closePanel();
    render();
  } catch(e) {
    setSyncDot('error');
    toast('Save failed. Check connection.', 'err');
  }
}

// ── SECTION 16: Eligibility Editor (DOM-built) ───────────────────
function openEligibilityEdit(id) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  activePanelExamId = id;
  panelMode = 'elig';

  // Ensure array, seed defaults if empty
  let rows = Array.isArray(exam.eligibilityInfo) && exam.eligibilityInfo.length > 0
    ? exam.eligibilityInfo.map(r => ({ label: r.label || '', value: r.value || '' }))
    : [
        { label: 'Domicile', value: '' },
        { label: 'Age', value: '' },
        { label: 'Qualification', value: '' },
        { label: 'Physical', value: '' },
        { label: 'Other Notes', value: '' }
      ];

  openPanel(container => {
    container.appendChild(makePanelHeader([
      (() => { const t = el('span', { style: { fontSize: '13px', fontWeight: '600' } }); t.textContent = 'Edit Eligibility'; return t; })()
    ]));

    const body   = el('div', { className: 'panel-body' });
    const editor = el('div', { className: 'elig-editor', id: 'elig-editor' });

    function buildRows() {
      editor.innerHTML = '';
      rows.forEach((row, i) => {
        const rowEl     = el('div', { className: 'elig-row' });
        const labelInp  = el('input', { type: 'text', className: 'elig-label-input', value: row.label, placeholder: 'Label' });
        labelInp.addEventListener('input', () => { rows[i].label = labelInp.value; });
        const valInp    = el('input', { type: 'text', className: 'elig-val-input', value: row.value, placeholder: 'Value' });
        valInp.addEventListener('input', () => { rows[i].value = valInp.value; });
        const delBtn    = el('button', { className: 'elig-row-del', title: 'Remove row' });
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => { rows.splice(i, 1); buildRows(); });
        rowEl.appendChild(labelInp);
        rowEl.appendChild(valInp);
        rowEl.appendChild(delBtn);
        editor.appendChild(rowEl);
      });
      const addBtn = el('button', { className: 'btn btn-ghost btn-sm', style: { marginTop: '8px' } });
      addBtn.textContent = '+ Add Field';
      addBtn.addEventListener('click', () => { rows.push({ label: '', value: '' }); buildRows(); });
      editor.appendChild(addBtn);
    }

    buildRows();
    body.appendChild(editor);
    container.appendChild(body);

    const cancelBtn = el('button', { className: 'btn btn-ghost', 'data-action': 'close-panel' });
    cancelBtn.textContent = 'Cancel';
    const saveBtn = el('button', { className: 'btn btn-accent' });
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
      setSyncDot('saving');
      try {
        exam.eligibilityInfo = rows.map(r => ({ label: r.label, value: r.value }));
        await saveExamDoc(exam);
        const idx = exams.findIndex(e => e.id === exam.id);
        if (idx !== -1) exams[idx] = exam;
        setSyncDot('ok');
        toast('Saved');
        openDetail(exam.id);
        setTimeout(() => switchTab(1), 50);
      } catch(e) {
        setSyncDot('error');
        toast('Save failed. Check connection.', 'err');
      }
    });
    container.appendChild(makePanelFooter([cancelBtn, 'spacer', saveBtn]));
  });
}

// ── SECTION 17: Pattern Editor (DOM-built) ───────────────────────
function openPatternEdit(id) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  activePanelExamId = id;
  panelMode = 'pattern';

  let rows = (exam.pattern?.rows && exam.pattern.rows.length > 0 ? exam.pattern.rows : (exam.examType === 'entrance' ? DEFAULT_ENTRANCE_PATTERN_ROWS() : DEFAULT_PATTERN_ROWS()))
    .map(r => [...r]);

  openPanel(container => {
    container.appendChild(makePanelHeader([
      (() => { const t = el('span', { style: { fontSize: '13px', fontWeight: '600' } }); t.textContent = 'Edit Pattern'; return t; })()
    ]));

    const body   = el('div', { className: 'panel-body' });
    const editor = el('div', { className: 'pattern-editor', id: 'pattern-editor' });

    function buildGrid() {
      editor.innerHTML = '';
      const grid = el('div', { className: 'pattern-grid' });

      // Column controls header
      const colCtrlRow = el('div', { className: 'pattern-row', style: { marginBottom: '4px' } });
      const spacerEl   = el('div', { style: { flex: '1 0 0', minWidth: '60px', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', textAlign: 'center' } });
      spacerEl.textContent = 'COLS';
      colCtrlRow.appendChild(spacerEl);
      const addColBtn = el('button', { className: 'btn btn-ghost btn-sm' });
      addColBtn.textContent = '+ Col';
      addColBtn.addEventListener('click', () => { rows.forEach(r => r.push('')); buildGrid(); });
      const delColBtn = el('button', { className: 'btn btn-ghost btn-sm' });
      delColBtn.textContent = '− Col';
      delColBtn.addEventListener('click', () => {
        if ((rows[0]?.length || 0) > 1) { rows.forEach(r => r.pop()); buildGrid(); }
      });
      colCtrlRow.appendChild(addColBtn);
      colCtrlRow.appendChild(delColBtn);
      colCtrlRow.appendChild(el('div', { style: { width: '24px' } })); // placeholder for row-del
      grid.appendChild(colCtrlRow);

      rows.forEach((row, ri) => {
        const rowEl = el('div', { className: 'pattern-row' });
        row.forEach((cell, ci) => {
          const inp = el('input', { type: 'text', className: 'pattern-cell-input', value: cell, placeholder: '…' });
          inp.addEventListener('input', () => { rows[ri][ci] = inp.value; });
          rowEl.appendChild(inp);
        });
        const delBtn = el('button', { className: 'pattern-row-del', title: 'Remove row' });
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => { rows.splice(ri, 1); buildGrid(); });
        rowEl.appendChild(delBtn);
        grid.appendChild(rowEl);
      });

      const addRowBtn = el('button', { className: 'btn btn-ghost btn-sm', style: { marginTop: '8px' } });
      addRowBtn.textContent = '+ Add Row';
      addRowBtn.addEventListener('click', () => {
        const numCols = rows[0]?.length || 4;
        rows.push(Array(numCols).fill(''));
        buildGrid();
      });

      editor.appendChild(grid);
      editor.appendChild(addRowBtn);
    }

    buildGrid();
    body.appendChild(editor);
    container.appendChild(body);

    const cancelBtn = el('button', { className: 'btn btn-ghost', 'data-action': 'close-panel' });
    cancelBtn.textContent = 'Cancel';

    const resetBtn = el('button', { className: 'btn btn-ghost' });
    resetBtn.textContent = '↺ Reset Default';
    resetBtn.title = 'Reset to UPSC-style default pattern';
    resetBtn.addEventListener('click', () => {
      const isEntrance = exam.examType === 'entrance';
      rows = isEntrance ? DEFAULT_ENTRANCE_PATTERN_ROWS() : DEFAULT_PATTERN_ROWS();
      buildGrid();
    });

    const saveBtn = el('button', { className: 'btn btn-accent' });
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
      setSyncDot('saving');
      try {
        exam.pattern = { rows };
        await saveExamDoc(exam);
        const idx = exams.findIndex(e => e.id === exam.id);
        if (idx !== -1) exams[idx] = exam;
        setSyncDot('ok');
        toast('Saved');
        openDetail(exam.id);
        setTimeout(() => switchTab(2), 50);
      } catch(e) {
        setSyncDot('error');
        toast('Save failed. Check connection.', 'err');
      }
    });
    container.appendChild(makePanelFooter([cancelBtn, resetBtn, 'spacer', saveBtn]));
  });
}

// ── SECTION 18: Syllabus Editor (DOM-built) ──────────────────────
function openSyllabusEdit(id) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  activePanelExamId = id;
  panelMode = 'syllabus';

  let syllLink = exam.syllabus?.link || '';
  let sections = (exam.syllabus?.curated || []).map(s => ({
    head: s.head || '',
    items: [...(s.items || [])]
  }));

  openPanel(container => {
    container.appendChild(makePanelHeader([
      (() => { const t = el('span', { style: { fontSize: '13px', fontWeight: '600' } }); t.textContent = 'Edit Syllabus'; return t; })()
    ]));

    const body   = el('div', { className: 'panel-body' });
    const editor = el('div', { className: 'syllabus-editor', id: 'syl-editor' });

    // Link field
    const linkField = el('div', { className: 'form-field' });
    const linkLabel = el('label', { className: 'form-label', htmlFor: 'syl-link' }); linkLabel.textContent = 'Official Link';
    const linkInp   = el('input', { type: 'url', className: 'form-input', id: 'syl-link', value: syllLink, placeholder: 'https://…' });
    linkInp.addEventListener('input', () => { syllLink = linkInp.value.trim(); });
    linkField.appendChild(linkLabel);
    linkField.appendChild(linkInp);
    editor.appendChild(linkField);

    const sectionsWrap = el('div', { id: 'syl-sections' });

    function buildSections() {
      sectionsWrap.innerHTML = '';
      sections.forEach((sec, si) => {
        const block = el('div', { className: 'syl-section-block' });

        // Section header
        const hdr    = el('div', { className: 'syl-section-header' });
        const hInp   = el('input', { type: 'text', className: 'syl-section-input', value: sec.head, placeholder: 'SECTION NAME' });
        hInp.addEventListener('input', () => { sections[si].head = hInp.value; });
        const hDel   = el('button', { className: 'syl-del-btn', title: 'Delete section' }); hDel.textContent = '×';
        hDel.addEventListener('click', () => { sections.splice(si, 1); buildSections(); });
        hdr.appendChild(hInp);
        hdr.appendChild(hDel);
        block.appendChild(hdr);

        // Items
        const itemsList = el('div', { className: 'syl-items-list' });
        sec.items.forEach((item, ii) => {
          const row   = el('div', { className: 'syl-item-row' });
          const iInp  = el('input', { type: 'text', className: 'syl-item-input', value: item, placeholder: 'Item…' });
          iInp.addEventListener('input', () => { sections[si].items[ii] = iInp.value; });
          const iDel  = el('button', { className: 'syl-del-btn', title: 'Remove item' }); iDel.textContent = '×';
          iDel.addEventListener('click', () => { sections[si].items.splice(ii, 1); buildSections(); });
          row.appendChild(iInp);
          row.appendChild(iDel);
          itemsList.appendChild(row);
        });

        const addItemBtn = el('button', { className: 'btn btn-ghost btn-sm', style: { marginTop: '4px' } });
        addItemBtn.textContent = '+ Add Item';
        addItemBtn.addEventListener('click', () => { sections[si].items.push(''); buildSections(); });
        itemsList.appendChild(addItemBtn);
        block.appendChild(itemsList);
        sectionsWrap.appendChild(block);
      });

      const addSecBtn = el('button', { className: 'btn btn-ghost btn-sm', style: { marginTop: '4px' } });
      addSecBtn.textContent = '+ Add Section';
      addSecBtn.addEventListener('click', () => { sections.push({ head: '', items: [] }); buildSections(); });
      sectionsWrap.appendChild(addSecBtn);
    }

    buildSections();
    editor.appendChild(sectionsWrap);
    body.appendChild(editor);
    container.appendChild(body);

    const cancelBtn = el('button', { className: 'btn btn-ghost', 'data-action': 'close-panel' });
    cancelBtn.textContent = 'Cancel';
    const saveBtn = el('button', { className: 'btn btn-accent' });
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
      setSyncDot('saving');
      try {
        exam.syllabus = { link: syllLink, curated: sections };
        await saveExamDoc(exam);
        const idx = exams.findIndex(e => e.id === exam.id);
        if (idx !== -1) exams[idx] = exam;
        setSyncDot('ok');
        toast('Saved');
        openDetail(exam.id);
        setTimeout(() => switchTab(3), 50);
      } catch(e) {
        setSyncDot('error');
        toast('Save failed. Check connection.', 'err');
      }
    });
    container.appendChild(makePanelFooter([cancelBtn, 'spacer', saveBtn]));
  });
}

// ── SECTION 19: Profile Panel (DOM-built) ────────────────────────
function openProfile() {
  panelMode = 'profile';
  openPanel(container => {
    renderProfileView(container);
  });
}

function renderProfileView(container) {
  // Clear and rebuild
  while (container.firstChild) container.removeChild(container.firstChild);

  container.appendChild(makePanelHeader([
    (() => { const t = el('span', { style: { fontSize: '13px', fontWeight: '600' } }); t.textContent = 'Profile'; return t; })()
  ]));

  const body = el('div', { className: 'panel-body' });

  // Avatar + name
  const hdr = el('div', { className: 'profile-header' });
  const av  = el('div', { className: 'profile-avatar' });
  av.textContent = (profile.name || currentUser?.displayName || '?')[0].toUpperCase();
  const nameBlock = el('div');
  const nameEl    = el('div', { className: 'profile-name' });
  nameEl.textContent = profile.name || currentUser?.displayName || '—';
  const emailEl = el('div', { className: 'profile-email' });
  emailEl.textContent = profile.email || currentUser?.email || '—';
  nameBlock.appendChild(nameEl);
  nameBlock.appendChild(emailEl);
  hdr.appendChild(av);
  hdr.appendChild(nameBlock);
  body.appendChild(hdr);

  // Education section
  const eduSec = el('div', { className: 'profile-section' });
  const eduTitle = el('div', { className: 'profile-section-title' }); eduTitle.textContent = 'Education';
  eduSec.appendChild(eduTitle);
  const eduGrid = el('div', { className: 'profile-grid' });
  const eduFields = [
    ['10th Board', profile.tenth],
    ['12th Board', profile.twelfth],
    ['12th %', profile.twelfthPercent],
    ['Graduation', profile.graduation],
    ['Grad %', profile.gradPercent],
    ['Post-Grad', profile.pg],
    ['PG %', profile.pgPercent],
  ];
  eduFields.forEach(([k, v]) => {
    const kv = el('div', { className: 'profile-kv' });
    const key = el('div', { className: 'profile-k' }); key.textContent = k;
    const val = el('div', { className: `profile-v${!v ? ' empty' : ''}` }); val.textContent = v || 'Not set';
    kv.appendChild(key); kv.appendChild(val);
    eduGrid.appendChild(kv);
  });
  eduSec.appendChild(eduGrid);
  body.appendChild(eduSec);

  // Personal section
  const perSec = el('div', { className: 'profile-section' });
  const perTitle = el('div', { className: 'profile-section-title' }); perTitle.textContent = 'Personal';
  perSec.appendChild(perTitle);
  const perGrid = el('div', { className: 'profile-grid' });
  const perFields = [
    ['Date of Birth', profile.dob],
    ['Gender', profile.gender],
    ['Domicile', profile.domicile],
    ['Category', profile.category],
    ['Health', profile.health],
  ];
  perFields.forEach(([k, v]) => {
    const kv = el('div', { className: 'profile-kv' });
    const key = el('div', { className: 'profile-k' }); key.textContent = k;
    const val = el('div', { className: `profile-v${!v ? ' empty' : ''}` }); val.textContent = v || 'Not set';
    kv.appendChild(key); kv.appendChild(val);
    perGrid.appendChild(kv);
  });
  perSec.appendChild(perGrid);
  body.appendChild(perSec);

  // Notes
  if (profile.notes) {
    const notesSec = el('div', { className: 'profile-section' });
    const notesTitle = el('div', { className: 'profile-section-title' }); notesTitle.textContent = 'Notes';
    notesSec.appendChild(notesTitle);
    const notesVal = el('div', { style: { fontSize: '13px', color: 'var(--text)', lineHeight: '1.6' } });
    notesVal.textContent = profile.notes;
    notesSec.appendChild(notesVal);
    body.appendChild(notesSec);
  }

  container.appendChild(body);

  const editBtn = el('button', { className: 'btn btn-accent', 'data-action': 'edit-profile' });
  editBtn.textContent = 'Edit Profile';
  if (isOffline) editBtn.disabled = true;
  container.appendChild(makePanelFooter([editBtn]));
}

function renderProfileEdit() {
  const container = qs('#panel-inner');
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  container.appendChild(makePanelHeader([
    (() => { const t = el('span', { style: { fontSize: '13px', fontWeight: '600' } }); t.textContent = 'Edit Profile'; return t; })()
  ]));

  const body = el('div', { className: 'panel-body' });
  const form = el('div', { className: 'panel-form' });

  form.appendChild(makeFormSection('Basic'));
  form.appendChild(makeFormField('p-name', 'Full Name', 'text', profile.name || '', ''));
  form.appendChild(makeFormField('p-email', 'Email', 'email', profile.email || currentUser?.email || '', ''));

  form.appendChild(makeFormSection('Education'));
  form.appendChild(makeFormField('p-tenth', '10th Board', 'text', profile.tenth || '', 'e.g. CBSE'));
  form.appendChild(makeFormField('p-twelfth', '12th Board', 'text', profile.twelfth || '', 'e.g. CBSE'));
  form.appendChild(makeFormField('p-twelfthPercent', '12th %', 'text', profile.twelfthPercent || '', ''));
  form.appendChild(makeFormField('p-graduation', 'Graduation', 'text', profile.graduation || '', 'e.g. B.Sc. Physics'));
  form.appendChild(makeFormField('p-gradPercent', 'Grad %', 'text', profile.gradPercent || '', ''));
  form.appendChild(makeFormField('p-pg', 'Post-Graduation', 'text', profile.pg || '', ''));
  form.appendChild(makeFormField('p-pgPercent', 'PG %', 'text', profile.pgPercent || '', ''));

  form.appendChild(makeFormSection('Personal'));
  form.appendChild(makeFormField('p-dob', 'Date of Birth', 'date', profile.dob || '', ''));

  const genderField = el('div', { className: 'form-field' });
  const genderLabel = el('label', { className: 'form-label', htmlFor: 'f-p-gender' }); genderLabel.textContent = 'Gender';
  const genderSel   = el('select', { className: 'form-select', id: 'f-p-gender' });
  [['','— Select —'],['Male','Male'],['Female','Female'],['Other','Other']].forEach(([v,t]) => {
    const o = el('option', { value: v }); o.textContent = t;
    if ((profile.gender || '') === v) o.selected = true;
    genderSel.appendChild(o);
  });
  genderField.appendChild(genderLabel); genderField.appendChild(genderSel);
  form.appendChild(genderField);

  form.appendChild(makeFormField('p-domicile', 'Domicile State', 'text', profile.domicile || '', 'e.g. Uttar Pradesh'));

  const catField = el('div', { className: 'form-field' });
  const catLabel = el('label', { className: 'form-label', htmlFor: 'f-p-category' }); catLabel.textContent = 'Category';
  const catSel   = el('select', { className: 'form-select', id: 'f-p-category' });
  [['','— Select —'],['UR','UR (General)'],['OBC','OBC'],['SC','SC'],['ST','ST'],['EWS','EWS']].forEach(([v,t]) => {
    const o = el('option', { value: v }); o.textContent = t;
    if ((profile.category || '') === v) o.selected = true;
    catSel.appendChild(o);
  });
  catField.appendChild(catLabel); catField.appendChild(catSel);
  form.appendChild(catField);

  form.appendChild(makeFormField('p-health', 'Health / PwD', 'text', profile.health || '', 'e.g. None / PwD'));
  form.appendChild(makeFormTextarea('p-notes', 'Notes', profile.notes || '', 'Any notes…'));

  body.appendChild(form);
  container.appendChild(body);

  const cancelBtn = el('button', { className: 'btn btn-ghost', 'data-action': 'view-profile' });
  cancelBtn.textContent = 'Cancel';
  const saveBtn = el('button', { className: 'btn btn-accent', 'data-action': 'save-profile' });
  saveBtn.textContent = 'Save Profile';

  container.appendChild(makePanelFooter([cancelBtn, 'spacer', saveBtn]));
}

async function saveProfileForm() {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  setSyncDot('saving');
  try {
    profile.name           = getFormVal('p-name');
    profile.email          = getFormVal('p-email');
    profile.tenth          = getFormVal('p-tenth');
    profile.twelfth        = getFormVal('p-twelfth');
    profile.twelfthPercent = getFormVal('p-twelfthPercent');
    profile.graduation     = getFormVal('p-graduation');
    profile.gradPercent    = getFormVal('p-gradPercent');
    profile.pg             = getFormVal('p-pg');
    profile.pgPercent      = getFormVal('p-pgPercent');
    profile.dob            = getFormVal('p-dob');
    profile.gender         = qs('#f-p-gender')?.value || '';
    profile.domicile       = getFormVal('p-domicile');
    profile.category       = qs('#f-p-category')?.value || '';
    profile.health         = getFormVal('p-health');
    profile.notes          = getFormVal('p-notes');

    await saveUserDoc();
    setSyncDot('ok');
    toast('Profile saved');
    const container = qs('#panel-inner');
    if (container) renderProfileView(container);
    updateUserDropdown();
  } catch(e) {
    setSyncDot('error');
    toast('Save failed. Check connection.', 'err');
  }
}

// ── SECTION 20: Import Preview Panel (DOM-built) ─────────────────
function openImportPreview(newExams, skipped) {
  _importQueue = newExams;
  panelMode    = 'import';

  openPanel(container => {
    container.appendChild(makePanelHeader([
      (() => { const t = el('span', { style: { fontSize: '13px', fontWeight: '600' } }); t.textContent = 'Import Preview'; return t; })()
    ]));

    const body = el('div', { className: 'panel-body' });

    const stats = el('div', { className: 'import-stats' });
    const s1 = el('div', { className: 'import-stat' });
    const s1n = el('span', { className: 'import-stat-num' }); s1n.textContent = String(newExams.length);
    const s1l = el('span', { className: 'import-stat-label' }); s1l.textContent = 'New exams';
    s1.appendChild(s1n); s1.appendChild(s1l);
    const s2 = el('div', { className: 'import-stat' });
    const s2n = el('span', { className: 'import-stat-num' }); s2n.textContent = String(skipped);
    const s2l = el('span', { className: 'import-stat-label' }); s2l.textContent = 'Skipped (existing)';
    s2.appendChild(s2n); s2.appendChild(s2l);
    stats.appendChild(s1); stats.appendChild(s2);
    body.appendChild(stats);

    if (newExams.length > 0) {
      const list = el('div', { className: 'import-list' });
      const lt   = el('div', { className: 'import-list-title' }); lt.textContent = 'Will be imported';
      list.appendChild(lt);
      newExams.forEach(e => {
        const item = el('div', { className: 'import-item' });
        const dot  = el('div', { className: 'import-item-dot' });
        const name = el('span'); name.textContent = e.name || 'Unnamed';
        item.appendChild(dot); item.appendChild(name);
        list.appendChild(item);
      });
      body.appendChild(list);
    } else {
      const msg = el('div', { style: { padding: '16px', color: 'var(--muted)', fontSize: '12px' } });
      msg.textContent = 'No new exams to import.';
      body.appendChild(msg);
    }

    container.appendChild(body);

    const cancelBtn = el('button', { className: 'btn btn-ghost', 'data-action': 'close-panel' });
    cancelBtn.textContent = 'Cancel';
    const confirmBtn = el('button', { className: 'btn btn-accent', 'data-action': 'confirm-import' });
    confirmBtn.textContent = `Import ${newExams.length} Exam${newExams.length !== 1 ? 's' : ''}`;
    if (newExams.length === 0) confirmBtn.disabled = true;

    container.appendChild(makePanelFooter([cancelBtn, 'spacer', confirmBtn]));
  });
}

// ── SECTION 21: Export / Import ──────────────────────────────────
function exportJSON() {
  closeDropdown('export-dropdown');
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    settings,
    tags,
    exams
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `exam-tracker-export-${todayStr()}.json`);
}

function exportCSV() {
  closeDropdown('export-dropdown');
  const headers = ['name','agency','tag','examType','deadlineDate','deadlineLabel','status','eligible','applied','website','notes','rank'];
  const rows    = [headers.join(',')];
  exams.forEach(e => {
    const tagName = tags.find(t => t.id === e.tag)?.name || '';
    const row = [
      csvEsc(e.name),
      csvEsc(e.agency),
      csvEsc(tagName),
      csvEsc(e.examType),
      csvEsc(e.deadlineDate),
      csvEsc(e.deadlineLabel),
      csvEsc(computeStatus(e)),
      csvEsc(e.eligible),
      e.applied ? 'true' : 'false',
      csvEsc(e.website),
      csvEsc(e.notes),
      String(e.rank || 0)
    ];
    rows.push(row.join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  downloadBlob(blob, `exam-tracker-${todayStr()}.csv`);
}

function csvEsc(val) {
  if (!val) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerImport() {
  closeDropdown('export-dropdown');
  qs('#import-file-input').click();
}

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data    = JSON.parse(e.target.result);
      const incoming = Array.isArray(data.exams) ? data.exams : [];
      const existingIds = new Set(exams.map(ex => ex.id));
      const newExams    = incoming.filter(ex => ex.id && !existingIds.has(ex.id));
      const skipped     = incoming.length - newExams.length;
      openImportPreview(newExams, skipped);
    } catch(err) {
      toast('Invalid JSON file.', 'err');
    }
  };
  reader.readAsText(file);
}

async function confirmImport() {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  if (_importQueue.length === 0) { closePanel(); return; }
  setSyncDot('saving');
  try {
    const batch = db.batch();
    _importQueue.forEach(exam => {
      exam.updatedAt = now();
      const toSave = { ...exam };
      if (toSave.pattern && toSave.pattern.rows) {
        toSave.pattern = { rowsJson: JSON.stringify(toSave.pattern.rows) };
      }
      batch.set(examDocRef(exam.id), toSave);
    });
    await batch.commit();
    exams.push(..._importQueue);
    writeOfflineCache();
    setSyncDot('ok');
    toast(`Imported ${_importQueue.length} exams`);
    _importQueue = [];
    closePanel();
    render();
  } catch(e) {
    setSyncDot('error');
    toast('Import failed. Check connection.', 'err');
  }
}

// ── Tags Manager Panel ────────────────────────────────────────────
function openTagsManager() {
  panelMode = 'tags';
  openPanel(container => {
    buildTagsPanel(container);
  });
}

function buildTagsPanel(container) {
  while (container.firstChild) container.removeChild(container.firstChild);

  container.appendChild(makePanelHeader([
    (() => { const t = el('span', { style: { fontSize: '13px', fontWeight: '600' } }); t.textContent = 'Manage Tags'; return t; })()
  ]));

  const body = el('div', { className: 'panel-body' });
  const list = el('div', { className: 'tags-list' });

  tags.forEach(tag => {
    const inUse   = exams.some(e => e.tag === tag.id);
    const row     = el('div', { className: 'tag-manager-row' });
    const pill    = el('span', { className: 'tag-pill tag-manager-pill' });
    pill.textContent      = tag.name;
    pill.style.color      = tag.color;
    pill.style.background = tag.bg;
    const delBtn  = el('button', { className: 'tag-manager-del', title: inUse ? 'In use — remove from all exams first' : 'Delete tag' });
    delBtn.textContent = '×';
    delBtn.disabled    = inUse;
    if (!inUse) {
      delBtn.addEventListener('click', async () => {
        if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
        tags = tags.filter(t => t.id !== tag.id);
        try {
          await saveUserDoc();
          buildTagsPanel(container);
          render();
        } catch(e) {
          toast('Save failed.', 'err');
        }
      });
    }
    row.appendChild(pill);
    row.appendChild(delBtn);
    list.appendChild(row);
  });

  body.appendChild(list);

  // New tag form
  const newForm   = el('div', { className: 'new-tag-form' });
  const nameInp   = el('input', { type: 'text', className: 'form-input', placeholder: 'Tag name', style: { flex: '1' } });
  const colorInp  = el('input', { type: 'color', className: 'color-picker-input', value: '#4f46e5', title: 'Tag color' });
  const addBtn    = el('button', { className: 'btn btn-accent btn-sm' });
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', async () => {
    const name = nameInp.value.trim();
    if (!name) { toast('Tag name required.', 'err'); return; }
    if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
    const color = colorInp.value;
    const bg    = color + '22'; // semi-transparent bg
    const newTag = { id: uid(), name, color, bg };
    tags.push(newTag);
    try {
      await saveUserDoc();
      buildTagsPanel(container);
      render();
      nameInp.value = '';
    } catch(e) {
      toast('Save failed.', 'err');
      tags.pop();
    }
  });
  newForm.appendChild(nameInp);
  newForm.appendChild(colorInp);
  newForm.appendChild(addBtn);
  body.appendChild(newForm);

  container.appendChild(body);

  const doneBtn = el('button', { className: 'btn btn-accent', 'data-action': 'close-panel' });
  doneBtn.textContent = 'Done';
  container.appendChild(makePanelFooter([doneBtn]));
}

// ████████████████████████████████████████████████████████████████
// END OF PART 2
// ████████████████████████████████████████████████████████████████

// ████████████████████████████████████████████████████████████████
// APP.JS — EXAM TRACKER
// PART 3 OF 3 (Sections 22–26)
// ████████████████████████████████████████████████████████████████

// ── SECTION 22: Delete Account ───────────────────────────────────
function startDeleteAccount() {
  closeDropdown('user-dropdown');
  qs('#modal-overlay').classList.add('open');
}

function closeModal() {
  qs('#modal-overlay').classList.remove('open');
}

async function confirmDeleteAccount() {
  const btn = qs('#modal-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    // 1. Batch delete all exam docs
    const snap  = await examsRef().get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // 2. Delete user doc
    await userRef().delete();

    // 3. Delete auth user
    await currentUser.delete();

    // 4. Clear localStorage
    localStorage.removeItem(LS_OFFLINE);
    localStorage.removeItem(LS_THEME);

    // 5. Show deleted screen
    closeModal();
    qs('#app-screen').classList.remove('visible');
    qs('#deleted-screen').classList.add('show');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Delete My Account'; }
    // If requires-recent-login error
    if (e.code === 'auth/requires-recent-login') {
      closeModal();
      toast('Please sign out and sign back in, then try again.', 'err', false);
    } else {
      toast('Delete failed. Try again.', 'err');
    }
  }
}

// ── SECTION 23: Auth Functions ───────────────────────────────────
async function doSignIn() {
  const email    = qs('#signin-email')?.value.trim()    || '';
  const password = qs('#signin-password')?.value        || '';
  let valid      = true;

  clearAuthErrors('signin');

  if (!email)    { showAuthError('signin-email-err', 'Email is required.');    valid = false; }
  if (!password) { showAuthError('signin-password-err', 'Password is required.'); valid = false; }
  if (!valid)    return;

  const btn = qs('[data-action="do-signin"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    const msg = authErrMsg(e.code);
    showAuthError('signin-general-err', msg);
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  }
}

async function doSignUp() {
  const name     = qs('#signup-name')?.value.trim()     || '';
  const email    = qs('#signup-email')?.value.trim()    || '';
  const password = qs('#signup-password')?.value        || '';
  let valid      = true;

  clearAuthErrors('signup');

  if (!name)               { showAuthError('signup-name-err',     'Name is required.');          valid = false; }
  if (!email)              { showAuthError('signup-email-err',    'Email is required.');          valid = false; }
  if (password.length < 6) { showAuthError('signup-password-err', 'Password min 6 characters.'); valid = false; }
  if (!valid) return;

  const btn = qs('[data-action="do-signup"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    profile.name  = name;
    profile.email = email;
  } catch (e) {
    const msg = authErrMsg(e.code);
    showAuthError('signup-general-err', msg);
    if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
  }
}

async function doGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      toast(authErrMsg(e.code), 'err');
    }
  }
}

async function doForgot() {
  const email = qs('#forgot-email')?.value.trim() || '';
  clearAuthErrors('forgot');
  if (!email) { showAuthError('forgot-email-err', 'Email is required.'); return; }

  const btn = qs('[data-action="do-forgot"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    await auth.sendPasswordResetEmail(email);
    toast('Reset email sent');
    showSignIn();
  } catch (e) {
    showAuthError('forgot-general-err', authErrMsg(e.code));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Email'; }
  }
}

async function doChangePassword() {
  closeDropdown('user-dropdown');
  if (!currentUser?.email) { toast('No email on account.', 'err'); return; }
  try {
    await auth.sendPasswordResetEmail(currentUser.email);
    toast('Reset email sent');
  } catch (e) {
    toast(authErrMsg(e.code), 'err');
  }
}

async function doLogout() {
  closeDropdown('user-dropdown');
  try {
    await auth.signOut();
  } catch (e) {
    toast('Sign out failed.', 'err');
  }
}

function authErrMsg(code) {
  const map = {
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/invalid-credential':   'Invalid email or password.',
    'auth/email-already-in-use': 'Email already in use.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Invalid email address.',
    'auth/too-many-requests':    'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/popup-blocked':        'Popup blocked. Allow popups and try again.',
  };
  return map[code] || 'Something went wrong. Try again.';
}

function clearAuthErrors(prefix) {
  qsa(`[id^="${prefix}-"][id$="-err"]`).forEach(el2 => {
    el2.classList.remove('show');
    el2.textContent = '';
  });
  qsa(`[id^="${prefix}-"].form-input`).forEach(el2 => el2.classList.remove('error'));
}

function showAuthError(id, msg) {
  const errEl = qs(`#${id}`);
  if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
}

function showSignIn() {
  qs('#signin-form').style.display  = '';
  qs('#signup-form').style.display  = 'none';
  qs('#forgot-form').style.display  = 'none';
  qsa('.auth-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
}

function showSignUp() {
  qs('#signin-form').style.display  = 'none';
  qs('#signup-form').style.display  = '';
  qs('#forgot-form').style.display  = 'none';
  qsa('.auth-tab').forEach((t, i) => t.classList.toggle('active', i === 1));
}

function showForgot() {
  qs('#signin-form').style.display  = 'none';
  qs('#signup-form').style.display  = 'none';
  qs('#forgot-form').style.display  = '';
}

// ── SECTION 24: UI Utilities ──────────────────────────────────────

// Toast
function toast(message, type = 'ok', autoDismiss = true) {
  const container = qs('#toast-container');
  const t = el('div', { className: `toast ${type}` });
  const msg = el('span'); msg.textContent = message;
  const dis = el('button', { className: 'toast-dismiss', title: 'Dismiss' }); dis.textContent = '×';
  dis.addEventListener('click', () => removeToast(t));
  t.appendChild(msg);
  t.appendChild(dis);
  container.appendChild(t);
  if (autoDismiss) setTimeout(() => removeToast(t), 3000);
}

function removeToast(t) {
  if (!t.parentNode) return;
  t.style.opacity   = '0';
  t.style.transform = 'translateY(8px)';
  t.style.transition = 'opacity 0.2s, transform 0.2s';
  setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 200);
}

// Theme
function initTheme() {
  const saved = localStorage.getItem(LS_THEME) || 'light';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(LS_THEME, theme);
  const isDark = theme === 'dark';
  const darkIcon  = qs('#theme-icon-dark');
  const lightIcon = qs('#theme-icon-light');
  if (darkIcon)  darkIcon.style.display  = isDark  ? 'none' : '';
  if (lightIcon) lightIcon.style.display = isDark  ? ''     : 'none';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'light' ? 'dark' : 'light');
}

// Sync dot
function setSyncDot(state) {
  const dot = qs('#sync-dot');
  if (!dot) return;
  dot.className = 'sync-dot';
  if (state === 'saving') dot.classList.add('saving');
  else if (state === 'error') dot.classList.add('error');
  // 'ok' = default green, no extra class
}

// Screens
function showScreen(name) {
  const auth2 = qs('#auth-screen');
  const app   = qs('#app-screen');
  const load  = qs('#loading-screen');

  if (name === 'auth') {
    if (load) load.style.display = 'none';
    if (auth2) auth2.style.display = '';
    if (app)   app.classList.remove('visible');
  } else if (name === 'app') {
    if (load)  load.style.display = 'none';
    if (auth2) auth2.style.display = 'none';
    if (app)   app.classList.add('visible');
  }
}

function hideLoading() {
  const l = qs('#loading-screen');
  if (l) l.style.display = 'none';
}

// Dropdowns
function toggleDropdown(id) {
  const menu = qs(`#${id}`);
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  // Close all first
  qsa('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
}

function closeDropdown(id) {
  const menu = qs(`#${id}`);
  if (menu) menu.classList.remove('open');
}

function closeAllDropdowns() {
  qsa('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
}

// Search overlay
function openSearch() {
  const overlay = qs('#search-overlay');
  overlay.classList.add('open');
  setTimeout(() => qs('#search-input')?.focus(), 50);
}

function closeSearch() {
  qs('#search-overlay').classList.remove('open');
  const inp = qs('#search-input');
  if (inp) inp.value = '';
  filterState.search = '';
  render();
}

// Quick actions
async function quickToggleApplied(id, checked) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); render(); return; }
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  exam.applied = checked;
  setSyncDot('saving');
  try {
    await saveExamDoc(exam);
    setSyncDot('ok');
    render();
    // If detail panel is open for this exam, refresh it
    if (activePanelExamId === id && panelMode === 'detail') {
      openDetail(id);
    }
  } catch(e) {
    setSyncDot('error');
    exam.applied = !checked;
    toast('Save failed. Check connection.', 'err');
    render();
  }
}

async function toggleAppliedFromDetail(id) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  exam.applied = !exam.applied;
  setSyncDot('saving');
  try {
    await saveExamDoc(exam);
    setSyncDot('ok');
    render();
    openDetail(id);
  } catch(e) {
    setSyncDot('error');
    exam.applied = !exam.applied;
    toast('Save failed. Check connection.', 'err');
  }
}

async function togglePin(id) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const exam    = exams.find(e => e.id === id);
  if (!exam) return;
  const pinned  = exams.filter(e => e.pinned);
  if (!exam.pinned && pinned.length >= 3) {
    toast('Unpin an exam first (max 3).', 'err');
    return;
  }
  exam.pinned = !exam.pinned;
  setSyncDot('saving');
  try {
    await saveExamDoc(exam);
    setSyncDot('ok');
    render();
    if (activePanelExamId === id && panelMode === 'detail') {
      openDetail(id);
    }
  } catch(e) {
    setSyncDot('error');
    exam.pinned = !exam.pinned;
    toast('Save failed. Check connection.', 'err');
  }
}

async function confirmDeleteExam(id) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  if (!confirm(`Delete "${exam.name}"? This cannot be undone.`)) return;
  setSyncDot('saving');
  try {
    await deleteExamDoc(id);
    exams = exams.filter(e => e.id !== id);
    setSyncDot('ok');
    toast('Exam deleted');
    closePanel();
    render();
  } catch(e) {
    setSyncDot('error');
    toast('Delete failed. Check connection.', 'err');
  }
}

// Open elig tab from badge click
function openEligTab(id) {
  activePanelExamId = id;
  openDetail(id);
  setTimeout(() => switchTab(1), 80);
}

// ── SECTION 25: All addEventListener Calls ───────────────────────

// Global click delegation
document.addEventListener('click', e => {
  // Close dropdowns on outside click
  if (!e.target.closest('.dropdown-wrap')) closeAllDropdowns();

  const el2    = e.target.closest('[data-action]');
  if (!el2) return;
  const action = el2.dataset.action;
  const id     = el2.dataset.id;

  switch (action) {
    // Nav
    case 'nav-exams':   closePanel(); break;
    case 'nav-profile': openProfile(); break;

    // Auth
    case 'do-signin':    doSignIn();    break;
    case 'do-signup':    doSignUp();    break;
    case 'do-google':    doGoogle();    break;
    case 'do-forgot':    doForgot();    break;
    case 'show-forgot':  e.preventDefault(); showForgot();  break;
    case 'show-signin':  e.preventDefault(); showSignIn();  break;

    // Auth tabs
    case undefined: break;

    // Topbar
    case 'open-search':  openSearch();       break;
    case 'close-search': closeSearch();      break;
    case 'toggle-theme': toggleTheme();      break;
    case 'export-json':  exportJSON();       break;
    case 'export-csv':   exportCSV();        break;
    case 'trigger-import': triggerImport();  break;
    case 'do-logout':    doLogout();         break;
    case 'change-password': doChangePassword(); break;
    case 'delete-account':  startDeleteAccount(); break;
    case 'open-profile': closeDropdown('user-dropdown'); openProfile(); break;

    // Modal
    case 'close-modal':           closeModal();            break;
    case 'confirm-delete-account': confirmDeleteAccount(); break;

    // Filters
    case 'clear-filters':
      filterState = { status: '', tag: '', agency: '', applied: false, search: '' };
      qs('#filter-status').value = '';
      qs('#filter-tag').value    = '';
      qs('#filter-agency').value = '';
      qs('#filter-applied').checked = false;
      render();
      break;

    // Exam actions
    case 'add-exam':     openAddExam();           break;
    case 'open-detail':  openDetail(id);          break;
    case 'open-edit':    openEditExam(id);        break;
    case 'delete-exam':  confirmDeleteExam(id);   break;
    case 'save-exam':    saveExamForm();           break;
    case 'toggle-pin':   togglePin(id);           break;
    case 'toggle-applied-detail': toggleAppliedFromDetail(id); break;
    case 'open-elig-tab': openEligTab(id);        break;
    case 'toggle-expand':
      if (expandedExamIds.has(id)) {
        expandedExamIds.delete(id);
      } else {
        expandedExamIds.add(id);
      }
      render();
      break;

    // Sub-editors
    case 'open-elig-edit': openEligibilityEdit(id); break;
    case 'open-pat-edit':  openPatternEdit(id);     break;
    case 'open-syl-edit':  openSyllabusEdit(id);    break;

    // Tags
    case 'open-tags-manager': openTagsManager();  break;

    // Exam type selector
    case 'select-type':  selectExamType(el2.dataset.type); break;

    // Import
    case 'confirm-import': confirmImport(); break;

    // Profile
    case 'edit-profile':  renderProfileEdit();     break;
    case 'view-profile':  openProfile();           break;
    case 'save-profile':  saveProfileForm();       break;

    // Panel
    case 'close-panel': closePanel(); break;

    // Tab switching
    case 'switch-tab': switchTab(parseInt(el2.dataset.tab)); break;
  }
});

// Topbar dropdown toggle buttons (export + user)
qs('#export-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleDropdown('export-dropdown');
});

qs('#user-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleDropdown('user-dropdown');
});

// Auth tab switching
qsa('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const which = tab.dataset.authTab;
    if (which === 'signin') showSignIn();
    else showSignUp();
  });
});

// Enter key on auth forms
qs('#signin-email')?.addEventListener('keydown',    e => { if (e.key === 'Enter') qs('#signin-password')?.focus(); });
qs('#signin-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
qs('#signup-name')?.addEventListener('keydown',     e => { if (e.key === 'Enter') qs('#signup-email')?.focus(); });
qs('#signup-email')?.addEventListener('keydown',    e => { if (e.key === 'Enter') qs('#signup-password')?.focus(); });
qs('#signup-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSignUp(); });
qs('#forgot-email')?.addEventListener('keydown',    e => { if (e.key === 'Enter') doForgot(); });

// Escape key — close panel or search
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (qs('#search-overlay.open')) { closeSearch(); return; }
    if (qs('#modal-overlay.open'))  { closeModal(); return; }
    if (qs('#side-panel.open'))     { closePanel(); return; }
  }
});

// Backdrop click — close panel
qs('#panel-overlay')?.addEventListener('click', () => closePanel());

// Modal overlay click outside card
qs('#modal-overlay')?.addEventListener('click', e => {
  if (e.target === qs('#modal-overlay')) closeModal();
});

// Import file input change
qs('#import-file-input')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) handleImportFile(file);
  e.target.value = ''; // reset so same file can be re-selected
});

// Filter + sort controls (initialised once data loads)
initFilterControls();

// Checkbox toggle-applied via change event (not click delegation, since checkbox)
document.addEventListener('change', e => {
  const el2 = e.target.closest('[data-action="toggle-applied"]');
  if (el2) quickToggleApplied(el2.dataset.id, e.target.checked);
});

// eligible-badge click → open elig tab
document.addEventListener('click', e => {
  const el2 = e.target.closest('[data-action="open-elig-tab"]');
  if (el2) openEligTab(el2.dataset.id);
});

// ── SECTION 26: auth.onAuthStateChanged ← very last ─────────────
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    try {
      await loadData();
    } catch(e) {
      // loadData handles its own error display
    }
  } else {
    // Signed out
    currentUser = null;
    exams       = [];
    profile     = {};
    settings    = {};
    tags        = [];
    if (offlinePollTimer) { clearInterval(offlinePollTimer); offlinePollTimer = null; }
    closePanel();
    hideLoading();
    showScreen('auth');
    showSignIn();
  }
});

// ████████████████████████████████████████████████████████████████
// END OF PART 3 — app.js complete
// ████████████████████████████████████████████████████████████████
