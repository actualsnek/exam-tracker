// ████████████████████████████████████████████████████████████████
// EXAM TRACKER — app.js  v2
// ████████████████████████████████████████████████████████████████

// ── SECTION 1: Firebase Init ──────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyC1aDvKtiUt_M68BdoCjXtrrV1QH3E6OdA",
  authDomain:        "exam-tracker-81038.firebaseapp.com",
  projectId:         "exam-tracker-81038",
  storageBucket:     "exam-tracker-81038.firebasestorage.app",
  messagingSenderId: "286825354385",
  appId:             "1:286825354385:web:586d46ef481cfb1afe9b30"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── SECTION 2: App State ──────────────────────────────────────────
let currentUser       = null;
let exams             = [];
let tags              = [];
let profile           = {};
let settings          = {};
let editId            = null;
let _importQueue      = [];
let sortState         = { column: 'deadlineDate', direction: 1 };
let filterState       = { status: 'all', tags: [], search: '' };
let isOffline         = false;
let offlinePollTimer  = null;
let activePanelExamId = null;
let panelMode         = null;
let expandedExamIds   = new Set();
let mdCurrentField    = null; // 'eligibility' | 'syllabus' | 'pattern'
let mdCurrentExamId   = null;

// ── SECTION 3: Constants ──────────────────────────────────────────
const LS_THEME   = 'et_theme';
const LS_OFFLINE = 'et_offline';

const DEFAULT_TAGS = [
  { name: 'Central Govt', color: '#e07b2a', bg: '#2a1f13' },
  { name: 'Banking',      color: '#60a5fa', bg: '#0a1a2a' },
  { name: 'Railways',     color: '#a78bfa', bg: '#1a0a2a' },
  { name: 'State PSC',    color: '#34d399', bg: '#0a2a1a' },
  { name: 'Defence',      color: '#f472b6', bg: '#2a0a1a' },
  { name: 'Teaching',     color: '#facc15', bg: '#2a2000' },
  { name: 'Entrance',     color: '#fb923c', bg: '#2a1500' },
  { name: 'Other',        color: '#9ca3af', bg: '#1f2937' }
];

const DEFAULT_EXAMS = [
  { name: 'UPSC CSE 2025',  agency: 'UPSC',  tagName: 'Central Govt', website: 'https://upsc.gov.in'  },
  { name: 'SBI PO 2025',    agency: 'SBI',   tagName: 'Banking',       website: 'https://sbi.co.in'   },
  { name: 'SSC CGL 2025',   agency: 'SSC',   tagName: 'Central Govt', website: 'https://ssc.nic.in'   }
];

const ICONS = {
  plus:     '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x:        '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  chevronR: '<polyline points="9 18 15 12 9 6"/>',
  chevronD: '<polyline points="6 9 12 15 18 9"/>',
  chevronL: '<polyline points="15 18 9 12 15 6"/>',
  search:   '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  moon:     '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun:      '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  upload:   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  user:     '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  logout:   '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  trash:    '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>',
  edit:     '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  pin:      '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/>',
  link:     '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  wifi:     '<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  gear:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  pdf:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  expand:   '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  lock:     '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  key:      '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  tag:      '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
};

// ── SECTION 4: Utility Functions ──────────────────────────────────
function uid()  { return crypto.randomUUID(); }
function now()  { return Date.now(); }
function qs(s, c = document)  { return c.querySelector(s); }
function qsa(s, c = document) { return Array.from(c.querySelectorAll(s)); }

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
  const ns  = 'http://www.w3.org/2000/svg';
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

function diffDays(dateStr) {
  if (!dateStr) return null;
  const n = new Date(); n.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - n) / 86400000);
}

function computeStatus(exam) {
  if (!exam.deadlineDate) return 'na';
  return diffDays(exam.deadlineDate) >= 0 ? 'open' : 'closed';
}

function dlClass(exam) {
  const d = diffDays(exam.deadlineDate);
  if (d === null) return '';
  if (d < 0)  return 'dl-past';
  if (d <= 30) return 'dl-urgent';
  if (d <= 60) return 'dl-soon';
  return 'dl-far';
}

function detectLinkType(url) {
  if (!url) return 'url';
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'yt';
  if (u.includes('reddit.com'))                             return 'rd';
  if (u.endsWith('.pdf') || u.includes('/pdf'))             return 'pdf';
  return 'url';
}

function linkTypeLabel(type) {
  return { yt: 'YT', rd: 'RD', pdf: 'PDF', url: 'URL' }[type] || 'URL';
}

function csvEsc(val) {
  if (!val) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n'))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── SECTION 5: Firestore Refs ────────────────────────────────────
function userRef()      { return db.collection('users').doc(currentUser.uid); }
function examsRef()     { return userRef().collection('exams'); }
function examRef(id)    { return examsRef().doc(id); }

// ── SECTION 6: Offline Cache ──────────────────────────────────────
function writeCache() {
  try { localStorage.setItem(LS_OFFLINE, JSON.stringify({ exams, profile, settings, tags })); } catch(e) {}
}
function readCache() {
  try { const r = localStorage.getItem(LS_OFFLINE); return r ? JSON.parse(r) : null; } catch(e) { return null; }
}

function goOffline() {
  isOffline = true;
  qs('#offline-banner')?.classList.add('show');
  hideLoading();
  showScreen('app');
  if (offlinePollTimer) clearInterval(offlinePollTimer);
  offlinePollTimer = setInterval(async () => {
    try { await userRef().get(); goOnline(); } catch(e) {}
  }, 30000);
}

function goOnline() {
  isOffline = false;
  qs('#offline-banner')?.classList.remove('show');
  if (offlinePollTimer) { clearInterval(offlinePollTimer); offlinePollTimer = null; }
  loadData().catch(() => {});
}

// ── SECTION 7: Data Load ──────────────────────────────────────────
async function loadData() {
  setSyncDot('saving');
  try {
    await Promise.race([
      fetchAll(),
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 7000))
    ]);
    writeCache();
    setSyncDot('ok');
  } catch(err) {
    const cache = readCache();
    if (cache) {
      exams = cache.exams || []; profile = cache.profile || {};
      settings = cache.settings || {}; tags = cache.tags || [];
      goOffline(); render();
    } else {
      hideLoading(); showScreen('app');
      toast('Could not load data. Check connection.', 'err', false);
    }
    setSyncDot('err');
    throw err;
  }
}

async function fetchAll() {
  const [userSnap, examsSnap] = await Promise.all([
    userRef().get(),
    examsRef().get()
  ]);

  if (userSnap.exists) {
    const d = userSnap.data();
    profile  = d.profile  || {};
    settings = d.settings || {};
    tags     = d.tags     || [];
  } else {
    profile = {}; settings = {}; tags = [];
  }

  exams = [];
  examsSnap.forEach(doc => {
    exams.push(doc.data());
  });

  // Seed defaults for brand new users
  if (tags.length === 0 && exams.length === 0) await seedDefaults();

  render();
  hideLoading();
  showScreen('app');
}

async function seedDefaults() {
  tags = DEFAULT_TAGS.map(t => ({ id: uid(), ...t }));
  const batch = db.batch();
  const seeded = DEFAULT_EXAMS.map(e => {
    const tagObj = tags.find(t => t.name === e.tagName) || {};
    const exam = {
      id: uid(), name: e.name, agency: e.agency,
      tag: tagObj.id || '', website: e.website,
      deadlineDate: '', eligibility: '', syllabus: '', pattern: '',
      syllabusPdf: '', resources: [], tags: [],
      notes: '', applied: false, pinned: false,
      eligible: 'no', rank: 0,
      createdAt: now(), updatedAt: now()
    };
    batch.set(examRef(exam.id), exam);
    return exam;
  });
  await userRef().set({ profile: {}, settings: {}, tags, savedAt: now() }, { merge: true });
  await batch.commit();
  exams = seeded;
}

async function saveExamDoc(exam) {
  exam.updatedAt = now();
  await examRef(exam.id).set(exam);
  writeCache();
}

async function deleteExamDoc(id) {
  await examRef(id).delete();
  writeCache();
}

async function saveUserDoc() {
  await userRef().set({ profile, settings, tags, savedAt: now() }, { merge: true });
  writeCache();
}

// ── SECTION 8: Screen / UI State ─────────────────────────────────
function showScreen(name) {
  qs('#loading-screen')?.classList.add('hidden');
  qs('#auth-screen')?.classList.toggle('hidden', name !== 'auth');
  qs('#app-screen')?.classList.toggle('visible', name === 'app');
  qs('#app-screen')?.classList.toggle('hidden', name !== 'app');
  qs('#deleted-screen')?.classList.toggle('show', name === 'deleted');
}

function hideLoading() {
  qs('#loading-screen')?.classList.add('hidden');
}

function setSyncDot(state) {
  const dot = qs('#sync-dot');
  if (!dot) return;
  dot.classList.remove('show', 'saving', 'err');
  if (state === 'saving') { dot.classList.add('show', 'saving'); }
  else if (state === 'err')  { dot.classList.add('show', 'err'); }
  else if (state === 'ok')   {
    dot.classList.add('show');
    setTimeout(() => dot.classList.remove('show'), 2000);
  }
}

// ── SECTION 9: Theme ──────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem(LS_THEME) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(LS_THEME, next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = qs('#theme-btn');
  if (!btn) return;
  btn.innerHTML = '';
  btn.appendChild(svgIcon(theme === 'dark' ? ICONS.sun : ICONS.moon, 14));
}

// ── SECTION 10: Toast ─────────────────────────────────────────────
function toast(msg, type = 'ok', autoDismiss = true) {
  const container = qs('#toast-container');
  if (!container) return;
  const t   = el('div', { className: `toast ${type}` });
  const txt = el('span'); txt.textContent = msg;
  const btn = el('button', { className: 'toast-dismiss' }); btn.textContent = '×';
  btn.onclick = () => t.remove();
  t.appendChild(txt); t.appendChild(btn);
  container.appendChild(t);
  if (autoDismiss) setTimeout(() => t.remove(), 3500);
}

// ── SECTION 11: Dropdowns ─────────────────────────────────────────
function toggleDropdown(id) {
  const el2 = qs(`#${id}`);
  if (!el2) return;
  const isOpen = el2.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) el2.classList.add('open');
}

function closeDropdown(id) {
  qs(`#${id}`)?.classList.remove('open');
}

function closeAllDropdowns() {
  qsa('.dropdown-menu').forEach(d => d.classList.remove('open'));
  closeTagDropdown();
}

// ── SECTION 12: Tag Filter Dropdown ──────────────────────────────
function openTagDropdown() {
  const dd = qs('#tag-filter-dropdown');
  if (!dd) return;
  buildTagDropdownList();
  dd.classList.add('open');
}

function closeTagDropdown() {
  qs('#tag-filter-dropdown')?.classList.remove('open');
}

function toggleTagDropdown() {
  const dd = qs('#tag-filter-dropdown');
  if (!dd) return;
  if (dd.classList.contains('open')) { closeTagDropdown(); return; }
  openTagDropdown();
}

function buildTagDropdownList() {
  const list = qs('#tag-filter-list');
  if (!list) return;
  list.innerHTML = '';

  tags.forEach(tag => {
    const isChecked = filterState.tags.includes(tag.id);
    const item = el('div', { className: 'filter-tag-item' });

    const checkbox = el('div', { className: `tag-checkbox${isChecked ? ' checked' : ''}` });
    const dot      = el('div', { className: 'tag-item-dot' });
    dot.style.background = tag.color;
    const name = el('span', { className: 'tag-item-name' });
    name.textContent = tag.name;

    item.appendChild(checkbox);
    item.appendChild(dot);
    item.appendChild(name);

    item.addEventListener('click', () => {
      if (filterState.tags.includes(tag.id)) {
        filterState.tags = filterState.tags.filter(id => id !== tag.id);
      } else {
        filterState.tags = [...filterState.tags, tag.id];
      }
      updateTagFilterBtn();
      buildTagDropdownList();
      render();
    });

    list.appendChild(item);
  });

  // Footer info
  const footer = qs('#tag-filter-footer-info');
  if (footer) {
    const n = filterState.tags.length;
    footer.textContent = n > 0 ? `${n} selected` : 'All tags';
  }
}

function updateTagFilterBtn() {
  const btn = qs('#tag-filter-btn');
  if (!btn) return;
  const n = filterState.tags.length;
  btn.classList.toggle('has-active', n > 0);

  // Rebuild button content
  btn.innerHTML = '';
  btn.appendChild(svgIcon(ICONS.tag, 11));
  const label = el('span'); label.textContent = 'Tag';
  btn.appendChild(label);
  if (n > 0) {
    const count = el('span', { className: 'filter-tag-count' });
    count.textContent = n;
    btn.appendChild(count);
  }
  btn.appendChild(svgIcon(ICONS.chevronD, 10));
}

// ── SECTION 13: Search Overlay ────────────────────────────────────
function openSearch() {
  const overlay = qs('#search-overlay');
  const input   = qs('#search-input');
  if (!overlay) return;
  overlay.classList.add('open');
  setTimeout(() => input?.focus(), 50);
}

function closeSearch() {
  qs('#search-overlay')?.classList.remove('open');
  filterState.search = '';
  if (qs('#search-input')) qs('#search-input').value = '';
  render();
}

// ── SECTION 14: Auth Functions ────────────────────────────────────

// Show/hide auth sub-screens
function showSignIn() {
  qs('#auth-signin-form')?.classList.remove('hidden');
  qs('#auth-signup-form')?.classList.add('hidden');
  qs('#auth-forgot-form')?.classList.add('hidden');
  qsa('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.authTab === 'signin'));
  clearAuthErrors();
}

function showSignUp() {
  qs('#auth-signin-form')?.classList.add('hidden');
  qs('#auth-signup-form')?.classList.remove('hidden');
  qs('#auth-forgot-form')?.classList.add('hidden');
  qsa('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.authTab === 'signup'));
  clearAuthErrors();
}

function showForgot() {
  qs('#auth-signin-form')?.classList.add('hidden');
  qs('#auth-signup-form')?.classList.add('hidden');
  qs('#auth-forgot-form')?.classList.remove('hidden');
  clearAuthErrors();
}

function clearAuthErrors() {
  qsa('.field-error').forEach(e => e.classList.remove('show'));
  qsa('.form-input').forEach(i => i.classList.remove('error'));
}

function showAuthError(inputId, errorId, msg) {
  const inp = qs(`#${inputId}`);
  const err = qs(`#${errorId}`);
  if (inp) inp.classList.add('error');
  if (err) { err.textContent = msg; err.classList.add('show'); }
}

function setAuthBtnLoading(btnId, loading) {
  const btn = qs(`#${btnId}`);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : btn.dataset.label || btn.textContent;
}

async function doSignIn() {
  clearAuthErrors();
  const email    = qs('#signin-email')?.value.trim();
  const password = qs('#signin-password')?.value;

  if (!email)    { showAuthError('signin-email',    'signin-email-err',    'Email is required'); return; }
  if (!password) { showAuthError('signin-password', 'signin-password-err', 'Password is required'); return; }

  setAuthBtnLoading('signin-btn', true);
  try {
    await auth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged handles the rest
  } catch(err) {
    setAuthBtnLoading('signin-btn', false);
    const msg = authErrMsg(err.code);
    showAuthError('signin-email', 'signin-email-err', msg);
  }
}

async function doSignUp() {
  clearAuthErrors();
  const name     = qs('#signup-name')?.value.trim();
  const email    = qs('#signup-email')?.value.trim();
  const password = qs('#signup-password')?.value;

  if (!name)           { showAuthError('signup-name',     'signup-name-err',     'Name is required'); return; }
  if (!email)          { showAuthError('signup-email',    'signup-email-err',    'Email is required'); return; }
  if (!password)       { showAuthError('signup-password', 'signup-password-err', 'Password is required'); return; }
  if (password.length < 6) { showAuthError('signup-password', 'signup-password-err', 'Minimum 6 characters'); return; }

  setAuthBtnLoading('signup-btn', true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    profile.displayName = name;
    // onAuthStateChanged triggers loadData → seedDefaults for new user
  } catch(err) {
    setAuthBtnLoading('signup-btn', false);
    const msg = authErrMsg(err.code);
    showAuthError('signup-email', 'signup-email-err', msg);
  }
}

async function doGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch(err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      toast('Google sign-in failed. Try again.', 'err');
    }
  }
}

async function doForgot() {
  clearAuthErrors();
  const email = qs('#forgot-email')?.value.trim();
  if (!email) { showAuthError('forgot-email', 'forgot-email-err', 'Enter your email'); return; }

  setAuthBtnLoading('forgot-btn', true);
  try {
    await auth.sendPasswordResetEmail(email);
    toast('Reset email sent — check your inbox', 'ok');
    showSignIn();
  } catch(err) {
    showAuthError('forgot-email', 'forgot-email-err', authErrMsg(err.code));
  } finally {
    setAuthBtnLoading('forgot-btn', false);
  }
}

async function doLogout() {
  closeAllDropdowns();
  await auth.signOut();
}

async function doChangePassword() {
  closeAllDropdowns();
  const newPw = prompt('Enter new password (min 6 characters):');
  if (!newPw) return;
  if (newPw.length < 6) { toast('Password must be at least 6 characters.', 'err'); return; }
  try {
    await auth.currentUser.updatePassword(newPw);
    toast('Password updated successfully');
  } catch(err) {
    if (err.code === 'auth/requires-recent-login') {
      toast('Please sign out and sign in again, then retry.', 'warn');
    } else {
      toast('Failed to update password.', 'err');
    }
  }
}

function startDeleteAccount() {
  closeAllDropdowns();
  openModal({
    title: '⚠️ Delete your account?',
    body: 'All your exams and data will be <strong>permanently deleted</strong>. This cannot be undone.<br/><br/>Type <code style="font-family:var(--mono);color:var(--no);background:var(--no-bg);padding:1px 5px;border-radius:3px;">DELETE</code> to confirm.',
    confirmAction: 'confirm-delete-account',
    confirmText: 'Delete My Account',
    confirmClass: 'btn-danger',
    requiresInput: 'DELETE'
  });
}

async function confirmDeleteAccount() {
  const input = qs('#modal-confirm-input')?.value.trim();
  if (input !== 'DELETE') { toast('Type DELETE to confirm.', 'err'); return; }
  closeModal();
  try {
    setSyncDot('saving');
    // Delete all exam docs
    const snap = await examsRef().get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    batch.delete(userRef());
    await batch.commit();
    await auth.currentUser.delete();
    showScreen('deleted');
  } catch(err) {
    setSyncDot('err');
    if (err.code === 'auth/requires-recent-login') {
      toast('Please sign out and sign in again first.', 'warn');
    } else {
      toast('Delete failed. Try again.', 'err');
    }
  }
}

function authErrMsg(code) {
  const map = {
    'auth/user-not-found':        'No account found with this email.',
    'auth/wrong-password':        'Incorrect password.',
    'auth/invalid-email':         'Invalid email address.',
    'auth/email-already-in-use':  'An account with this email already exists.',
    'auth/weak-password':         'Password is too weak.',
    'auth/too-many-requests':     'Too many attempts. Try again later.',
    'auth/network-request-failed':'Network error. Check your connection.',
    'auth/invalid-credential':    'Incorrect email or password.',
  };
  return map[code] || 'Something went wrong. Try again.';
}

// ── SECTION 15: User Dropdown / Topbar ───────────────────────────
function updateTopbar() {
  const user = auth.currentUser;
  if (!user) return;

  // Avatar initials
  const name   = profile.displayName || user.displayName || user.email || '?';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const avatar = qs('#topbar-avatar');
  if (avatar) avatar.textContent = initials;

  // Dropdown header
  const dn = qs('#dropdown-name');
  const de = qs('#dropdown-email');
  if (dn) dn.textContent = name;
  if (de) de.textContent = user.email || '';
}

// ── SECTION 16: Modal System ──────────────────────────────────────
function openModal({ title, body, confirmAction, confirmText, confirmClass = 'btn-danger', requiresInput }) {
  const overlay = qs('#modal-overlay');
  const card    = qs('.modal-card');
  if (!overlay || !card) return;

  qs('#modal-title').textContent = title;
  qs('#modal-body').innerHTML    = body;

  const inputWrap = qs('#modal-input-wrap');
  const input     = qs('#modal-confirm-input');
  if (requiresInput) {
    inputWrap?.classList.remove('hidden');
    if (input) { input.value = ''; input.placeholder = `Type ${requiresInput} here…`; }
  } else {
    inputWrap?.classList.add('hidden');
  }

  const confirmBtn = qs('#modal-confirm-btn');
  if (confirmBtn) {
    confirmBtn.textContent = confirmText;
    confirmBtn.className   = `btn ${confirmClass}`;
    confirmBtn.dataset.action = confirmAction;
  }

  overlay.classList.add('open');
}

function closeModal() {
  qs('#modal-overlay')?.classList.remove('open');
}

// ── SECTION 17: Panel System ──────────────────────────────────────
function openPanel(buildFn) {
  const panel   = qs('#side-panel');
  const overlay = qs('#panel-overlay');
  if (!panel || !overlay) return;

  panel.className = 'hidden'; // reset md-mode
  panel.innerHTML = '';
  panel.id = 'side-panel';

  buildFn(panel);

  overlay.classList.add('open');
  // Force reflow then animate in
  requestAnimationFrame(() => {
    panel.classList.remove('hidden');
    panel.classList.add('open');
  });
}

function closePanel() {
  const panel   = qs('#side-panel');
  const overlay = qs('#panel-overlay');
  if (!panel) return;
  panel.classList.remove('open');
  overlay?.classList.remove('open');
  setTimeout(() => {
    panel.innerHTML = '';
    activePanelExamId = null;
    panelMode = null;
    mdCurrentField = null;
    mdCurrentExamId = null;
  }, 280);
}

function makePanelHeader({ title, subtitle, backAction, showBack = false }) {
  const header = el('div', { className: 'panel-header' });

  if (showBack) {
    const back = el('button', { className: 'panel-back-btn', title: 'Back' });
    back.appendChild(svgIcon(ICONS.chevronL, 12));
    if (backAction) back.addEventListener('click', backAction);
    header.appendChild(back);
  }

  const titleWrap = el('div', { className: 'panel-title-wrap' });
  const titleEl   = el('div', { className: 'panel-title' });
  titleEl.textContent = title;
  titleWrap.appendChild(titleEl);

  if (subtitle) {
    const subEl = el('div', { className: 'panel-subtitle' });
    subEl.textContent = subtitle;
    titleWrap.appendChild(subEl);
  }

  header.appendChild(titleWrap);

  const closeBtn = el('button', { className: 'panel-close-btn', title: 'Close' });
  closeBtn.appendChild(svgIcon(ICONS.x, 12));
  closeBtn.addEventListener('click', closePanel);
  header.appendChild(closeBtn);

  return header;
}

function makePanelFooter(buttons) {
  const footer = el('div', { className: 'panel-footer' });
  buttons.forEach(b => {
    if (b === 'spacer') footer.appendChild(el('span', { style: { flex: '1' } }));
    else footer.appendChild(b);
  });
  return footer;
}

// ── SECTION 18: Render Engine ─────────────────────────────────────
function render() {
  updateTopbar();
  updateCountdownStrip();
  updateTagFilterBtn();
  const filtered = getFiltered();
  renderTable(filtered);
  renderCards(filtered);
  const n  = filtered.length;
  const lbl = qs('#exam-count-label');
  if (lbl) lbl.textContent = `${n} exam${n !== 1 ? 's' : ''}`;
}

function getFiltered() {
  let list = [...exams];

  // Search
  if (filterState.search) {
    const q = filterState.search.toLowerCase();
    list = list.filter(e =>
      (e.name   || '').toLowerCase().includes(q) ||
      (e.agency || '').toLowerCase().includes(q) ||
      (tags.find(t => t.id === e.tag)?.name || '').toLowerCase().includes(q)
    );
  }

  // Status chip
  if (filterState.status === 'open')    list = list.filter(e => computeStatus(e) === 'open');
  if (filterState.status === 'applied') list = list.filter(e => e.applied);

  // Tag dropdown (multi-select)
  if (filterState.tags.length > 0) {
    list = list.filter(e => filterState.tags.includes(e.tag));
  }

  // Sort
  list.sort((a, b) => {
    const col = sortState.column;
    let av, bv;
    if      (col === 'name')         { av = (a.name || '').toLowerCase();   bv = (b.name || '').toLowerCase(); }
    else if (col === 'agency')       { av = (a.agency || '').toLowerCase(); bv = (b.agency || '').toLowerCase(); }
    else if (col === 'deadlineDate') { av = a.deadlineDate || 'zzzzz';      bv = b.deadlineDate || 'zzzzz'; }
    else if (col === 'rank')         { av = a.rank || 9999;                 bv = b.rank || 9999; }
    else                             { av = 0; bv = 0; }
    if (av < bv) return -sortState.direction;
    if (av > bv) return  sortState.direction;
    return 0;
  });

  return list;
}

// Badges
function makeBadge(type, text) {
  const b = el('span', { className: `badge badge-${type}` });
  b.textContent = text;
  return b;
}

function makeTagBadge(tagId) {
  const tag = tags.find(t => t.id === tagId);
  if (!tag) return null;
  const b = el('span', { className: 'badge badge-tag' });
  b.textContent = tag.name;
  b.style.color      = tag.color;
  b.style.background = tag.bg;
  b.style.borderColor = tag.color + '44';
  return b;
}

// ── SECTION 19: Countdown Strip ───────────────────────────────────
function updateCountdownStrip() {
  const strip = qs('#countdown-strip');
  if (!strip) return;

  // Auto-unpin past exams
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

  if (pinned.length === 0) return;

  const label = el('span', { className: 'countdown-label' });
  label.textContent = 'Pinned';
  strip.appendChild(label);

  const rings = el('div', { className: 'countdown-rings' });
  const CIRCUMFERENCE = 2 * Math.PI * 28; // r=28

  pinned.forEach(exam => {
    const diff     = diffDays(exam.deadlineDate);
    const urgency  = diff === null ? 'far' : diff <= 30 ? 'urgent' : diff <= 60 ? 'soon' : 'far';
    const progress = diff === null ? 0 : Math.max(0, Math.min(1, diff / 365));
    const offset   = CIRCUMFERENCE * (1 - progress);

    const wrap = el('div', { className: 'countdown-ring-wrap', 'data-action': 'open-detail', 'data-id': exam.id });

    // SVG ring
    const ns  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 68 68');
    svg.setAttribute('width', '68');
    svg.setAttribute('height', '68');

    const track = document.createElementNS(ns, 'circle');
    track.setAttribute('class', 'ring-track');
    track.setAttribute('cx', '34'); track.setAttribute('cy', '34'); track.setAttribute('r', '28');

    const fill = document.createElementNS(ns, 'circle');
    fill.setAttribute('class', `ring-fill ${urgency}`);
    fill.setAttribute('cx', '34'); fill.setAttribute('cy', '34'); fill.setAttribute('r', '28');
    fill.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
    fill.setAttribute('stroke-dashoffset', String(offset));
    fill.style.transform = 'rotate(-90deg)';
    fill.style.transformOrigin = 'center';

    svg.appendChild(track);
    svg.appendChild(fill);

    const ringDiv = el('div', { className: 'countdown-ring' });
    ringDiv.appendChild(svg);

    const center = el('div', { className: 'ring-center' });
    const days   = el('div', { className: 'ring-days' });
    days.textContent = diff === null ? '?' : String(Math.abs(diff));
    const unit = el('div', { className: 'ring-unit' });
    unit.textContent = 'days';
    center.appendChild(days);
    center.appendChild(unit);
    ringDiv.appendChild(center);

    const name = el('div', { className: 'ring-name' });
    name.textContent = exam.name.length > 14 ? exam.name.slice(0, 13) + '…' : exam.name;

    wrap.appendChild(ringDiv);
    wrap.appendChild(name);
    rings.appendChild(wrap);
  });

  strip.appendChild(rings);
}

// ── SECTION 20: Table Render ──────────────────────────────────────
function renderTable(list) {
  const tbody = qs('#exam-tbody');
  const empty = qs('#table-empty');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (list.length === 0) {
    empty?.classList.remove('hidden');
    const hasFilters = filterState.status !== 'all' || filterState.tags.length > 0 || filterState.search;
    const title = qs('#table-empty-title');
    const sub   = qs('#table-empty-sub');
    const btn   = qs('#table-empty-add-btn');
    if (title) title.textContent = hasFilters ? 'No matches' : 'No exams yet';
    if (sub)   sub.textContent   = hasFilters ? 'Try clearing filters.' : 'Add your first exam to get started.';
    if (btn)   btn.style.display = hasFilters ? 'none' : '';
    return;
  }
  empty?.classList.add('hidden');

  list.forEach(exam => {
    const status     = computeStatus(exam);
    const isExpanded = expandedExamIds.has(exam.id);
    const diff       = diffDays(exam.deadlineDate);

    // Main row
    const tr = el('tr');
    if (exam.applied) tr.classList.add('applied-row');
    tr.dataset.examId = exam.id;

    // Expand toggle
    const tdExp = el('td', { className: 'col-expand-th' });
    const expBtn = el('button', { className: `expand-btn${isExpanded ? ' open' : ''}`, 'data-action': 'toggle-expand', 'data-id': exam.id });
    expBtn.appendChild(svgIcon(ICONS.chevronR, 10));
    tdExp.appendChild(expBtn);
    tr.appendChild(tdExp);

    // Rank
    const tdRank = el('td', { className: 'col-rank' });
    tdRank.textContent = exam.rank || '—';
    tr.appendChild(tdRank);

    // Name
    const tdName = el('td', { className: 'col-name' });
    tdName.textContent = exam.name;
    tr.appendChild(tdName);

    // Agency
    const tdAg = el('td', { className: 'col-agency' });
    tdAg.textContent = exam.agency || '—';
    tr.appendChild(tdAg);

    // Tag badge
    const tdTag  = el('td');
    const tagBadge = makeTagBadge(exam.tag);
    if (tagBadge) tdTag.appendChild(tagBadge);
    tr.appendChild(tdTag);

    // Deadline
    const tdDl  = el('td', { className: dlClass(exam) });
    tdDl.textContent = exam.deadlineDate ? fmtDate(exam.deadlineDate) : '—';
    if (diff === 0) tdDl.textContent = 'TODAY';
    tr.appendChild(tdDl);

    // Status
    const tdSt = el('td');
    tdSt.appendChild(makeBadge(status, status === 'open' ? 'Open' : status === 'closed' ? 'Closed' : 'N/A'));
    tr.appendChild(tdSt);

    // Eligible
    const tdEl = el('td');
    const elig = exam.eligible === 'yes' ? 'yes' : exam.eligible === 'no' ? 'no' : 'na';
    tdEl.appendChild(makeBadge(elig, elig === 'yes' ? 'Yes' : elig === 'no' ? 'No' : '?'));
    tr.appendChild(tdEl);

    // Applied checkbox
    const tdAp = el('td');
    const cb   = el('div', { className: `row-checkbox${exam.applied ? ' checked' : ''}`, 'data-action': 'toggle-applied', 'data-id': exam.id, title: 'Mark applied' });
    tdAp.appendChild(cb);
    tr.appendChild(tdAp);

    // Pin
    const tdPin = el('td');
    const pinBtn = el('button', { className: `pin-btn${exam.pinned ? ' pinned' : ''}`, 'data-action': 'toggle-pin', 'data-id': exam.id, title: exam.pinned ? 'Unpin' : 'Pin' });
    pinBtn.appendChild(svgIcon(ICONS.pin, 12));
    tdPin.appendChild(pinBtn);
    tr.appendChild(tdPin);

    tbody.appendChild(tr);

    // Expanded row
    if (isExpanded) {
      tbody.appendChild(buildExpandedRow(exam));
    }
  });

  // Sort arrows
  qsa('#exam-table th[data-sort]').forEach(th => {
    const col   = th.dataset.sort;
    const arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    if (col === sortState.column) {
      arrow.textContent = sortState.direction === 1 ? '↑' : '↓';
      th.classList.add('sort-asc');
      th.classList.remove('sort-desc');
      if (sortState.direction === -1) {
        th.classList.add('sort-desc');
        th.classList.remove('sort-asc');
      }
    } else {
      arrow.textContent = '';
      th.classList.remove('sort-asc', 'sort-desc');
    }
  });
}

// ── SECTION 21: Expanded Row ──────────────────────────────────────
function buildExpandedRow(exam) {
  const tr = el('tr', { className: 'expanded-row' });
  tr.dataset.expandId = exam.id;

  const td = el('td');
  td.colSpan = 10;

  const inner = el('div', { className: 'expanded-inner' });

  // 3-col summary grid
  const grid = el('div', { className: 'exp-summary-grid' });

  // Eligibility block
  grid.appendChild(buildExpBlock(exam, 'eligibility', 'Eligibility',
    exam.eligibility || 'No eligibility info added yet.',
    false
  ));

  // Syllabus block
  grid.appendChild(buildExpBlock(exam, 'syllabus', 'Syllabus',
    exam.syllabus || 'No syllabus added yet.',
    true, exam.syllabusPdf
  ));

  // Pattern block
  grid.appendChild(buildExpBlock(exam, 'pattern', 'Exam Pattern',
    exam.pattern || 'No pattern added yet.',
    false
  ));

  inner.appendChild(grid);

  // Bottom row: tags + actions
  const bottom = el('div', { className: 'exp-bottom' });

  // Tags side
  const tagsWrap = el('div', { className: 'exp-tags' });
  const tagsLabel = el('span', { className: 'exp-tags-label' });
  tagsLabel.textContent = 'Tags:';
  tagsWrap.appendChild(tagsLabel);
  const tagObj = tags.find(t => t.id === exam.tag);
  if (tagObj) {
    const b = el('span', { className: 'badge badge-tag' });
    b.textContent = tagObj.name;
    b.style.color = tagObj.color;
    b.style.background = tagObj.bg;
    tagsWrap.appendChild(b);
  }
  bottom.appendChild(tagsWrap);

  // Actions side
  const actions = el('div', { className: 'exp-actions' });

  // Website
  if (exam.website) {
    const webBtn = el('a', { className: 'btn-sm', href: exam.website, target: '_blank', rel: 'noopener' });
    webBtn.innerHTML = '🌐 Website';
    actions.appendChild(webBtn);
  }

  // Resources button + popover
  const resWrap = buildResourcesPopover(exam);
  actions.appendChild(resWrap);

  // Edit
  const editBtn = el('button', { className: 'btn-sm accent', 'data-action': 'open-edit', 'data-id': exam.id });
  editBtn.appendChild(svgIcon(ICONS.edit, 11));
  editBtn.appendChild(document.createTextNode(' Edit'));
  actions.appendChild(editBtn);

  // Pin toggle
  const pinBtn = el('button', { className: 'btn-sm', 'data-action': 'toggle-pin', 'data-id': exam.id });
  pinBtn.textContent = exam.pinned ? '📌 Unpin' : '📌 Pin';
  actions.appendChild(pinBtn);

  // Delete
  const delBtn = el('button', { className: 'btn-sm danger', 'data-action': 'delete-exam', 'data-id': exam.id });
  delBtn.appendChild(svgIcon(ICONS.trash, 11));
  delBtn.appendChild(document.createTextNode(' Delete'));
  actions.appendChild(delBtn);

  bottom.appendChild(actions);
  inner.appendChild(bottom);
  td.appendChild(inner);
  tr.appendChild(td);
  return tr;
}

function buildExpBlock(exam, field, title, summaryText, hasPdf = false, pdfUrl = '') {
  const block = el('div', { className: 'exp-block' });

  const head = el('div', { className: 'exp-block-head' });
  const titleEl = el('span', { className: 'exp-block-title' });
  titleEl.textContent = title;

  const editBtn = el('button', { className: 'exp-edit-btn' });
  editBtn.appendChild(svgIcon(ICONS.expand, 9));
  editBtn.appendChild(document.createTextNode(' Edit / View'));
  editBtn.addEventListener('click', () => openMarkdownEditor(exam.id, field));

  head.appendChild(titleEl);
  head.appendChild(editBtn);
  block.appendChild(head);

  // Summary — first 2 lines of markdown (strip markdown syntax for preview)
  const summary = el('p');
  const stripped = (summaryText || '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/>\s/g, '')
    .replace(/\|/g, ' ')
    .trim();
  const lines = stripped.split('\n').filter(l => l.trim()).slice(0, 3).join(' · ');
  summary.textContent = lines || 'Nothing added yet.';
  block.appendChild(summary);

  // PDF link
  if (hasPdf && pdfUrl) {
    const pdfLink = el('a', { className: 'exp-pdf-link', href: pdfUrl, target: '_blank', rel: 'noopener' });
    pdfLink.appendChild(svgIcon(ICONS.pdf, 11));
    const fname = pdfUrl.split('/').pop().split('?')[0] || 'Syllabus PDF';
    pdfLink.appendChild(document.createTextNode(' ' + fname.slice(0, 30)));
    block.appendChild(pdfLink);
  }

  return block;
}

// ── SECTION 22: Resources Popover ────────────────────────────────
function buildResourcesPopover(exam) {
  const wrap = el('div', { className: 'resources-wrap' });

  const resources = exam.resources || [];
  const countBadge = resources.length > 0
    ? ` <span style="background:var(--accent);color:#fff;font-size:9px;padding:1px 5px;border-radius:100px;margin-left:3px;">${resources.length}</span>`
    : '';

  const triggerBtn = el('button', { className: 'btn-sm' });
  triggerBtn.innerHTML = `📎 Resources${countBadge}`;
  triggerBtn.addEventListener('click', e => {
    e.stopPropagation();
    const pop = wrap.querySelector('.resources-popover');
    if (pop) pop.classList.toggle('open');
  });

  const pop = el('div', { className: 'resources-popover' });

  // Link list
  const linkList = el('div', { className: 'res-link-list' });

  function rebuildLinks() {
    linkList.innerHTML = '';
    const res = exam.resources || [];
    if (res.length === 0) {
      const empty = el('div', { className: 'res-empty-msg' });
      empty.textContent = 'No links yet.';
      linkList.appendChild(empty);
    } else {
      res.forEach((r, i) => {
        const item  = el('div', { className: 'res-link-item' });
        const type  = detectLinkType(r.url);
        const typeLbl = el('span', { className: `res-link-type ${type}` });
        typeLbl.textContent = linkTypeLabel(type);
        const label = el('span', { className: 'res-link-label' });
        label.textContent = r.label || r.url;
        label.title = r.url;
        label.style.cursor = 'pointer';
        label.addEventListener('click', () => window.open(r.url, '_blank', 'noopener'));
        const delBtn = el('button', { className: 'res-del-btn', title: 'Remove' });
        delBtn.textContent = '×';
        delBtn.addEventListener('click', async () => {
          exam.resources.splice(i, 1);
          if (!isOffline) {
            setSyncDot('saving');
            try { await saveExamDoc(exam); setSyncDot('ok'); } catch(e) { setSyncDot('err'); }
          }
          // update badge
          triggerBtn.innerHTML = `📎 Resources${exam.resources.length > 0 ? ` <span style="background:var(--accent);color:#fff;font-size:9px;padding:1px 5px;border-radius:100px;margin-left:3px;">${exam.resources.length}</span>` : ''}`;
          rebuildLinks();
        });
        item.appendChild(typeLbl);
        item.appendChild(label);
        item.appendChild(delBtn);
        linkList.appendChild(item);
      });
    }
  }

  rebuildLinks();
  pop.appendChild(linkList);

  // Add row
  const addRow = el('div', { className: 'res-add-row' });
  const addInput = el('input', { className: 'res-add-input', placeholder: 'Paste a link…', type: 'url' });
  const addBtn   = el('button', { className: 'res-add-btn' });
  addBtn.textContent = '+';
  addBtn.addEventListener('click', async () => {
    const url = addInput.value.trim();
    if (!url) return;
    if (!exam.resources) exam.resources = [];
    exam.resources.push({ url, label: '', type: detectLinkType(url) });
    addInput.value = '';
    if (!isOffline) {
      setSyncDot('saving');
      try { await saveExamDoc(exam); setSyncDot('ok'); } catch(e) { setSyncDot('err'); }
    }
    triggerBtn.innerHTML = `📎 Resources <span style="background:var(--accent);color:#fff;font-size:9px;padding:1px 5px;border-radius:100px;margin-left:3px;">${exam.resources.length}</span>`;
    rebuildLinks();
  });
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });

  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  pop.appendChild(addRow);

  wrap.appendChild(triggerBtn);
  wrap.appendChild(pop);
  return wrap;
}

// ── SECTION 23: Mobile Cards ──────────────────────────────────────
function renderCards(list) {
  const container = qs('#exam-cards');
  const empty     = qs('#cards-empty');
  if (!container) return;
  container.innerHTML = '';

  if (list.length === 0) {
    empty?.classList.remove('hidden');
    const hasFilters = filterState.status !== 'all' || filterState.tags.length > 0 || filterState.search;
    const title = qs('#cards-empty-title');
    const sub   = qs('#cards-empty-sub');
    if (title) title.textContent = hasFilters ? 'No matches' : 'No exams yet';
    if (sub)   sub.textContent   = hasFilters ? 'Try clearing filters.' : 'Tap + to add your first exam.';
    return;
  }
  empty?.classList.add('hidden');

  list.forEach(exam => {
    const status     = computeStatus(exam);
    const isExpanded = expandedExamIds.has(exam.id);
    const card       = el('div', { className: `exam-card${exam.applied ? ' applied-card' : ''}` });

    // Top row
    const top = el('div', { className: 'card-top' });

    // Agency badge
    const agBadge = el('div', { className: 'card-agency-badge' });
    agBadge.textContent = (exam.agency || '?').slice(0, 4).toUpperCase();
    top.appendChild(agBadge);

    // Body
    const body = el('div', { className: 'card-body' });
    const nameEl = el('div', { className: 'card-name' }); nameEl.textContent = exam.name;
    const agEl   = el('div', { className: 'card-agency' }); agEl.textContent = exam.agency || '';
    body.appendChild(nameEl);
    body.appendChild(agEl);

    const chips = el('div', { className: 'card-chips' });
    chips.appendChild(makeBadge(status, status === 'open' ? 'Open' : 'Closed'));
    if (exam.deadlineDate) {
      const dl = el('span', { className: `${dlClass(exam)}`, style: { fontSize: '10px', fontWeight: '600' } });
      dl.textContent = '⏰ ' + fmtDate(exam.deadlineDate);
      chips.appendChild(dl);
    }
    const tagBadge = makeTagBadge(exam.tag);
    if (tagBadge) chips.appendChild(tagBadge);
    body.appendChild(chips);
    top.appendChild(body);

    // Applied toggle
    const appliedWrap = el('div', { className: 'card-applied-wrap' });
    const apCb = el('div', { className: `row-checkbox${exam.applied ? ' checked' : ''}`, 'data-action': 'toggle-applied', 'data-id': exam.id });
    const apLbl = el('span', { className: 'card-applied-label' });
    apLbl.textContent = 'applied';
    appliedWrap.appendChild(apCb);
    appliedWrap.appendChild(apLbl);
    top.appendChild(appliedWrap);
    card.appendChild(top);

    // Expanded detail
    if (isExpanded) {
      const detail = el('div', { className: 'card-detail' });

      if (exam.eligibility) {
        const sec = el('div', { className: 'card-detail-section' });
        const lbl = el('div', { className: 'card-detail-label' }); lbl.textContent = 'Eligibility';
        const txt = el('div', { className: 'card-detail-text' });
        txt.textContent = exam.eligibility.replace(/[#*`>|]/g, '').trim().slice(0, 150);
        sec.appendChild(lbl); sec.appendChild(txt);
        detail.appendChild(sec);
      }

      if (exam.syllabus) {
        const sec = el('div', { className: 'card-detail-section' });
        const lbl = el('div', { className: 'card-detail-label' }); lbl.textContent = 'Syllabus';
        const txt = el('div', { className: 'card-detail-text' });
        txt.textContent = exam.syllabus.replace(/[#*`>|]/g, '').trim().slice(0, 150);
        sec.appendChild(lbl); sec.appendChild(txt);
        detail.appendChild(sec);
      }

      if (exam.syllabusPdf) {
        const pdfLink = el('a', { className: 'exp-pdf-link', href: exam.syllabusPdf, target: '_blank', style: { marginBottom: '8px' } });
        pdfLink.innerHTML = '📄 Syllabus PDF';
        detail.appendChild(pdfLink);
      }

      if (exam.resources?.length > 0) {
        const sec = el('div', { className: 'card-detail-section' });
        const lbl = el('div', { className: 'card-detail-label' }); lbl.textContent = '📎 Resources';
        sec.appendChild(lbl);
        exam.resources.forEach(r => {
          const a = el('a', { href: r.url, target: '_blank', rel: 'noopener', style: { display: 'block', fontSize: '11px', color: 'var(--accent)', marginTop: '3px' } });
          a.textContent = r.label || r.url;
          sec.appendChild(a);
        });
        detail.appendChild(sec);
      }

      if (exam.website) {
        const a = el('a', { href: exam.website, target: '_blank', rel: 'noopener', style: { fontSize: '11px', color: 'var(--accent)' } });
        a.textContent = '🌐 ' + exam.website.replace(/^https?:\/\//, '');
        detail.appendChild(a);
      }

      card.appendChild(detail);
    }

    // Action buttons
    const actions = el('div', { className: 'card-actions' });
    const detailBtn = el('button', { className: 'card-btn', 'data-action': 'toggle-expand', 'data-id': exam.id });
    detailBtn.textContent = isExpanded ? 'Collapse ▴' : 'Details ▾';
    const editBtn = el('button', { className: 'card-btn', 'data-action': 'open-edit', 'data-id': exam.id });
    editBtn.textContent = '✏ Edit';
    const delBtn  = el('button', { className: 'card-btn danger', 'data-action': 'delete-exam', 'data-id': exam.id });
    delBtn.textContent = '🗑';
    actions.appendChild(detailBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);

    container.appendChild(card);
  });
}

// ── SECTION 24: Add / Edit Exam Panel ────────────────────────────
function openAddExam() {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  editId    = null;
  panelMode = 'add';
  openExamForm(null);
}

function openEditExam(id) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  editId    = id;
  panelMode = 'edit';
  openExamForm(exam);
}

function openExamForm(exam) {
  const isEdit = !!exam;

  openPanel(container => {
    container.appendChild(makePanelHeader({
      title: isEdit ? 'Edit Exam' : 'Add New Exam',
      subtitle: isEdit ? exam.name : 'Fill in what you know'
    }));

    const body = el('div', { className: 'panel-body' });
    const form = el('div', { className: 'panel-form' });

    // Basic
    form.appendChild(makeFormRow([
      makeField('f-name',   'Exam Name', 'text', exam?.name   || '', 'e.g. UPSC CSE 2025', true),
      makeField('f-agency', 'Agency',    'text', exam?.agency || '', 'e.g. UPSC', true)
    ]));
    form.appendChild(makeFormRow([
      makeField('f-deadline', 'App. Deadline', 'date', exam?.deadlineDate || ''),
      makeField('f-examdate', 'Exam Date',     'date', exam?.examDate     || '')
    ]));
    form.appendChild(makeField('f-website', 'Official Website', 'url', exam?.website || '', 'https://'));

    // Tag select
    const tagDiv = el('div', { className: 'form-group' });
    const tagLbl = el('label', { className: 'panel-form-label', htmlFor: 'f-tag' });
    tagLbl.textContent = 'Tag';
    const tagSel = el('select', { className: 'panel-input', id: 'f-tag', style: { cursor: 'pointer' } });
    const emptyOpt = el('option', { value: '' }); emptyOpt.textContent = '— No tag —';
    tagSel.appendChild(emptyOpt);
    tags.forEach(t => {
      const o = el('option', { value: t.id });
      o.textContent = t.name;
      if (exam?.tag === t.id) o.selected = true;
      tagSel.appendChild(o);
    });
    tagDiv.appendChild(tagLbl);
    tagDiv.appendChild(tagSel);
    form.appendChild(tagDiv);

    // Eligible
    const eligDiv = el('div', { className: 'form-group' });
    const eligLbl = el('label', { className: 'panel-form-label', htmlFor: 'f-eligible' });
    eligLbl.textContent = 'Eligible';
    const eligSel = el('select', { className: 'panel-input', id: 'f-eligible', style: { cursor: 'pointer' } });
    [['no', 'No'], ['yes', 'Yes']].forEach(([v, t]) => {
      const o = el('option', { value: v }); o.textContent = t;
      if ((exam?.eligible || 'no') === v) o.selected = true;
      eligSel.appendChild(o);
    });
    eligDiv.appendChild(eligLbl);
    eligDiv.appendChild(eligSel);
    form.appendChild(eligDiv);

    // Eligibility section
    const divElig = el('div', { className: 'panel-section-divider' });
    divElig.textContent = 'Eligibility';
    form.appendChild(divElig);
    form.appendChild(makeTextareaField('f-elig-summary', 'Summary', exam?.eligibility || '', 'Age, qualification, nationality…', 60));

    // Syllabus section
    const divSyl = el('div', { className: 'panel-section-divider' });
    divSyl.textContent = 'Syllabus';
    form.appendChild(divSyl);
    form.appendChild(makeTextareaField('f-syl-summary', 'Summary', exam?.syllabus || '', 'Key subjects, topics…', 60));
    form.appendChild(makeField('f-syl-pdf', 'Syllabus PDF Link', 'url', exam?.syllabusPdf || '', 'https://… or Google Drive link'));

    // Pattern section
    const divPat = el('div', { className: 'panel-section-divider' });
    divPat.textContent = 'Exam Pattern';
    form.appendChild(divPat);
    form.appendChild(makeTextareaField('f-pat-summary', 'Summary', exam?.pattern || '', 'Stages, marks, negative marking…', 60));

    // Resources
    const divRes = el('div', { className: 'panel-section-divider' });
    divRes.textContent = 'Resources';
    form.appendChild(divRes);

    const resContainer = el('div', { id: 'form-resources' });
    const localResources = [...(exam?.resources || [])];

    function rebuildFormResources() {
      resContainer.innerHTML = '';
      localResources.forEach((r, i) => {
        const item = el('div', { className: 'panel-res-item' });
        item.appendChild(svgIcon(ICONS.link, 13));
        const lbl = el('span');
        lbl.textContent = r.label || r.url;
        lbl.title = r.url;
        const del = el('button', { className: 'panel-res-del' });
        del.textContent = '×';
        del.addEventListener('click', () => { localResources.splice(i, 1); rebuildFormResources(); });
        item.appendChild(lbl); item.appendChild(del);
        resContainer.appendChild(item);
      });

      const addLinkRow = el('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } });
      const linkInp = el('input', { className: 'panel-input', type: 'url', placeholder: 'Paste PDF, YouTube, or Reddit link…', style: { fontSize: '11px' } });
      const addLinkBtn = el('button', { className: 'btn btn-ghost', style: { whiteSpace: 'nowrap', fontSize: '11px', padding: '6px 10px' } });
      addLinkBtn.textContent = '+ Add';
      addLinkBtn.addEventListener('click', () => {
        const url = linkInp.value.trim();
        if (!url) return;
        localResources.push({ url, label: '', type: detectLinkType(url) });
        linkInp.value = '';
        rebuildFormResources();
      });
      linkInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addLinkBtn.click(); } });
      addLinkRow.appendChild(linkInp);
      addLinkRow.appendChild(addLinkBtn);
      resContainer.appendChild(addLinkRow);
    }

    rebuildFormResources();
    form.appendChild(resContainer);

    // Notes + toggles
    const divOpts = el('div', { className: 'panel-section-divider' });
    divOpts.textContent = 'Notes & Options';
    form.appendChild(divOpts);
    form.appendChild(makeTextareaField('f-notes', 'Personal Notes', exam?.notes || '', 'Private notes…', 50));

    // Toggles
    const appliedToggle = makeToggleRow('Applied', !!exam?.applied, 'f-toggle-applied');
    const pinnedToggle  = makeToggleRow('Pin to Countdown (max 3)', !!exam?.pinned, 'f-toggle-pinned');
    form.appendChild(appliedToggle);
    form.appendChild(pinnedToggle);

    body.appendChild(form);
    container.appendChild(body);

    // Footer
    const cancelBtn = el('button', { className: 'btn btn-ghost' });
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closePanel);

    const saveBtn = el('button', { className: 'btn btn-accent' });
    saveBtn.textContent = isEdit ? 'Save Changes' : 'Save Exam';
    saveBtn.addEventListener('click', () => saveExamForm(localResources));

    container.appendChild(makePanelFooter([cancelBtn, 'spacer', saveBtn]));
  });
}

function makeField(id, label, type, value, placeholder = '', required = false) {
  const group = el('div', { className: 'form-group' });
  const lbl   = el('label', { className: 'panel-form-label', htmlFor: id });
  lbl.innerHTML = label + (required ? ' <span class="req">*</span>' : '');
  const inp = el('input', { className: 'panel-input', type, id, value: value || '', placeholder: placeholder || '' });
  group.appendChild(lbl);
  group.appendChild(inp);
  return group;
}

function makeTextareaField(id, label, value, placeholder, minHeight = 72) {
  const group = el('div', { className: 'form-group' });
  const lbl   = el('label', { className: 'panel-form-label', htmlFor: id });
  lbl.textContent = label;
  const ta = el('textarea', { className: 'panel-textarea', id, placeholder: placeholder || '' });
  ta.style.minHeight = minHeight + 'px';
  ta.textContent = value || '';
  group.appendChild(lbl);
  group.appendChild(ta);
  return group;
}

function makeFormRow(fields) {
  const row = el('div', { className: 'form-row' });
  fields.forEach(f => row.appendChild(f));
  return row;
}

function makeToggleRow(label, on, id) {
  const row = el('div', { className: 'toggle-row' });
  const lbl = el('span', { className: 'toggle-label' });
  lbl.textContent = label;
  const sw = el('div', { className: `toggle-switch${on ? ' on' : ''}`, id });
  sw.addEventListener('click', () => sw.classList.toggle('on'));
  row.appendChild(lbl);
  row.appendChild(sw);
  return row;
}

function fv(id) {
  const e = qs(`#${id}`);
  return e ? (e.tagName === 'TEXTAREA' ? e.value.trim() : (e.value || '').trim()) : '';
}

function fToggle(id) {
  return qs(`#${id}`)?.classList.contains('on') || false;
}

async function saveExamForm(localResources = []) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const name   = fv('f-name');
  const agency = fv('f-agency');
  if (!name)   { toast('Exam name is required.', 'err'); return; }
  if (!agency) { toast('Agency is required.', 'err'); return; }

  // Check pin limit
  const willPin = fToggle('f-toggle-pinned');
  if (willPin) {
    const pinnedCount = exams.filter(e => e.pinned && e.id !== editId).length;
    if (pinnedCount >= 3) { toast('Max 3 exams can be pinned.', 'warn'); return; }
  }

  setSyncDot('saving');
  try {
    let exam;
    if (editId) {
      exam = exams.find(e => e.id === editId);
      if (!exam) return;
    } else {
      exam = { id: uid(), createdAt: now() };
    }

    exam.name         = name;
    exam.agency       = agency;
    exam.tag          = fv('f-tag');
    exam.eligible     = qs('#f-eligible')?.value || 'no';
    exam.deadlineDate = fv('f-deadline');
    exam.examDate     = fv('f-examdate');
    exam.website      = fv('f-website');
    exam.eligibility  = fv('f-elig-summary');
    exam.syllabus     = fv('f-syl-summary');
    exam.syllabusPdf  = fv('f-syl-pdf');
    exam.pattern      = fv('f-pat-summary');
    exam.notes        = fv('f-notes');
    exam.applied      = fToggle('f-toggle-applied');
    exam.pinned       = willPin;
    exam.resources    = localResources;

    await saveExamDoc(exam);

    if (editId) {
      const idx = exams.findIndex(e => e.id === editId);
      if (idx !== -1) exams[idx] = exam;
    } else {
      exams.push(exam);
    }

    editId = null;
    setSyncDot('ok');
    toast(editId ? 'Changes saved' : 'Exam added');
    closePanel();
    render();
  } catch(err) {
    setSyncDot('err');
    toast('Save failed. Check connection.', 'err');
  }
}

// ── SECTION 25: Markdown Editor Panel ────────────────────────────
const MD_FIELD_LABELS = {
  eligibility: '🎓 Eligibility',
  syllabus:    '📋 Syllabus',
  pattern:     '📊 Exam Pattern'
};

function openMarkdownEditor(examId, field) {
  const exam = exams.find(e => e.id === examId);
  if (!exam) return;
  mdCurrentExamId = examId;
  mdCurrentField  = field;

  const label = MD_FIELD_LABELS[field] || field;

  openPanel(container => {
    container.classList.add('md-mode'); // widen panel

    container.appendChild(makePanelHeader({
      title: `${label} — ${exam.name}`,
      subtitle: 'Markdown · write freely, preview live',
      showBack: false
    }));

    // Toolbar
    const toolbar = el('div', { className: 'md-toolbar' });
    const tools = [
      { label: 'B',        insert: '**bold**' },
      { label: 'I',        insert: '*italic*' },
      { label: 'H1',       insert: '## Heading\n' },
      { label: 'H2',       insert: '### Sub-heading\n' },
      { sep: true },
      { label: '• List',   insert: '- Item 1\n- Item 2\n- Item 3\n' },
      { label: '1. List',  insert: '1. First\n2. Second\n3. Third\n' },
      { sep: true },
      { label: '⊞ Table',  insert: '| Col 1 | Col 2 | Col 3 |\n|---|---|---|\n| A | B | C |\n| D | E | F |\n' },
      { label: '— HR',     insert: '\n---\n' },
      { label: '" Quote',  insert: '> Your quote here\n' },
      { sep: true },
      { label: '`code`',   insert: '`code`' },
    ];

    tools.forEach(t => {
      if (t.sep) {
        toolbar.appendChild(el('div', { className: 'md-tool-sep' }));
      } else {
        const btn = el('button', { className: 'md-tool-btn', title: t.label });
        btn.textContent = t.label;
        btn.addEventListener('click', () => insertMdAt(t.insert));
        toolbar.appendChild(btn);
      }
    });

    const hint = el('span', { className: 'md-emoji-hint' });
    hint.textContent = 'emoji: just type 🎯 ✅ ⚠️';
    toolbar.appendChild(hint);

    // MD panel body (split pane)
    const mdBody = el('div', { className: 'md-panel-body' });
    mdBody.appendChild(toolbar);

    const split = el('div', { className: 'md-split' });

    // Editor pane
    const editorPane = el('div', { className: 'md-editor-pane' });
    const editorLabel = el('div', { className: 'md-pane-label' });
    editorLabel.textContent = '✏ Write';
    const textarea = el('textarea', { className: 'md-textarea', id: 'md-textarea', spellcheck: 'true' });
    textarea.value = exam[field] || '';
    editorPane.appendChild(editorLabel);
    editorPane.appendChild(textarea);

    // Preview pane
    const previewPane = el('div', { className: 'md-preview-pane' });
    const previewLabel = el('div', { className: 'md-pane-label' });
    previewLabel.textContent = '👁 Preview';
    const preview = el('div', { className: 'md-preview', id: 'md-preview' });
    previewPane.appendChild(previewLabel);
    previewPane.appendChild(preview);

    // Live preview on input
    textarea.addEventListener('input', () => {
      preview.innerHTML = renderMarkdown(textarea.value);
    });

    // Initial render
    preview.innerHTML = renderMarkdown(textarea.value);

    split.appendChild(editorPane);
    split.appendChild(previewPane);
    mdBody.appendChild(split);
    container.appendChild(mdBody);

    // Footer
    const hint2 = el('span', { className: 'md-panel-footer-hint' });
    hint2.textContent = '💡 **bold**  *italic*  ## H2  | table |  - list  > quote  `code`  🎯';

    const cancelBtn = el('button', { className: 'btn btn-ghost' });
    cancelBtn.textContent = '← Back';
    cancelBtn.addEventListener('click', closePanel);

    const saveBtn = el('button', { className: 'btn btn-accent' });
    saveBtn.textContent = 'Save Changes';
    saveBtn.addEventListener('click', () => saveMdField(textarea.value));

    container.appendChild(makePanelFooter([hint2, 'spacer', cancelBtn, saveBtn]));
  });
}

function insertMdAt(text) {
  const ta = qs('#md-textarea');
  if (!ta) return;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const before = ta.value.slice(0, start);
  const after  = ta.value.slice(end);
  ta.value = before + text + after;
  ta.focus();
  ta.selectionStart = ta.selectionEnd = start + text.length;
  // Trigger preview update
  ta.dispatchEvent(new Event('input'));
}

async function saveMdField(value) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const exam = exams.find(e => e.id === mdCurrentExamId);
  if (!exam) return;
  setSyncDot('saving');
  try {
    exam[mdCurrentField] = value;
    await saveExamDoc(exam);
    const idx = exams.findIndex(e => e.id === mdCurrentExamId);
    if (idx !== -1) exams[idx] = exam;
    setSyncDot('ok');
    toast('Saved');
    closePanel();
    render();
  } catch(err) {
    setSyncDot('err');
    toast('Save failed.', 'err');
  }
}

// Lightweight markdown renderer (no external lib needed)
function renderMarkdown(md) {
  if (!md) return '';
  let html = md
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // --- Block elements (process line by line) ---
  const lines = html.split('\n');
  const out   = [];
  let inTable = false;
  let tableRows = [];

  function flushTable() {
    if (tableRows.length === 0) return;
    let tableHtml = '<table>';
    tableRows.forEach((row, i) => {
      const cells = row.split('|').map(c => c.trim()).filter((c, ci, arr) => ci > 0 && ci < arr.length - 1);
      if (i === 0) {
        tableHtml += '<thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      } else if (i === 1 && row.includes('---')) {
        // separator row — skip
      } else {
        tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
    });
    tableHtml += '</tbody></table>';
    out.push(tableHtml);
    tableRows = [];
    inTable   = false;
  }

  lines.forEach(line => {
    // Table row
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      tableRows.push(line.trim());
      return;
    } else if (inTable) {
      flushTable();
    }

    if      (/^### (.+)/.test(line))  out.push(line.replace(/^### (.+)/, '<h3>$1</h3>'));
    else if (/^## (.+)/.test(line))   out.push(line.replace(/^## (.+)/,  '<h2>$1</h2>'));
    else if (/^# (.+)/.test(line))    out.push(line.replace(/^# (.+)/,   '<h1>$1</h1>'));
    else if (/^&gt; (.+)/.test(line)) out.push(line.replace(/^&gt; (.+)/, '<blockquote>$1</blockquote>'));
    else if (/^---$/.test(line.trim())) out.push('<hr/>');
    else if (/^- (.+)/.test(line))    out.push(line.replace(/^- (.+)/, '<li>$1</li>'));
    else if (/^\d+\. (.+)/.test(line)) out.push(line.replace(/^\d+\. (.+)/, '<li>$1</li>'));
    else if (line.trim() === '')       out.push('<br/>');
    else out.push(`<p>${line}</p>`);
  });

  if (inTable) flushTable();

  let result = out.join('\n');

  // --- Inline elements ---
  result = result
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code>$1</code>');

  // Wrap consecutive <li> in <ul>
  result = result.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  return result;
}

// ── SECTION 26: Tag Manager Modal ────────────────────────────────
function openTagsManager() {
  buildTagManagerModal();
  qs('#tag-manager-modal')?.classList.add('open');
}

function buildTagManagerModal() {
  // Build inside the existing modal overlay structure
  openModal({
    title: '⚙ Manage Tags',
    body: '',
    confirmText: 'Done',
    confirmClass: 'btn-accent',
    confirmAction: 'close-modal'
  });

  // Replace body with tag list
  const body = qs('#modal-body');
  if (!body) return;

  function rebuild() {
    body.innerHTML = '';
    const sub = el('p', { style: { fontSize: '11px', color: 'var(--muted)', marginBottom: '14px' } });
    sub.textContent = 'Click a tag to filter. Add, rename, or delete below.';
    body.appendChild(sub);

    const list = el('div', { className: 'tag-manager-list' });

    tags.forEach(tag => {
      const inUse  = exams.some(e => e.tag === tag.id);
      const item   = el('div', { className: 'tag-manager-item' });
      const dot    = el('div', { className: 'tag-manager-dot' });
      dot.style.background = tag.color;
      const name   = el('span', { className: 'tag-manager-name' });
      name.textContent = tag.name;

      const actions = el('div', { className: 'tag-manager-actions' });

      // Rename
      const renameBtn = el('button', { className: 'tag-manager-btn' });
      renameBtn.textContent = '✏ Rename';
      renameBtn.addEventListener('click', () => {
        const newName = prompt('Rename tag:', tag.name);
        if (!newName || newName === tag.name) return;
        tag.name = newName.trim();
        if (!isOffline) saveUserDoc().then(() => { toast('Tag renamed'); render(); rebuild(); }).catch(() => toast('Save failed.', 'err'));
        else { render(); rebuild(); }
      });

      // Delete
      const delBtn = el('button', { className: 'tag-manager-btn del', title: inUse ? 'Remove from all exams first' : 'Delete tag' });
      delBtn.textContent = '✕ Delete';
      if (inUse) delBtn.disabled = true;
      delBtn.addEventListener('click', async () => {
        if (inUse) { toast('Tag is in use. Remove it from all exams first.', 'warn'); return; }
        if (!confirm(`Delete tag "${tag.name}"?`)) return;
        tags = tags.filter(t => t.id !== tag.id);
        filterState.tags = filterState.tags.filter(id => id !== tag.id);
        if (!isOffline) {
          try { await saveUserDoc(); toast('Tag deleted'); } catch(e) { toast('Save failed.', 'err'); }
        }
        render(); rebuild();
      });

      actions.appendChild(renameBtn);
      actions.appendChild(delBtn);
      item.appendChild(dot);
      item.appendChild(name);
      item.appendChild(actions);
      list.appendChild(item);
    });

    body.appendChild(list);

    // Add new tag
    const newForm = el('div', { className: 'new-tag-form' });
    const colorPicker = el('input', { type: 'color', className: 'color-picker-input', value: '#e07b2a', title: 'Tag color' });
    const nameInp = el('input', { className: 'panel-input', type: 'text', placeholder: 'New tag name…', style: { flex: '1', fontSize: '12px' } });
    const addBtn  = el('button', { className: 'btn btn-accent', style: { padding: '6px 12px', fontSize: '12px' } });
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', async () => {
      const tname = nameInp.value.trim();
      if (!tname) return;
      const color  = colorPicker.value;
      // Simple bg: color at 15% opacity (approximated as darkened hex)
      const newTag = { id: uid(), name: tname, color, bg: color + '22' };
      tags.push(newTag);
      nameInp.value = '';
      if (!isOffline) {
        try { await saveUserDoc(); toast('Tag added'); } catch(e) { toast('Save failed.', 'err'); }
      }
      render(); rebuild();
    });
    nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });
    newForm.appendChild(colorPicker);
    newForm.appendChild(nameInp);
    newForm.appendChild(addBtn);
    body.appendChild(newForm);
  }

  rebuild();
}

// ── SECTION 27: Export / Import ───────────────────────────────────
function exportJSON() {
  closeAllDropdowns();
  const data = { version: 2, exportedAt: new Date().toISOString(), profile, settings, tags, exams };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `examtracker-${todayStr()}.json`);
  toast('Exported JSON');
}

function exportCSV() {
  closeAllDropdowns();
  const headers = ['name','agency','tag','deadlineDate','status','eligible','applied','website','notes'];
  const rows    = [headers.join(',')];
  exams.forEach(e => {
    const tagName = tags.find(t => t.id === e.tag)?.name || '';
    rows.push([
      csvEsc(e.name), csvEsc(e.agency), csvEsc(tagName),
      csvEsc(e.deadlineDate), csvEsc(computeStatus(e)),
      csvEsc(e.eligible), e.applied ? 'true' : 'false',
      csvEsc(e.website), csvEsc(e.notes)
    ].join(','));
  });
  downloadBlob(new Blob([rows.join('\n')], { type: 'text/csv' }), `examtracker-${todayStr()}.csv`);
  toast('Exported CSV');
}

function triggerImport() {
  closeAllDropdowns();
  qs('#import-file-input')?.click();
}

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data      = JSON.parse(e.target.result);
      const incoming  = Array.isArray(data.exams) ? data.exams : [];
      const existing  = new Set(exams.map(x => x.id));
      const newExams  = incoming.filter(x => x.id && !existing.has(x.id));
      openImportPreview(newExams, incoming.length - newExams.length);
    } catch(err) { toast('Invalid JSON file.', 'err'); }
  };
  reader.readAsText(file);
}

let _importQueue = [];
function openImportPreview(newExams, skipped) {
  _importQueue = newExams;
  openModal({
    title: 'Import Preview',
    body: `<strong>${newExams.length}</strong> new exams will be imported. <strong>${skipped}</strong> skipped (already exist).<br/>${newExams.map(e => `<br/>• ${e.name || 'Unnamed'}`).join('')}`,
    confirmText: `Import ${newExams.length} Exam${newExams.length !== 1 ? 's' : ''}`,
    confirmClass: 'btn-accent',
    confirmAction: 'confirm-import'
  });
  if (newExams.length === 0) qs('#modal-confirm-btn').disabled = true;
}

async function confirmImport() {
  if (isOffline) { toast('Offline — cannot import.', 'err'); return; }
  if (_importQueue.length === 0) { closeModal(); return; }
  setSyncDot('saving');
  try {
    const batch = db.batch();
    _importQueue.forEach(exam => {
      exam.updatedAt = now();
      batch.set(examRef(exam.id), exam);
    });
    await batch.commit();
    exams.push(..._importQueue);
    writeCache();
    setSyncDot('ok');
    toast(`Imported ${_importQueue.length} exams`);
    _importQueue = [];
    closeModal();
    render();
  } catch(e) {
    setSyncDot('err');
    toast('Import failed.', 'err');
  }
}

// ── SECTION 28: Profile Panel ─────────────────────────────────────
function openProfile() {
  closeAllDropdowns();
  panelMode = 'profile';

  openPanel(container => {
    container.appendChild(makePanelHeader({ title: 'Profile & Settings' }));

    const body = el('div', { className: 'panel-body', style: { padding: '0' } });

    // Avatar + name
    const user = auth.currentUser;
    const displayName = profile.displayName || user?.displayName || user?.email || '';
    const initials    = displayName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || '?';

    const ph = el('div', { className: 'profile-header' });
    const av = el('div', { className: 'profile-avatar' }); av.textContent = initials;
    const pInfo = el('div');
    const pName  = el('div', { className: 'profile-name' }); pName.textContent = displayName;
    const pEmail = el('div', { className: 'profile-email' }); pEmail.textContent = user?.email || '';
    pInfo.appendChild(pName);
    pInfo.appendChild(pEmail);
    ph.appendChild(av); ph.appendChild(pInfo);
    body.appendChild(ph);

    // Stats
    const stats = el('div', { className: 'profile-stats' });
    const statData = [
      { num: exams.length,                     lbl: 'Exams'   },
      { num: exams.filter(e => e.applied).length, lbl: 'Applied' },
      { num: exams.filter(e => e.pinned).length,  lbl: 'Pinned'  }
    ];
    statData.forEach(s => {
      const box = el('div', { className: 'profile-stat-box' });
      const num = el('span', { className: 'stat-num' }); num.textContent = String(s.num);
      const lbl = el('span', { className: 'stat-label' }); lbl.textContent = s.lbl;
      box.appendChild(num); box.appendChild(lbl);
      stats.appendChild(box);
    });
    body.appendChild(stats);

    // Account actions
    const acctSection = el('div', { className: 'profile-section' });
    const acctTitle   = el('div', { className: 'profile-section-title' }); acctTitle.textContent = 'Account';
    acctSection.appendChild(acctTitle);

    function makeProfileBtn(icon, text, cls = '') {
      const btn = el('button', { className: `profile-action-btn${cls ? ' ' + cls : ''}` });
      btn.appendChild(svgIcon(icon, 13));
      btn.appendChild(document.createTextNode(text));
      return btn;
    }

    const editNameBtn = makeProfileBtn(ICONS.user, 'Edit Display Name');
    editNameBtn.addEventListener('click', async () => {
      const n = prompt('Enter new display name:', profile.displayName || '');
      if (!n) return;
      profile.displayName = n.trim();
      if (!isOffline) {
        try { await saveUserDoc(); await auth.currentUser.updateProfile({ displayName: n.trim() }); toast('Name updated'); updateTopbar(); } catch(e) { toast('Update failed.', 'err'); }
      }
    });

    const chPwBtn = makeProfileBtn(ICONS.lock, 'Change Password');
    chPwBtn.addEventListener('click', doChangePassword);

    acctSection.appendChild(editNameBtn);
    acctSection.appendChild(chPwBtn);
    body.appendChild(acctSection);

    // Data
    const dataSection = el('div', { className: 'profile-section' });
    const dataTitle   = el('div', { className: 'profile-section-title' }); dataTitle.textContent = 'Data';
    dataSection.appendChild(dataTitle);

    const expJsonBtn = makeProfileBtn(ICONS.download, 'Export as JSON');
    expJsonBtn.addEventListener('click', exportJSON);
    const expCsvBtn  = makeProfileBtn(ICONS.download, 'Export as CSV');
    expCsvBtn.addEventListener('click', exportCSV);
    const impBtn     = makeProfileBtn(ICONS.upload, 'Import JSON');
    impBtn.addEventListener('click', triggerImport);

    dataSection.appendChild(expJsonBtn);
    dataSection.appendChild(expCsvBtn);
    dataSection.appendChild(impBtn);
    body.appendChild(dataSection);

    // Danger
    const dangerSection = el('div', { className: 'profile-section' });
    const dangerTitle   = el('div', { className: 'profile-section-title' }); dangerTitle.textContent = 'Danger Zone';
    dangerSection.appendChild(dangerTitle);

    const logoutBtn = makeProfileBtn(ICONS.logout, 'Sign Out');
    logoutBtn.addEventListener('click', doLogout);
    const delBtn    = makeProfileBtn(ICONS.trash, 'Delete Account Permanently', 'danger');
    delBtn.addEventListener('click', startDeleteAccount);

    dangerSection.appendChild(logoutBtn);
    dangerSection.appendChild(delBtn);
    body.appendChild(dangerSection);

    container.appendChild(body);
  });
}

// ── SECTION 29: Exam Quick Actions ───────────────────────────────
async function toggleApplied(id) {
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  exam.applied = !exam.applied;
  // Optimistic UI
  render();
  if (!isOffline) {
    setSyncDot('saving');
    try { await saveExamDoc(exam); setSyncDot('ok'); writeCache(); }
    catch(e) { exam.applied = !exam.applied; setSyncDot('err'); toast('Save failed.', 'err'); render(); }
  }
}

async function togglePin(id) {
  if (isOffline) { toast('Offline — cannot save.', 'err'); return; }
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  if (!exam.pinned && exams.filter(e => e.pinned).length >= 3) {
    toast('Max 3 exams can be pinned.', 'warn'); return;
  }
  exam.pinned = !exam.pinned;
  render();
  setSyncDot('saving');
  try { await saveExamDoc(exam); setSyncDot('ok'); }
  catch(e) { exam.pinned = !exam.pinned; setSyncDot('err'); toast('Save failed.', 'err'); render(); }
}

async function confirmDeleteExam(id) {
  if (isOffline) { toast('Offline — cannot delete.', 'err'); return; }
  const exam = exams.find(e => e.id === id);
  if (!exam) return;
  if (!confirm(`Delete "${exam.name}"? This cannot be undone.`)) return;
  setSyncDot('saving');
  try {
    await deleteExamDoc(id);
    exams = exams.filter(e => e.id !== id);
    expandedExamIds.delete(id);
    setSyncDot('ok');
    toast('Exam deleted');
    closePanel();
    render();
  } catch(e) {
    setSyncDot('err');
    toast('Delete failed.', 'err');
  }
}

// ── SECTION 30: Event Listeners ───────────────────────────────────

// Global click delegation
document.addEventListener('click', e => {
  // Close dropdowns on outside click
  if (!e.target.closest('.dropdown-wrap')) closeAllDropdowns();
  if (!e.target.closest('.filter-tag-wrap')) closeTagDropdown();
  if (!e.target.closest('.resources-wrap')) {
    qsa('.resources-popover.open').forEach(p => p.classList.remove('open'));
  }

  const btn    = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = btn.dataset.id;

  switch (action) {
    // Auth
    case 'do-signin':    doSignIn();   break;
    case 'do-signup':    doSignUp();   break;
    case 'do-google':    doGoogle();   break;
    case 'do-forgot':    doForgot();   break;
    case 'show-forgot':  e.preventDefault(); showForgot();  break;
    case 'show-signin':  e.preventDefault(); showSignIn();  break;

    // Topbar
    case 'open-search':  openSearch();  break;
    case 'close-search': closeSearch(); break;
    case 'toggle-theme': toggleTheme(); break;
    case 'trigger-import': triggerImport(); break;
    case 'export-json':  exportJSON();  break;
    case 'export-csv':   exportCSV();   break;
    case 'do-logout':    doLogout();    break;
    case 'change-password': doChangePassword(); break;
    case 'open-profile': closeAllDropdowns(); openProfile(); break;
    case 'delete-account': startDeleteAccount(); break;

    // Modal
    case 'close-modal':           closeModal();            break;
    case 'confirm-delete-account': confirmDeleteAccount(); break;
    case 'confirm-import':         confirmImport();        break;

    // Panel
    case 'close-panel': closePanel(); break;

    // Filters — status chips
    case 'filter-status':
      filterState.status = btn.dataset.status || 'all';
      qsa('.filter-chip.status-chip').forEach(c => c.classList.toggle('active', c.dataset.status === filterState.status));
      render();
      break;

    // Tag filter dropdown
    case 'toggle-tag-dropdown': toggleTagDropdown(); break;
    case 'open-tags-manager':   closeTagDropdown(); openTagsManager(); break;

    // Exam actions
    case 'add-exam':       openAddExam();          break;
    case 'open-edit':      openEditExam(id);       break;
    case 'delete-exam':    confirmDeleteExam(id);  break;
    case 'toggle-applied': toggleApplied(id);      break;
    case 'toggle-pin':     togglePin(id);          break;

    // Expand row
    case 'toggle-expand':
      if (expandedExamIds.has(id)) expandedExamIds.delete(id);
      else expandedExamIds.add(id);
      render();
      break;

    // Countdown ring click → expand that exam row
    case 'open-detail':
      expandedExamIds.add(id);
      render();
      // Scroll to row
      setTimeout(() => {
        const tr = document.querySelector(`[data-exam-id="${id}"]`);
        tr?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      break;

    // Bottom nav
    case 'nav-exams':   closePanel(); break;
    case 'nav-profile': openProfile(); break;
  }
});

// Topbar dropdown toggle buttons
qs('#export-btn')?.addEventListener('click', e => { e.stopPropagation(); toggleDropdown('export-dropdown'); });
qs('#user-btn')?.addEventListener('click',   e => { e.stopPropagation(); toggleDropdown('user-dropdown'); });

// Auth tabs
qsa('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    tab.dataset.authTab === 'signin' ? showSignIn() : showSignUp();
  });
});

// Enter key on auth forms
qs('#signin-email')?.addEventListener('keydown',    e => { if (e.key === 'Enter') qs('#signin-password')?.focus(); });
qs('#signin-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
qs('#signup-name')?.addEventListener('keydown',     e => { if (e.key === 'Enter') qs('#signup-email')?.focus(); });
qs('#signup-email')?.addEventListener('keydown',    e => { if (e.key === 'Enter') qs('#signup-password')?.focus(); });
qs('#signup-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSignUp(); });
qs('#forgot-email')?.addEventListener('keydown',    e => { if (e.key === 'Enter') doForgot(); });

// Escape key
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (qs('#search-overlay.open'))  { closeSearch(); return; }
  if (qs('#modal-overlay.open'))   { closeModal();  return; }
  if (qs('#side-panel.open'))      { closePanel();  return; }
  closeTagDropdown();
});

// Panel overlay backdrop
qs('#panel-overlay')?.addEventListener('click', closePanel);

// Modal backdrop
qs('#modal-overlay')?.addEventListener('click', e => {
  if (e.target === qs('#modal-overlay')) closeModal();
});

// Search input
qs('#search-input')?.addEventListener('input', e => {
  filterState.search = e.target.value.trim();
  render();
});

// Import file
qs('#import-file-input')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) handleImportFile(file);
  e.target.value = '';
});

// Table header sort
qsa('#exam-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (sortState.column === col) sortState.direction *= -1;
    else { sortState.column = col; sortState.direction = 1; }
    render();
  });
});

// Tag filter button
qs('#tag-filter-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleTagDropdown();
});

// ── SECTION 31: Auth State Listener ─── always last ───────────────
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    try { await loadData(); }
    catch(e) { /* loadData handles its own errors */ }
  } else {
    currentUser = null;
    exams = []; profile = {}; settings = {}; tags = [];
    expandedExamIds.clear();
    if (offlinePollTimer) { clearInterval(offlinePollTimer); offlinePollTimer = null; }
    closePanel();
    hideLoading();
    showScreen('auth');
    showSignIn();
  }
});

// Init theme on page load
initTheme();

// ████████████████████████████████████████████████████████████████
// END — app.js v2
// ████████████████████████████████████████████████████████████████
