// ═══════════════════════════════════════════════════════
//  EXAM TRACKER — app.js
//  Firebase: Auth (Email + Google) + Firestore
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Firebase Config ──────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC1aDvKtiUt_M68BdoCjXtrrV1QH3E6OdA",
  authDomain: "exam-tracker-81038.firebaseapp.com",
  projectId: "exam-tracker-81038",
  storageBucket: "exam-tracker-81038.firebasestorage.app",
  messagingSenderId: "286825354385",
  appId: "1:286825354385:web:586d46ef481cfb1afe9b30"
};

const app   = initializeApp(firebaseConfig);
const auth  = getAuth(app);
const db    = getFirestore(app);
const gProvider = new GoogleAuthProvider();

// ── App State ────────────────────────────────────────
let currentUser  = null;
let allExams     = [];
let filteredExams = [];
let activeStatus = 'all';
let activeTags   = new Set();
let searchQuery  = '';
let expandedCards = new Set();

// ── Auth State Listener ──────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    currentUser = user;
    showApp();
    loadExams();
    updateUserUI();
  } else {
    currentUser = null;
    showAuthScreen();
  }
});

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function updateUserUI() {
  if (!currentUser) return;
  const initials = (currentUser.displayName || currentUser.email || '?')
    .split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('profile-avatar-big').textContent = initials;
  document.getElementById('profile-name-display').textContent = currentUser.displayName || '(no name)';
  document.getElementById('profile-email-display').textContent = currentUser.email || '';
}

// ════════════════════════════════════════════════════
//  AUTH HANDLERS
// ════════════════════════════════════════════════════

window.switchAuthTab = (tab) => {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-tab')[tab === 'login' ? 0 : 1].classList.add('active');
  document.getElementById('login-form').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  clearAuthMessages();
};

function clearAuthMessages() {
  const e = document.getElementById('auth-error');
  const s = document.getElementById('auth-success');
  e.style.display = 'none';
  s.style.display = 'none';
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('auth-success').style.display = 'none';
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('auth-error').style.display = 'none';
}

window.handleLogin = async () => {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showAuthError('Please fill in all fields.');
  const btn = document.getElementById('login-btn-text');
  btn.innerHTML = '<span class="loading-spinner"></span>Signing in…';
  clearAuthMessages();
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    btn.textContent = 'Sign In';
    showAuthError(friendlyAuthError(e.code));
  }
};

window.handleRegister = async () => {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!name || !email || !password) return showAuthError('Please fill in all fields.');
  if (password.length < 6) return showAuthError('Password must be at least 6 characters.');
  const btn = document.getElementById('register-btn-text');
  btn.innerHTML = '<span class="loading-spinner"></span>Creating…';
  clearAuthMessages();
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) {
    btn.textContent = 'Create Account';
    showAuthError(friendlyAuthError(e.code));
  }
};

window.handleGoogleLogin = async () => {
  clearAuthMessages();
  try {
    await signInWithPopup(auth, gProvider);
  } catch (e) {
    showAuthError(friendlyAuthError(e.code));
  }
};

window.handleForgotPassword = async () => {
  const email = document.getElementById('login-email').value.trim();
  if (!email) return showAuthError('Enter your email above first.');
  try {
    await sendPasswordResetEmail(auth, email);
    showAuthSuccess('Reset email sent! Check your inbox.');
  } catch (e) {
    showAuthError(friendlyAuthError(e.code));
  }
};

function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email':            'Invalid email address.',
    'auth/user-not-found':           'No account found with this email.',
    'auth/wrong-password':           'Incorrect password.',
    'auth/email-already-in-use':     'This email is already registered.',
    'auth/weak-password':            'Password must be at least 6 characters.',
    'auth/too-many-requests':        'Too many attempts. Try again later.',
    'auth/popup-closed-by-user':     'Sign-in popup was closed.',
    'auth/invalid-credential':       'Invalid credentials. Check email and password.',
    'auth/network-request-failed':   'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Try again.';
}

// ════════════════════════════════════════════════════
//  FIRESTORE — EXAMS CRUD
// ════════════════════════════════════════════════════

function examsRef() {
  return collection(db, 'users', currentUser.uid, 'exams');
}

async function loadExams() {
  try {
    const q = query(examsRef(), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    allExams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  } catch (e) {
    console.error('loadExams error:', e);
    toast('Failed to load exams.', 'error');
  }
}

window.saveExam = async () => {
  const name    = document.getElementById('f-name').value.trim();
  const agency  = document.getElementById('f-agency').value.trim();
  if (!name || !agency) return toast('Exam name and agency are required.', 'error');

  const id = document.getElementById('exam-id').value;
  const pinned  = document.getElementById('f-pinned').checked;

  // Enforce max 3 pinned
  const pinnedCount = allExams.filter(e => e.pinned && e.id !== id).length;
  if (pinned && pinnedCount >= 3) {
    toast('Max 3 exams can be pinned. Unpin one first.', 'error');
    document.getElementById('f-pinned').checked = false;
    return;
  }

  const data = {
    name,
    agency,
    status:      document.getElementById('f-status').value,
    lastDate:    document.getElementById('f-last-date').value,
    examDate:    document.getElementById('f-exam-date').value,
    website:     document.getElementById('f-website').value.trim(),
    eligibility: modalDraft.eligibility,
    syllabus:    modalDraft.syllabus,
    pattern:     modalDraft.pattern,
    tags:        document.getElementById('f-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    applied:     document.getElementById('f-applied').checked,
    eligible:    document.getElementById('f-eligible') ? document.getElementById('f-eligible').checked : false,
    pinned,
  };

  const btn = document.getElementById('save-exam-btn');
  btn.innerHTML = '<span class="loading-spinner"></span>Saving…';
  btn.disabled = true;

  try {
    if (id) {
      await updateDoc(doc(db, 'users', currentUser.uid, 'exams', id), data);
      toast('Exam updated!', 'success');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(examsRef(), data);
      toast('Exam added!', 'success');
    }
    closeExamModal();
    await loadExams();
  } catch (e) {
    console.error(e);
    toast('Save failed. Try again.', 'error');
  } finally {
    btn.textContent = 'Save Exam';
    btn.disabled = false;
  }
};

window.deleteExam = async (id) => {
  openConfirm(
    'Delete Exam',
    'Are you sure you want to delete this exam? This cannot be undone.',
    false,
    async () => {
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'exams', id));
        toast('Exam deleted.', 'success');
        await loadExams();
      } catch (e) {
        toast('Delete failed.', 'error');
      }
    }
  );
};

window.toggleApplied = async (id) => {
  const exam = allExams.find(e => e.id === id);
  if (!exam) return;
  const newVal = !exam.applied;
  exam.applied = newVal;
  renderTable();
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'exams', id), { applied: newVal });
  } catch (e) {
    exam.applied = !newVal;
    renderTable();
    toast('Update failed.', 'error');
  }
};

window.togglePin = async (id) => {
  const exam = allExams.find(e => e.id === id);
  if (!exam) return;
  const newVal = !exam.pinned;
  if (newVal) {
    const pinnedCount = allExams.filter(e => e.pinned && e.id !== id).length;
    if (pinnedCount >= 3) return toast('Max 3 pinned exams. Unpin one first.', 'error');
  }
  exam.pinned = newVal;
  renderTable();
  renderCountdowns();
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'exams', id), { pinned: newVal });
  } catch (e) {
    exam.pinned = !newVal;
    renderTable();
    renderCountdowns();
    toast('Update failed.', 'error');
  }
};

// ════════════════════════════════════════════════════
//  EXAM MODAL — OPEN / CLOSE / POPULATE
// ════════════════════════════════════════════════════

// modalDraft holds temp values for eligibility/syllabus/pattern while modal is open
let modalDraft = { eligibility: '', syllabus: '', pattern: '' };

function setModalDraftPreview(field) {
  const el = document.getElementById('prev-' + field);
  if (!el) return;
  const val = modalDraft[field];
  if (val && val.trim()) {
    // Strip markdown for preview
    const plain = val
      .replace(/#{1,6} /g, '').replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1')
      .replace(/^[-*] /gm, '• ').replace(/^\d+\. /gm, '')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1').replace(/^---$/gm, '').trim();
    el.innerHTML = `<span style="white-space:pre-wrap">${escHtml(plain)}</span>`;
  } else {
    const labels = { eligibility: 'eligibility', syllabus: 'syllabus', pattern: 'exam pattern' };
    el.innerHTML = `<span class="md-field-empty">Click to add ${labels[field]}…</span>`;
  }
}

window.openAddExam = () => {
  document.getElementById('exam-modal-title').textContent = 'Add Exam';
  document.getElementById('exam-id').value = '';
  ['f-name','f-agency','f-last-date','f-exam-date','f-website','f-tags'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-status').value = 'open';
  document.getElementById('f-applied').checked = false;
  if (document.getElementById('f-eligible')) document.getElementById('f-eligible').checked = false;
  document.getElementById('f-pinned').checked = false;
  // Reset draft
  modalDraft = { eligibility: '', syllabus: '', pattern: '' };
  ['eligibility','syllabus','pattern'].forEach(setModalDraftPreview);
  document.getElementById('exam-modal').style.display = 'flex';
};

window.openEditExam = (id) => {
  const exam = allExams.find(e => e.id === id);
  if (!exam) return;
  document.getElementById('exam-modal-title').textContent = 'Edit Exam';
  document.getElementById('exam-id').value      = id;
  document.getElementById('f-name').value       = exam.name || '';
  document.getElementById('f-agency').value     = exam.agency || '';
  document.getElementById('f-status').value     = exam.status || 'open';
  document.getElementById('f-last-date').value  = exam.lastDate || '';
  document.getElementById('f-exam-date').value  = exam.examDate || '';
  document.getElementById('f-website').value    = exam.website || '';
  document.getElementById('f-tags').value       = (exam.tags || []).join(', ');
  document.getElementById('f-applied').checked  = !!exam.applied;
  if (document.getElementById('f-eligible')) document.getElementById('f-eligible').checked = !!exam.eligible;
  document.getElementById('f-pinned').checked   = !!exam.pinned;
  // Load draft from exam data
  modalDraft = {
    eligibility: exam.eligibility || '',
    syllabus:    exam.syllabus    || '',
    pattern:     exam.pattern     || '',
  };
  ['eligibility','syllabus','pattern'].forEach(setModalDraftPreview);
  document.getElementById('exam-modal').style.display = 'flex';
};

window.closeExamModal = () => {
  document.getElementById('exam-modal').style.display = 'none';
};

window.checkPinLimit = (checkbox) => {
  const id = document.getElementById('exam-id').value;
  const pinnedCount = allExams.filter(e => e.pinned && e.id !== id).length;
  if (checkbox.checked && pinnedCount >= 3) {
    toast('Max 3 pinned exams. Unpin one first.', 'error');
    checkbox.checked = false;
  }
};

// ════════════════════════════════════════════════════
//  RENDERING
// ════════════════════════════════════════════════════

function renderAll() {
  renderTagDropdown();
  applyFilters();
  renderCountdowns();
}

function applyFilters() {
  let exams = [...allExams];

  if (activeStatus === 'applied') {
    exams = exams.filter(e => e.applied);
  } else if (activeStatus !== 'all') {
    exams = exams.filter(e => e.status === activeStatus);
  }

  // active tags = multi-select
  if (activeTags.size > 0) {
    exams = exams.filter(e => (e.tags || []).some(t => activeTags.has(t)));
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    exams = exams.filter(e =>
      (e.name   || '').toLowerCase().includes(q) ||
      (e.agency || '').toLowerCase().includes(q) ||
      (e.tags   || []).some(t => t.toLowerCase().includes(q))
    );
  }
  filteredExams = exams;
  renderTable();
}

function renderTable() {
  const tbody  = document.getElementById('exam-tbody');
  const empty  = document.getElementById('list-empty');
  const scroll = document.getElementById('table-scroll');
  const count  = document.getElementById('table-count');

  count.textContent = `${filteredExams.length} exam${filteredExams.length !== 1 ? 's' : ''}`;

  if (filteredExams.length === 0) {
    empty.style.display  = 'block';
    scroll.style.display = 'none';
    return;
  }
  empty.style.display  = 'none';
  scroll.style.display = '';

  tbody.innerHTML = filteredExams.map((exam, i) => tableRowHTML(exam, i + 1)).join('');
}

function tableRowHTML(exam, num) {
  const isExpanded = expandedCards.has(exam.id);

  // Deadline
  const dateStr = exam.lastDate || exam.examDate;
  let deadlineHTML = '<span class="deadline-normal">—</span>';
  if (dateStr) {
    const days = daysUntil(dateStr);
    if (days === null)      deadlineHTML = '<span class="deadline-normal">—</span>';
    else if (days < 0)     deadlineHTML = `<span class="deadline-past">${formatDate(dateStr)}</span>`;
    else if (days <= 7)    deadlineHTML = `<span class="deadline-warn">${formatDate(dateStr)}</span>`;
    else if (days <= 30)   deadlineHTML = `<span class="deadline-ok">${formatDate(dateStr)}</span>`;
    else                   deadlineHTML = `<span class="deadline-normal">${formatDate(dateStr)}</span>`;
  }

  // Tags in main row — show first tag only
  const tags = exam.tags || [];
  let tagsHTML = '<span style="color:var(--muted)">—</span>';
  if (tags.length > 0) {
    tagsHTML = `<span class="tag-badge">${escHtml(tags[0])}</span>`;
    if (tags.length > 1) tagsHTML += `<span class="tag-more">+${tags.length - 1}</span>`;
  }

  const statusCls   = exam.status || 'open';
  const statusLabel = capitalize(statusCls);
  const eligibleCls = exam.eligible ? 'eligible-yes' : 'eligible-no';
  const eligibleLbl = exam.eligible ? 'Yes' : 'No';

  // ── EXPANDED PANEL ──────────────────────────────
  const detailRow = isExpanded ? `
  <tr class="detail-row">
    <td colspan="11">
      <div class="exp-panel">

        <!-- 3 detail cards -->
        <div class="exp-cards">

          <div class="exp-card">
            <div class="exp-card-head">
              <span class="exp-card-title">ELIGIBILITY</span>
              <button class="exp-edit-btn" onclick="openMdPanel('${exam.id}','eligibility')">↗ Edit / View</button>
            </div>
            <div class="exp-card-body">${exam.eligibility ? renderMdPreviewInline(exam.eligibility) : '<span class="exp-empty">Not added</span>'}</div>
          </div>

          <div class="exp-card">
            <div class="exp-card-head">
              <span class="exp-card-title">SYLLABUS</span>
              <button class="exp-edit-btn" onclick="openMdPanel('${exam.id}','syllabus')">↗ Edit / View</button>
            </div>
            <div class="exp-card-body">
              ${exam.syllabus ? renderMdPreviewInline(exam.syllabus) : '<span class="exp-empty">Not added</span>'}
              ${exam.website ? `<div class="exp-file-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><a href="${escHtml(exam.website)}" target="_blank" rel="noopener">${escHtml(exam.name.replace(/ /g,'_'))}_Syllabus.pdf</a></div>` : ''}
            </div>
          </div>

          <div class="exp-card">
            <div class="exp-card-head">
              <span class="exp-card-title">EXAM PATTERN</span>
              <button class="exp-edit-btn" onclick="openMdPanel('${exam.id}','pattern')">↗ Edit / View</button>
            </div>
            <div class="exp-card-body">${exam.pattern ? renderMdPreviewInline(exam.pattern) : '<span class="exp-empty">Not added</span>'}</div>
          </div>

        </div>

        <!-- Bottom bar: tags + actions -->
        <div class="exp-bar">
          <div class="exp-tags-row">
            <span class="exp-tags-label">Tags:</span>
            ${tags.map(t => `<span class="exp-tag" onclick="toggleTagFilter('${escHtml(t)}')">${escHtml(t)}</span>`).join('')}
            <button class="exp-tag-add" onclick="openEditExam('${exam.id}')">+ add</button>
          </div>
          <div class="exp-actions">
            ${exam.website ? `<a href="${escHtml(exam.website)}" target="_blank" rel="noopener" class="exp-action-btn website">🌐 ${escHtml(new URL(exam.website.startsWith('http') ? exam.website : 'https://'+exam.website).hostname)}</a>` : ''}
            <button class="exp-action-btn" onclick="openEditExam('${exam.id}')">✎ Edit</button>
            <button class="exp-action-btn pin" onclick="togglePin('${exam.id}')">${exam.pinned ? '📌 Unpin' : '📌 Pin'}</button>
            <button class="exp-action-btn danger" onclick="deleteExam('${exam.id}')">🗑 Delete</button>
          </div>
        </div>

      </div>
    </td>
  </tr>` : '';

  return `
  <tr class="exam-row${exam.pinned ? ' pinned-row' : ''}${isExpanded ? ' expanded' : ''}" id="row-${exam.id}">
    <td class="td-expand">
      <button class="expand-btn${isExpanded ? ' open' : ''}" onclick="toggleExpand('${exam.id}')">${isExpanded ? '▼' : '▶'}</button>
    </td>
    <td class="td-num">${num}</td>
    <td class="td-name">${escHtml(exam.name)}</td>
    <td class="td-agency">${escHtml(exam.agency || '—')}</td>
    <td class="td-tag">${tagsHTML}</td>
    <td class="td-deadline">${deadlineHTML}</td>
    <td class="td-status"><span class="status-pill ${statusCls}">${statusLabel}</span></td>
    <td class="td-eligible"><span class="eligible-pill ${eligibleCls}">${eligibleLbl}</span></td>
    <td class="td-applied">
      <div class="row-checkbox${exam.applied ? ' checked' : ''}" onclick="toggleApplied('${exam.id}')" title="Toggle applied"></div>
    </td>
    <td class="td-pin">
      <button class="pin-btn${exam.pinned ? ' pinned' : ''}" onclick="togglePin('${exam.id}')" title="${exam.pinned ? 'Unpin' : 'Pin'}">📌</button>
    </td>
  </tr>${detailRow}`;
}

window.toggleExpand = (id) => {
  if (expandedCards.has(id)) expandedCards.delete(id);
  else expandedCards.add(id);
  renderTable();
};

window.toggleTagFilter = (tag) => {
  if (activeTags.has(tag)) activeTags.delete(tag);
  else activeTags.add(tag);
  renderTagDropdown();
  applyFilters();
};

function renderTagDropdown() {
  const allTags = [...new Set(allExams.flatMap(e => e.tags || []))].sort();
  const list    = document.getElementById('tag-dd-list');
  const countEl = document.getElementById('tag-active-count');
  const btn     = document.querySelector('.tag-dd-btn');

  if (allTags.length === 0) {
    list.innerHTML = '<div class="tag-dd-empty">No tags yet</div>';
    countEl.style.display = 'none';
    btn.classList.remove('has-active');
    return;
  }

  list.innerHTML = allTags.map(tag => `
    <div class="tag-dd-item${activeTags.has(tag) ? ' active' : ''}" onclick="toggleTagFilter('${escHtml(tag)}')">
      <div class="tag-dd-checkbox"></div>
      <span>${escHtml(tag)}</span>
    </div>`).join('');

  if (activeTags.size > 0) {
    countEl.textContent   = activeTags.size;
    countEl.style.display = '';
    btn.classList.add('has-active');
  } else {
    countEl.style.display = 'none';
    btn.classList.remove('has-active');
  }
}

window.toggleTagDropdown = () => {
  const menu = document.getElementById('tag-dd-menu');
  const open = menu.style.display === 'none' || !menu.style.display;
  menu.style.display = open ? 'block' : 'none';
  if (open) {
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', closeTagDdOutside, { once: true });
    }, 10);
  }
};

function closeTagDdOutside(e) {
  const wrap = document.getElementById('tag-dd-wrap');
  if (!wrap.contains(e.target)) {
    document.getElementById('tag-dd-menu').style.display = 'none';
  } else {
    // Re-listen if click was inside
    setTimeout(() => document.addEventListener('click', closeTagDdOutside, { once: true }), 10);
  }
}


window.setStatusFilter = (status, btn) => {
  activeStatus = status;
  document.querySelectorAll('#status-filters .chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
};

// ── Countdown rings ───────────────────────────────
function renderCountdowns() {
  const pinned  = allExams.filter(e => e.pinned);
  const strip   = document.getElementById('countdown-rings');
  const CIRCUMF = 2 * Math.PI * 28;  // r=28

  if (pinned.length === 0) {
    strip.innerHTML = '<div class="countdown-empty">Pin up to 3 exams to track here</div>';
    return;
  }

  strip.innerHTML = pinned.map(exam => {
    const targetDate = exam.examDate || exam.lastDate;
    const days  = targetDate ? Math.max(0, daysUntil(targetDate)) : null;
    const total = 365;
    const pct   = days !== null ? Math.min(1, days / total) : 1;
    const offset = CIRCUMF * (1 - pct);
    const color  = days === null ? '#6b6560' : days <= 7 ? '#f87171' : days <= 30 ? '#fcd34d' : '#e07b2a';
    const label  = days === null ? '—' : days > 999 ? '999+' : String(days);

    return `
      <div class="ring-wrap" title="${escHtml(exam.name)}">
        <div class="ring">
          <svg viewBox="0 0 64 64">
            <circle class="ring-bg" cx="32" cy="32" r="28"/>
            <circle class="ring-fg" cx="32" cy="32" r="28"
              stroke="${color}"
              stroke-dasharray="${CIRCUMF}"
              stroke-dashoffset="${offset}"/>
          </svg>
          <div class="ring-inner">
            <div class="ring-days">${label}</div>
            <div class="ring-unit">days</div>
          </div>
        </div>
        <div class="ring-name">${escHtml(exam.name)}</div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════
//  SEARCH
// ════════════════════════════════════════════════════

window.handleSearch = (val) => {
  searchQuery = val.trim();
  applyFilters();
};

window.clearSearch = () => {
  searchQuery = '';
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  applyFilters();
};

// ════════════════════════════════════════════════════
//  PROFILE MODAL
// ════════════════════════════════════════════════════

window.showProfile = () => {
  updateUserUI();
  document.getElementById('profile-modal').style.display = 'flex';
};
window.closeProfile = () => {
  document.getElementById('profile-modal').style.display = 'none';
};

window.handleSignOut = async () => {
  await signOut(auth);
};

window.handleChangePassword = async () => {
  const newPass = document.getElementById('new-password').value;
  if (!newPass || newPass.length < 6) return toast('Enter a new password (min 6 chars).', 'error');
  try {
    await updatePassword(currentUser, newPass);
    document.getElementById('new-password').value = '';
    toast('Password updated!', 'success');
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') {
      toast('Please sign out and sign back in, then try again.', 'error');
    } else {
      toast('Failed to update password.', 'error');
    }
  }
};

window.handleForgotPasswordFromProfile = async () => {
  if (!currentUser?.email) return;
  try {
    await sendPasswordResetEmail(auth, currentUser.email);
    toast('Reset email sent!', 'success');
  } catch (e) {
    toast('Failed to send reset email.', 'error');
  }
};

// ── Delete Account ────────────────────────────────
window.confirmDeleteAccount = () => {
  openConfirm(
    'Delete Account',
    'This will permanently delete your account and ALL exam data. This action cannot be undone.',
    true,
    async () => {
      const password = document.getElementById('confirm-password-input').value;
      try {
        // Re-authenticate
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);

        // Delete all exams
        const snap = await getDocs(examsRef());
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        // Delete auth user
        await deleteUser(currentUser);
        toast('Account deleted.', 'success');
      } catch (e) {
        if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
          toast('Wrong password. Account not deleted.', 'error');
        } else if (e.code === 'auth/popup-closed-by-user') {
          // Google user — try just delete
          try {
            const snap = await getDocs(examsRef());
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            await deleteUser(currentUser);
          } catch (e2) {
            toast('Re-authentication required. Sign out and sign back in.', 'error');
          }
        } else {
          toast('Delete failed. Try signing out and signing back in first.', 'error');
        }
      }
    }
  );
};

// ════════════════════════════════════════════════════
//  IMPORT / EXPORT
// ════════════════════════════════════════════════════

window.exportJSON = () => {
  const data = allExams.map(e => {
    const { id, createdAt, ...rest } = e;
    return rest;
  });
  downloadFile(JSON.stringify(data, null, 2), 'exams.json', 'application/json');
  toast('Exported JSON!', 'success');
};

window.exportCSV = () => {
  if (allExams.length === 0) return toast('No exams to export.', 'error');
  const cols = ['name','agency','status','lastDate','examDate','website','eligibility','syllabus','pattern','applied','pinned','tags'];
  const rows = allExams.map(e =>
    cols.map(c => {
      const val = c === 'tags' ? (e.tags || []).join(';') : (e[c] ?? '');
      return `"${String(val).replace(/"/g,'""')}"`;
    }).join(',')
  );
  downloadFile([cols.join(','), ...rows].join('\n'), 'exams.csv', 'text/csv');
  toast('Exported CSV!', 'success');
};

window.importJSON = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return toast('Invalid JSON format.', 'error');

    let count = 0;
    for (const exam of data) {
      if (!exam.name) continue;
      const clean = {
        name:        String(exam.name || ''),
        agency:      String(exam.agency || ''),
        status:      ['open','upcoming','closed'].includes(exam.status) ? exam.status : 'open',
        lastDate:    exam.lastDate || '',
        examDate:    exam.examDate || '',
        website:     exam.website || '',
        eligibility: exam.eligibility || '',
        syllabus:    exam.syllabus || '',
        pattern:     exam.pattern || '',
        tags:        Array.isArray(exam.tags) ? exam.tags : [],
        applied:     !!exam.applied,
        pinned:      false,
        createdAt:   serverTimestamp(),
      };
      await addDoc(examsRef(), clean);
      count++;
    }
    toast(`Imported ${count} exam${count !== 1 ? 's' : ''}!`, 'success');
    await loadExams();
  } catch (e) {
    toast('Import failed. Check JSON format.', 'error');
  }
  event.target.value = '';
};

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════════
//  CONFIRM MODAL
// ════════════════════════════════════════════════════

let confirmCallback = null;

function openConfirm(title, message, needsPassword, callback) {
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').textContent = message;
  const pg = document.getElementById('confirm-password-group');
  pg.style.display = needsPassword ? 'block' : 'none';
  if (needsPassword) document.getElementById('confirm-password-input').value = '';
  confirmCallback = callback;
  document.getElementById('confirm-modal').style.display = 'flex';
}

window.closeConfirmModal = () => {
  document.getElementById('confirm-modal').style.display = 'none';
  confirmCallback = null;
};

document.getElementById('confirm-action-btn').addEventListener('click', async () => {
  if (confirmCallback) await confirmCallback();
  closeConfirmModal();
});

// ════════════════════════════════════════════════════
//  THEME TOGGLE
// ════════════════════════════════════════════════════

window.toggleTheme = () => {
  const html  = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('theme-icon-moon').style.display = isDark ? 'none'  : '';
  document.getElementById('theme-icon-sun').style.display  = isDark ? ''      : 'none';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
};

// Load saved theme
(function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  if (saved === 'light') {
    document.getElementById('theme-icon-moon').style.display = 'none';
    document.getElementById('theme-icon-sun').style.display  = '';
  }
})();

// ════════════════════════════════════════════════════
//  MODAL OVERLAY CLICK TO CLOSE
// ════════════════════════════════════════════════════

window.closeModalOnOverlay = (event, modalId) => {
  if (event.target.id === modalId) {
    document.getElementById(modalId).style.display = 'none';
    if (modalId === 'confirm-modal') confirmCallback = null;
  }
};

// ════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════

let toastTimer = null;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast' + (type ? ` ${type}` : '');
  el.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2800);
}

// ════════════════════════════════════════════════════
//  MARKDOWN EDITOR PANEL
// ════════════════════════════════════════════════════

let mdPanelExamId  = null;
let mdPanelField   = null;
let mdPanelContext = null; // 'row' | 'modal'

const fieldLabels = {
  eligibility: 'Eligibility',
  syllabus:    'Syllabus',
  pattern:     'Exam Pattern',
};

// Called from expanded row cards
window.openMdPanel = (examId, field) => {
  const exam = allExams.find(e => e.id === examId);
  if (!exam) return;
  mdPanelExamId  = examId;
  mdPanelField   = field;
  mdPanelContext = 'row';

  const examName = document.getElementById('f-name')?.value.trim() || exam.name;
  document.getElementById('md-panel-title').textContent = `${fieldLabels[field]} — ${examName}`;
  const ta = document.getElementById('md-editor-textarea');
  ta.value = exam[field] || '';
  mdPreview();
  document.getElementById('md-save-status').textContent = '';
  document.getElementById('md-panel').style.display   = 'flex';
  document.getElementById('md-overlay').style.display = 'block';
  ta.focus();
};

// Called from Add/Edit exam modal fields
window.openMdFromModal = (field) => {
  mdPanelField   = field;
  mdPanelContext = 'modal';
  mdPanelExamId  = null;

  const examName = document.getElementById('f-name')?.value.trim() || 'New Exam';
  document.getElementById('md-panel-title').textContent = `${fieldLabels[field]} — ${examName || 'New Exam'}`;
  const ta = document.getElementById('md-editor-textarea');
  ta.value = modalDraft[field] || '';
  mdPreview();
  document.getElementById('md-save-status').textContent = '';
  document.getElementById('md-panel').style.display   = 'flex';
  document.getElementById('md-overlay').style.display = 'block';
  ta.focus();
};

window.closeMdPanel = () => {
  document.getElementById('md-panel').style.display   = 'none';
  document.getElementById('md-overlay').style.display = 'none';
  mdPanelExamId  = null;
  mdPanelField   = null;
  mdPanelContext = null;
};

window.saveMdPanel = async () => {
  if (!mdPanelField) return;
  const value    = document.getElementById('md-editor-textarea').value;
  const statusEl = document.getElementById('md-save-status');

  if (mdPanelContext === 'modal') {
    // Just store in draft — no Firestore yet
    modalDraft[mdPanelField] = value;
    setModalDraftPreview(mdPanelField);
    statusEl.textContent = '✓ Saved to draft';
    setTimeout(closeMdPanel, 400);
    return;
  }

  // context === 'row' — save directly to Firestore
  statusEl.textContent = 'Saving…';
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'exams', mdPanelExamId), {
      [mdPanelField]: value
    });
    const exam = allExams.find(e => e.id === mdPanelExamId);
    if (exam) exam[mdPanelField] = value;
    statusEl.textContent = '✓ Saved';
    setTimeout(() => { closeMdPanel(); renderTable(); }, 500);
  } catch (e) {
    statusEl.textContent = '✗ Save failed';
    toast('Save failed.', 'error');
  }
};

window.mdPreview = () => {
  const raw = document.getElementById('md-editor-textarea').value;
  document.getElementById('md-preview').innerHTML = parseMd(raw);
};

// Toolbar helpers
window.mdInsert = (before, after) => {
  const ta = document.getElementById('md-editor-textarea');
  const s = ta.selectionStart, e = ta.selectionEnd;
  const selected = ta.value.substring(s, e);
  const replacement = before + (selected || 'text') + after;
  ta.value = ta.value.substring(0, s) + replacement + ta.value.substring(e);
  ta.selectionStart = s + before.length;
  ta.selectionEnd   = s + before.length + (selected || 'text').length;
  ta.focus();
  mdPreview();
};

window.mdInsertTable = () => {
  const tbl = '\n| Column 1 | Column 2 | Column 3 |\n|---|---|---|\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |\n';
  const ta  = document.getElementById('md-editor-textarea');
  const pos = ta.selectionStart;
  ta.value  = ta.value.substring(0, pos) + tbl + ta.value.substring(pos);
  ta.focus();
  mdPreview();
};

// ── Minimal Markdown parser ───────────────────────
function parseMd(md) {
  if (!md) return '';
  let html = escHtml(md);

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // HR
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g,         '<em>$1</em>');

  // Inline code
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  // Tables — detect pipe rows
  html = html.replace(/((^\|.+\|\n?)+)/gm, (match) => {
    const rows = match.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return match;
    let out = '<table>';
    rows.forEach((row, i) => {
      if (/^\|[-| ]+\|$/.test(row.replace(/&lt;|&gt;/g,'-'))) return; // separator row
      const cells = row.split('|').filter((_, ci) => ci > 0 && ci < row.split('|').length - 1);
      if (i === 0) {
        out += '<tr>' + cells.map(c => `<th>${c.trim()}</th>`).join('') + '</tr>';
      } else if (!/^[-| ]+$/.test(row.replace(/\|/g,''))) {
        out += '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
      }
    });
    out += '</table>';
    return out;
  });

  // Unordered list
  html = html.replace(/(^- .+$\n?)+/gm, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered list
  html = html.replace(/(^\d+\. .+$\n?)+/gm, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Paragraphs — wrap bare lines not already wrapped in tags
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');

  return html;
}

// Inline preview for exp-card-body (renders but truncated)
function renderMdPreviewInline(md) {
  if (!md) return '';
  // Plain text fallback for card preview — strip markdown symbols
  const plain = md
    .replace(/#{1,6} /g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[-*] /gm, '• ')
    .replace(/^\d+\. /gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^---$/gm, '');
  return `<span style="white-space:pre-wrap;font-size:12px">${escHtml(plain)}</span>`;
}

// ════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now    = new Date();
  now.setHours(0,0,0,0);
  return Math.round((target - now) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
