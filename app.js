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
let activeTag    = null;
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
    eligibility: document.getElementById('f-eligibility').value.trim(),
    syllabus:    document.getElementById('f-syllabus').value.trim(),
    pattern:     document.getElementById('f-pattern').value.trim(),
    tags:        document.getElementById('f-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    applied:     document.getElementById('f-applied').checked,
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
  // Optimistic UI
  exam.applied = newVal;
  renderCards();
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'exams', id), { applied: newVal });
  } catch (e) {
    exam.applied = !newVal;
    renderCards();
    toast('Update failed.', 'error');
  }
};

// ════════════════════════════════════════════════════
//  EXAM MODAL — OPEN / CLOSE / POPULATE
// ════════════════════════════════════════════════════

window.openAddExam = () => {
  document.getElementById('exam-modal-title').textContent = 'Add Exam';
  document.getElementById('exam-id').value = '';
  ['f-name','f-agency','f-last-date','f-exam-date','f-website','f-eligibility','f-syllabus','f-pattern','f-tags'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-status').value = 'open';
  document.getElementById('f-applied').checked = false;
  document.getElementById('f-pinned').checked = false;
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
  document.getElementById('f-eligibility').value = exam.eligibility || '';
  document.getElementById('f-syllabus').value   = exam.syllabus || '';
  document.getElementById('f-pattern').value    = exam.pattern || '';
  document.getElementById('f-tags').value       = (exam.tags || []).join(', ');
  document.getElementById('f-applied').checked  = !!exam.applied;
  document.getElementById('f-pinned').checked   = !!exam.pinned;
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
  renderTagFilters();
  applyFilters();
  renderCountdowns();
}

function applyFilters() {
  let exams = [...allExams];

  if (activeStatus !== 'all') {
    exams = exams.filter(e => e.status === activeStatus);
  }
  if (activeTag) {
    exams = exams.filter(e => (e.tags || []).includes(activeTag));
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
  renderCards();
}

function renderCards() {
  const container = document.getElementById('exam-cards');
  const empty     = document.getElementById('list-empty');

  if (filteredExams.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = filteredExams.map(exam => cardHTML(exam)).join('');
}

function cardHTML(exam) {
  const statusBadge = `<span class="badge ${exam.status || 'open'}">${capitalize(exam.status || 'open')}</span>`;

  const dateStr = exam.lastDate || exam.examDate;
  let dateDisplay = '';
  if (dateStr) {
    const days = daysUntil(dateStr);
    if (days !== null) {
      if (days < 0)        dateDisplay = `<span class="card-date-warn">Closed</span>`;
      else if (days <= 7)  dateDisplay = `<span class="card-date-warn">⏰ ${days}d left</span>`;
      else if (days <= 30) dateDisplay = `<span class="card-date-ok">📅 ${days}d left</span>`;
      else                 dateDisplay = `<span style="font-size:10px;color:var(--muted)">📅 ${formatDate(dateStr)}</span>`;
    }
  }

  const tagBadges = (exam.tags || []).map(t => `<span class="badge tag">${t}</span>`).join('');
  const pinDot    = exam.pinned ? `<span class="pin-dot" title="Pinned"></span>` : '';

  const isExpanded = expandedCards.has(exam.id);

  const expandedDetail = isExpanded ? `
    <div class="card-detail open">
      ${exam.eligibility ? `<div class="detail-section"><div class="detail-label">Eligibility</div><div class="detail-text">${escHtml(exam.eligibility)}</div></div>` : ''}
      ${exam.syllabus    ? `<div class="detail-section"><div class="detail-label">Syllabus</div><div class="detail-text">${escHtml(exam.syllabus)}</div></div>` : ''}
      ${exam.pattern     ? `<div class="detail-section"><div class="detail-label">Exam Pattern</div><div class="detail-text">${escHtml(exam.pattern)}</div></div>` : ''}
      ${exam.website     ? `<div class="detail-section"><div class="detail-label">Website</div><a href="${escHtml(exam.website)}" target="_blank" rel="noopener" class="detail-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>${escHtml(exam.website)}</a></div>` : ''}
    </div>` : '';

  const hasDetails = exam.eligibility || exam.syllabus || exam.pattern || exam.website;

  return `
    <div class="exam-card${exam.pinned ? ' pinned' : ''}" id="card-${exam.id}">
      <div class="card-top">
        <div class="card-badge">${escHtml((exam.agency || '?').substring(0,6).toUpperCase())}</div>
        <div class="card-info">
          <div class="card-name">${escHtml(exam.name)}${pinDot}</div>
          <div class="card-agency">${escHtml(exam.agency)}</div>
          <div class="card-chips">
            ${statusBadge}
            ${dateDisplay}
            ${tagBadges}
          </div>
        </div>
        <div class="card-applied">
          <div class="checkbox${exam.applied ? ' checked' : ''}" onclick="toggleApplied('${exam.id}')" title="Toggle applied"></div>
          <div class="card-applied-label">applied</div>
        </div>
      </div>
      ${expandedDetail}
      <div class="card-actions">
        ${hasDetails ? `<button class="card-btn${isExpanded ? ' accent' : ''}" onclick="toggleExpand('${exam.id}')">${isExpanded ? 'Collapse ▴' : 'Details ▾'}</button>` : ''}
        <button class="card-btn" onclick="openEditExam('${exam.id}')">✏ Edit</button>
        <button class="card-btn danger" onclick="deleteExam('${exam.id}')">🗑</button>
      </div>
    </div>`;
}

window.toggleExpand = (id) => {
  if (expandedCards.has(id)) expandedCards.delete(id);
  else expandedCards.add(id);
  renderCards();
};

// ── Tag filter chips ──────────────────────────────
function renderTagFilters() {
  const allTags = [...new Set(allExams.flatMap(e => e.tags || []))].sort();
  const container = document.getElementById('tag-filters');

  if (allTags.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = allTags.map(tag =>
    `<button class="chip${activeTag === tag ? ' active' : ''}" onclick="setTagFilter('${escHtml(tag)}', this)">${escHtml(tag)}</button>`
  ).join('');
}

window.setStatusFilter = (status, btn) => {
  activeStatus = status;
  document.querySelectorAll('#status-filters .chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
};

window.setTagFilter = (tag, btn) => {
  if (activeTag === tag) {
    activeTag = null;
    document.querySelectorAll('#tag-filters .chip').forEach(b => b.classList.remove('active'));
  } else {
    activeTag = tag;
    document.querySelectorAll('#tag-filters .chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
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

window.toggleSearch = () => {
  const bar = document.getElementById('search-bar');
  const isHidden = bar.style.display === 'none' || !bar.style.display;
  bar.style.display = isHidden ? 'block' : 'none';
  if (isHidden) setTimeout(() => document.getElementById('search-input').focus(), 50);
  else { searchQuery = ''; document.getElementById('search-input').value = ''; applyFilters(); }
};

window.handleSearch = (val) => {
  searchQuery = val.trim();
  applyFilters();
};

window.clearSearch = () => {
  searchQuery = '';
  document.getElementById('search-input').value = '';
  applyFilters();
  document.getElementById('search-input').focus();
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
