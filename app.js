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
  onSnapshot,
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
let activeSort   = 'createdAt_desc';
let expandedCards = new Set();
let examsUnsubscribe = null; // holds the onSnapshot detach function
let selectionMode = false;
let selectedIds   = new Set();
let dataLoaded    = false;  // true after first onSnapshot fires

// ── Auth State Listener ──────────────────────────────
onAuthStateChanged(auth, user => {
  // Detach any existing Firestore listener before switching users
  if (examsUnsubscribe) { examsUnsubscribe(); examsUnsubscribe = null; }
  if (user) {
    currentUser = user;
    showApp();
    subscribeExams();
    updateUserUI();
  } else {
    currentUser    = null;
    allExams       = [];
    filteredExams  = [];
    activeStatus   = 'all';
    activeTags     = new Set();
    searchQuery    = '';
    activeSort     = 'createdAt_desc';
    expandedCards  = new Set();
    selectionMode  = false;
    selectedIds    = new Set();
    confirmCallback    = null;
    inputModalCallback = null;
    fvExamId = null;
    fvField  = null;
    mdCurrentField = null;
    dataLoaded = false;
    showAuthScreen();
  }
});

function showApp() {
  const authEl = document.getElementById('auth-screen');
  const appEl  = document.getElementById('app');

  // Pre-apply no-pinned so filter-bar top is correct before first paint
  const hasPinned = allExams.some(e => e.pinned);
  if (!hasPinned) appEl.classList.add('no-pinned');
  else            appEl.classList.remove('no-pinned');

  // Fade auth screen out, then hide it and reveal app
  authEl.classList.add('is-fading-out');
  const onAuthGone = () => {
    authEl.classList.remove('is-fading-out');
    authEl.style.display = 'none';
    appEl.style.display  = 'block';
    appEl.classList.add('is-fading-in');
    appEl.addEventListener('animationend', () => {
      appEl.classList.remove('is-fading-in');
    }, { once: true });
    // Show skeleton only if data hasn't arrived yet.
    // If onSnapshot already fired during the 270ms auth-fade delay,
    // dataLoaded is already true — don't re-show the skeleton.
    if (!dataLoaded) {
      const sk = document.getElementById('skeleton-loader');
      if (sk) sk.style.display = '';
    }
  };
  const timer = setTimeout(onAuthGone, 270);
  authEl.addEventListener('animationend', () => { clearTimeout(timer); onAuthGone(); }, { once: true });
}

function showAuthScreen() {
  const appEl  = document.getElementById('app');
  const authEl = document.getElementById('auth-screen');

  // Clean up any lingering animation classes and skeleton from the app
  appEl.classList.remove('is-fading-in');
  const sk = document.getElementById('skeleton-loader');
  if (sk) sk.style.display = 'none';

  appEl.style.display   = 'none';
  authEl.style.display  = 'flex';
  authEl.classList.remove('is-fading-out');
  // Reset login button state
  const loginBtn = document.getElementById('login-btn-text');
  if (loginBtn) loginBtn.textContent = 'Sign In';
  const regBtn = document.getElementById('register-btn-text');
  if (regBtn) regBtn.textContent = 'Create Account';
  // Clear input fields
  ['login-email','login-password','reg-name','reg-email','reg-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Clear any auth messages
  clearAuthMessages();
}

function updateUserUI() {
  if (!currentUser) return;
  document.getElementById('profile-name-display').textContent = currentUser.displayName || '(no name)';
  document.getElementById('profile-email-display').textContent = currentUser.email || '';
  // Stat cards — always update so they stay live if profile modal is already open
  document.getElementById('stat-exams').textContent   = allExams.length;
  document.getElementById('stat-applied').textContent = allExams.filter(e => e.applied).length;
  document.getElementById('stat-pinned').textContent  = allExams.filter(e => e.pinned).length;
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
  btn.closest('button').disabled = true;
  clearAuthMessages();
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    btn.textContent = 'Sign In';
    btn.closest('button').disabled = false;
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
  btn.closest('button').disabled = true;
  clearAuthMessages();
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) {
    btn.textContent = 'Create Account';
    btn.closest('button').disabled = false;
    showAuthError(friendlyAuthError(e.code));
  }
};

window.handleGoogleLogin = async () => {
  clearAuthMessages();
  const btn = document.querySelector('.btn-google');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
  try {
    await signInWithPopup(auth, gProvider);
  } catch (e) {
    showAuthError(friendlyAuthError(e.code));
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
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

function subscribeExams() {
  const q = query(examsRef(), orderBy('createdAt', 'desc'));
  examsUnsubscribe = onSnapshot(q,
    (snap) => {
      allExams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Hide skeleton on first data arrival
      if (!dataLoaded) {
        dataLoaded = true;
        const sk = document.getElementById('skeleton-loader');
        if (sk) sk.style.display = 'none';
      }
      updateUserUI();
      renderAll();
    },
    (e) => {
      console.error('subscribeExams error:', e);
      // Hide skeleton even on error so UI isn't stuck
      dataLoaded = true;
      const sk = document.getElementById('skeleton-loader');
      if (sk) sk.style.display = 'none';
      toast('Failed to sync exams.', 'error');
    }
  );
}

window.saveExam = async () => {
  const name    = document.getElementById('f-name').value.trim();
  const agency  = document.getElementById('f-agency').value.trim();
  if (!name) return toast('Exam name is required.', 'error');

  const id = document.getElementById('exam-id').value;
  const pinned  = document.getElementById('f-pinned').checked;

  // Enforce max 5 pinned
  const pinnedCount = allExams.filter(e => e.pinned && e.id !== id).length;
  if (pinned && pinnedCount >= 5) {
    toast('Max 5 exams can be pinned. Unpin one first.', 'error');
    document.getElementById('f-pinned').checked = false;
    return;
  }

  const data = {
    name,
    agency,
    subtitle:    document.getElementById('f-subtitle').value.trim(),
    examType:    document.getElementById('f-exam-type').value,
    lastDate:    document.getElementById('f-last-date').value,
    examDate:    document.getElementById('f-exam-date').value,
    website:     document.getElementById('f-website').value.trim(),
    vacancies:   document.getElementById('f-vacancies').value.trim(),
    pay:         document.getElementById('f-pay').value.trim(),
    eligibility: modalDraft.eligibility,
    syllabus:    modalDraft.syllabus,
    pattern:     modalDraft.pattern,
    tags:        document.getElementById('f-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    applied:     document.getElementById('f-applied').checked,
    year:        document.getElementById('f-year').value.trim(),
    pinned,
    resources:   modalResources.slice(),
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
        closeConfirmModal();
      } catch (e) {
        toast('Delete failed.', 'error');
      }
    },
    'Delete Exam'
  );
};

window.toggleApplied = async (id) => {
  const exam = allExams.find(e => e.id === id);
  if (!exam) return;
  const newVal = !exam.applied;
  // Optimistic update
  exam.applied = newVal;
  // desktop
  const cb = document.querySelector(`#row-${id} .row-checkbox`);
  if (cb) cb.classList.toggle('checked', newVal);
  // mobile
  const mcb = document.querySelector(`#mcard-${id} .m-card-applied`);
  if (mcb) mcb.classList.toggle('checked', newVal);
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'exams', id), { applied: newVal });
  } catch (e) {
    // Revert on failure
    exam.applied = !newVal;
    if (cb)  cb.classList.toggle('checked', !newVal);
    if (mcb) mcb.classList.toggle('checked', !newVal);
    toast('Update failed.', 'error');
  }
};

window.togglePin = async (id) => {
  const exam = allExams.find(e => e.id === id);
  if (!exam) return;
  const newVal = !exam.pinned;
  if (newVal) {
    const pinnedCount = allExams.filter(e => e.pinned && e.id !== id).length;
    if (pinnedCount >= 5) return toast('Max 5 pinned exams. Unpin one first.', 'error');
  }
  // Optimistic update
  exam.pinned = newVal;
  const pinBtn = document.querySelector(`#row-${id} .pin-btn`);
  if (pinBtn) pinBtn.classList.toggle('pinned', newVal);
  const mPinBtn = document.querySelector(`#mcard-${id} .m-card-pin`);
  if (mPinBtn) mPinBtn.classList.toggle('pinned', newVal);
  renderCountdowns();
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'exams', id), { pinned: newVal });
  } catch (e) {
    // Revert on failure
    exam.pinned = !newVal;
    if (pinBtn) pinBtn.classList.toggle('pinned', !newVal);
    if (mPinBtn) mPinBtn.classList.toggle('pinned', !newVal);
    renderCountdowns();
    toast('Update failed.', 'error');
  }
};

// ════════════════════════════════════════════════════
//  EXAM MODAL — OPEN / CLOSE / POPULATE
// ════════════════════════════════════════════════════

// modalDraft holds temp values for eligibility/syllabus/pattern while modal is open
let modalDraft = { eligibility: '', syllabus: '', pattern: '' };
let modalResources = []; // temp resources list while modal is open

function renderModalResList() {
  const list = document.getElementById('modal-res-list');
  if (!list) return;
  if (modalResources.length === 0) { list.innerHTML = ''; return; }
  list.innerHTML = modalResources.map((r, i) => `
    <div class="res-item">
      <span class="res-type-badge res-${r.type.toLowerCase()}">${r.type === 'PDF' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'}</span>
      <span class="res-title">${escHtml(r.label)}</span>
      <button class="res-remove" onclick="modalRemoveResource(${i})">✕</button>
    </div>`).join('');
}

window.modalAddResource = () => {
  const type  = document.getElementById('res-type-sel').value;
  const label = document.getElementById('res-label-input').value.trim();
  const url   = document.getElementById('res-url-input').value.trim();
  if (!label || !url) return toast('Enter both a label and a URL.', 'error');
  modalResources.push({ type, label, url });
  document.getElementById('res-label-input').value = '';
  document.getElementById('res-url-input').value = '';
  renderModalResList();
};

window.onResTypeChange = () => {
  const type = document.getElementById('res-type-sel').value;
  const urlInput = document.getElementById('res-url-input');
  urlInput.placeholder = type === 'PDF' ? 'PDF URL…' : 'https://…';
};

window.modalRemoveResource = (idx) => {
  modalResources.splice(idx, 1);
  renderModalResList();
};

function setModalDraftPreview(field) {
  const span = document.getElementById('prev-' + field);
  if (!span) return;
  const btn = span.closest('button');
  const val = modalDraft[field];
  if (val && val.trim()) {
    span.textContent = 'Edit';
    if (btn) btn.classList.add('has-content');
  } else {
    span.textContent = 'Add';
    if (btn) btn.classList.remove('has-content');
  }
}

window.openAddExam = () => {
  document.getElementById('exam-modal-title').textContent = 'Add Exam';
  document.getElementById('exam-id').value = '';
  ['f-name','f-agency','f-subtitle','f-last-date','f-exam-date','f-website','f-tags','f-year','f-vacancies','f-pay'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-exam-type').value = 'job';
  document.getElementById('job-fields-row').style.display = '';
  document.getElementById('f-applied').checked = false;
  document.getElementById('f-pinned').checked  = false;
  // Reset draft
  modalDraft = { eligibility: '', syllabus: '', pattern: '' };
  modalResources = [];
  renderModalResList();
  ['eligibility','syllabus','pattern'].forEach(setModalDraftPreview);
  document.getElementById('exam-modal').style.display = 'flex';
  lockScroll();
};

window.openEditExam = (id) => {
  const exam = allExams.find(e => e.id === id);
  if (!exam) return;
  document.getElementById('exam-modal-title').textContent = 'Edit Exam';
  document.getElementById('exam-id').value      = id;
  document.getElementById('f-name').value       = exam.name || '';
  document.getElementById('f-agency').value     = exam.agency || '';
  document.getElementById('f-subtitle').value   = exam.subtitle || '';
  document.getElementById('f-exam-type').value  = exam.examType || 'job';
  document.getElementById('f-last-date').value  = exam.lastDate || '';
  document.getElementById('f-exam-date').value  = exam.examDate || '';
  document.getElementById('f-website').value    = exam.website || '';
  document.getElementById('f-vacancies').value  = exam.vacancies || '';
  document.getElementById('f-pay').value        = exam.pay || '';
  document.getElementById('f-tags').value       = (exam.tags || []).join(', ');
  document.getElementById('f-applied').checked  = !!exam.applied;
  document.getElementById('f-year').value       = exam.year || '';
  document.getElementById('f-pinned').checked   = !!exam.pinned;
  document.getElementById('job-fields-row').style.display = (exam.examType === 'entrance') ? 'none' : '';
  // Load draft from exam data
  modalDraft = {
    eligibility: exam.eligibility || '',
    syllabus:    exam.syllabus    || '',
    pattern:     exam.pattern     || '',
  };
  modalResources = (exam.resources || []).map(r => ({ ...r }));
  renderModalResList();
  ['eligibility','syllabus','pattern'].forEach(setModalDraftPreview);
  document.getElementById('exam-modal').style.display = 'flex';
  lockScroll();
};

window.closeExamModal = () => {
  const overlay = document.getElementById('exam-modal');
  animateOut(overlay, () => {
    unlockScroll();
    const btn = document.getElementById('save-exam-btn');
    if (btn) { btn.textContent = 'Save Exam'; btn.disabled = false; }
  });
};

window.toggleJobFields = () => {
  const type = document.getElementById('f-exam-type').value;
  document.getElementById('job-fields-row').style.display = type === 'entrance' ? 'none' : '';
};

window.toggleResPopover = (id) => {
  const pop  = document.getElementById('res-pop-' + id);
  const wrap = document.getElementById('res-wrap-' + id);
  if (!pop || !wrap) return;
  const isOpen = pop.style.display !== 'none';
  document.querySelectorAll('.res-popover').forEach(el => el.style.display = 'none');
  if (!isOpen) {
    const btn  = wrap.querySelector('.exp-field-btn');
    const rect = (btn || wrap).getBoundingClientRect();
    pop.style.display = 'block'; // show first so offsetHeight is available
    const popH = pop.offsetHeight;
    const popW = pop.offsetWidth;
    const vH   = window.innerHeight;
    const vW   = window.innerWidth;
    // Flip above if not enough room below
    const topBelow = rect.bottom + 6;
    const topAbove = rect.top - popH - 6;
    pop.style.top  = (topBelow + popH > vH && topAbove >= 0) ? topAbove + 'px' : topBelow + 'px';
    // Clamp left so popover doesn't overflow right edge
    const rawLeft = rect.left;
    pop.style.left = Math.min(rawLeft, vW - popW - 8) + 'px';
    const handler = (e) => {
      if (!wrap.contains(e.target)) {
        pop.style.display = 'none';
        document.removeEventListener('click', handler, true);
      }
    };
    setTimeout(() => document.addEventListener('click', handler, true), 0);
  }
};

window.checkPinLimit = (checkbox) => {
  const id = document.getElementById('exam-id').value;
  const pinnedCount = allExams.filter(e => e.pinned && e.id !== id).length;
  if (checkbox.checked && pinnedCount >= 5) {
    toast('Max 5 pinned exams. Unpin one first.', 'error');
    checkbox.checked = false;
  }
};

// ════════════════════════════════════════════════════
//  SELECTION & BATCH DELETE
// ════════════════════════════════════════════════════

window.toggleSelectionMode = () => {
  selectionMode = !selectionMode;
  selectedIds.clear();
  const btn = document.getElementById('btn-select-mode');
  if (btn) btn.classList.toggle('active', selectionMode);
  updateBatchDeleteBtn();
  renderTable();
};

window.toggleSelectRow = (id) => {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  const checked = selectedIds.has(id);
  // update row highlight
  const row = document.getElementById('row-' + id);
  if (row) {
    row.classList.toggle('selected-row', checked);
    // update the checkbox div inside the first td directly
    const cb = row.querySelector('.row-select-cb');
    if (cb) cb.classList.toggle('checked', checked);
  }
  // sync header checkbox
  const allVisible = filteredExams.map(e => e.id);
  const allChecked = allVisible.length > 0 && allVisible.every(i => selectedIds.has(i));
  const hdrCb = document.getElementById('select-all-cb');
  if (hdrCb) hdrCb.classList.toggle('checked', allChecked);
  updateBatchDeleteBtn();
};

window.toggleSelectAll = () => {
  const allVisible = filteredExams.map(e => e.id);
  const allChecked = allVisible.every(id => selectedIds.has(id));
  if (allChecked) {
    allVisible.forEach(id => selectedIds.delete(id));
  } else {
    allVisible.forEach(id => selectedIds.add(id));
  }
  // update all rows directly without full re-render
  allVisible.forEach(id => {
    const row = document.getElementById('row-' + id);
    if (!row) return;
    const checked = selectedIds.has(id);
    row.classList.toggle('selected-row', checked);
    const cb = row.querySelector('.row-select-cb');
    if (cb) cb.classList.toggle('checked', checked);
  });
  const hdrCb = document.getElementById('select-all-cb');
  if (hdrCb) hdrCb.classList.toggle('checked', allVisible.length > 0 && allVisible.every(id => selectedIds.has(id)));
  updateBatchDeleteBtn();
};

function updateBatchDeleteBtn() {
  const btn = document.getElementById('btn-delete-selected');
  if (!btn) return;
  if (selectionMode && selectedIds.size > 0) {
    btn.style.display = '';
    btn.textContent   = `Delete (${selectedIds.size})`;
  } else {
    btn.style.display = 'none';
  }
}

window.deleteSelected = () => {
  if (selectedIds.size === 0) return;
  openConfirm(
    'Delete Selected',
    `Are you sure you want to delete ${selectedIds.size} exam${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`,
    false,
    async () => {
      try {
        const batch = writeBatch(db);
        selectedIds.forEach(id => {
          batch.delete(doc(db, 'users', currentUser.uid, 'exams', id));
        });
        await batch.commit();
        selectedIds.clear();
        selectionMode = false;
        const btn = document.getElementById('btn-select-mode');
        if (btn) btn.classList.remove('active');
        updateBatchDeleteBtn();
        toast('Deleted successfully.', 'success');
        closeConfirmModal();
      } catch (e) {
        toast('Delete failed.', 'error');
      }
    },
    `Delete ${selectedIds.size} Exam${selectedIds.size > 1 ? 's' : ''}`
  );
};



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
    exams = exams.filter(e => {
      if (!e.lastDate) return false;
      const d = daysUntil(e.lastDate);
      const derived = d < 0 ? 'closed' : 'open';
      return derived === activeStatus;
    });
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

  // ── Sort ──────────────────────────────────────────
  const [sortKey, sortDir] = activeSort.split('_');
  const asc = sortDir === 'asc';
  const statusOrder = { open: 0, closed: 1 };

  filteredExams.sort((a, b) => {
    if (sortKey === 'deadline') {
      const ad = a.lastDate || a.examDate || '';
      const bd = b.lastDate || b.examDate || '';
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return asc ? ad.localeCompare(bd) : bd.localeCompare(ad);
    } else if (sortKey === 'name') {
      const av = (a.name || '').toLowerCase();
      const bv = (b.name || '').toLowerCase();
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    } else if (sortKey === 'status') {
      const av = statusOrder[a.status] ?? 99;
      const bv = statusOrder[b.status] ?? 99;
      return asc ? av - bv : bv - av;
    } else {
      // createdAt
      const at = a.createdAt?.seconds ?? 0;
      const bt = b.createdAt?.seconds ?? 0;
      return asc ? at - bt : bt - at;
    }
  });

  renderTable();
}

window.setSortOrder = (val) => {
  activeSort = val;
  // Update active state in sort dropdown
  document.querySelectorAll('#sort-dd-list .tag-dd-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sort === val);
  });
  // Update label
  const sortLabels = {
    'createdAt_desc': 'Added ↓', 'createdAt_asc': 'Added ↑',
    'deadline_asc': 'Deadline ↑', 'deadline_desc': 'Deadline ↓',
    'name_asc': 'A-Z', 'name_desc': 'Z-A'
  };
  const labelEl = document.getElementById('sort-dd-label');
  if (labelEl) labelEl.textContent = val === 'createdAt_desc' ? 'Sort' : (sortLabels[val] || 'Sort');
  // Highlight when not default
  const btn = document.getElementById('sort-dd-btn');
  if (btn) btn.classList.toggle('has-active', val !== 'createdAt_desc');
  // Close dropdown
  document.getElementById('sort-dd-menu').style.display = 'none';
  applyFilters();
};

function renderTable() {
  // ── Mobile: render cards instead of table ──
  if (isMobile()) {
    const tableScroll   = document.getElementById('table-scroll');
    const mobileList    = document.getElementById('mobile-card-list');
    if (tableScroll) tableScroll.style.display = 'none';
    if (mobileList)  mobileList.style.display  = '';
    // Safety: hide skeleton
    if (dataLoaded) {
      const sk = document.getElementById('skeleton-loader');
      if (sk) sk.style.display = 'none';
    }
    renderMobileCards();
    return;
  }

  // ── Desktop: original table logic ──
  const mobileList = document.getElementById('mobile-card-list');
  if (mobileList) mobileList.style.display = 'none';

  const tbody  = document.getElementById('exam-tbody');
  const empty  = document.getElementById('list-empty');
  const scroll = document.getElementById('table-scroll');
  const table  = scroll ? scroll.querySelector('.exam-table') : null;
  // Safety: ensure skeleton is gone once we're rendering real content
  if (dataLoaded) {
    const sk = document.getElementById('skeleton-loader');
    if (sk && sk.style.display !== 'none') sk.style.display = 'none';
  }

  const emptyFiltered = document.getElementById('list-empty-filtered');
  if (filteredExams.length === 0) {
    scroll.style.display = 'none';
    if (allExams.length === 0) {
      empty.style.display = 'block';
      if (emptyFiltered) emptyFiltered.style.display = 'none';
    } else {
      empty.style.display = 'none';
      if (emptyFiltered) emptyFiltered.style.display = 'block';
    }
    return;
  }
  empty.style.display = 'none';
  if (emptyFiltered) emptyFiltered.style.display = 'none';
  scroll.style.display = '';

  if (table) table.classList.toggle('selection-mode', selectionMode);

  // Header checkbox
  const hdrCb = document.getElementById('select-all-cb');
  if (hdrCb) {
    const allChecked = filteredExams.length > 0 && filteredExams.every(e => selectedIds.has(e.id));
    hdrCb.classList.toggle('checked', allChecked);
    hdrCb.style.display = selectionMode ? '' : 'none';
  }

  tbody.innerHTML = filteredExams.map((exam, i) => tableRowHTML(exam, i + 1)).join('');
}

function tableRowHTML(exam, num) {
  const isExpanded = expandedCards.has(exam.id);

  // Deadline
  const dateStr = exam.lastDate;
  let deadlineHTML = '<span class="deadline-normal">—</span>';
  if (dateStr) {
    const days = daysUntil(dateStr);
    if (days === null)    deadlineHTML = '<span class="deadline-normal">—</span>';
    else if (days < 0)   deadlineHTML = `<span class="deadline-past">${formatDate(dateStr)}</span>`;
    else if (days <= 7)  deadlineHTML = `<span class="deadline-warn">${formatDate(dateStr)}</span>`;
    else if (days <= 30) deadlineHTML = `<span class="deadline-ok">${formatDate(dateStr)}</span>`;
    else                 deadlineHTML = `<span class="deadline-active">${formatDate(dateStr)}</span>`;
  }

  // Year
  let cycleHTML = '<span style="color:var(--muted)">—</span>';
  if (exam.year) {
    cycleHTML = escHtml(exam.year);
  }
  const tags = exam.tags || [];
  let tagsHTML = '<span style="color:var(--muted)">—</span>';
  if (tags.length > 0) {
    tagsHTML = `<span class="tag-badge">${escHtml(tags[0])}</span>`;
    if (tags.length > 1) tagsHTML += `<span class="tag-more">+${tags.length - 1}</span>`;
  }

  // Auto-derive status from lastDate
  let statusCls, statusLabel;
  if (!exam.lastDate) {
    statusCls   = 'na';
    statusLabel = '—';
  } else {
    const days = daysUntil(exam.lastDate);
    if (days < 0) { statusCls = 'closed'; statusLabel = 'Closed'; }
    else          { statusCls = 'open';   statusLabel = 'Open';   }
  }

  const isSelected = selectionMode && selectedIds.has(exam.id);

  const detailRow = isExpanded ? detailRowHTML(exam) : '';

  return `
  <tr class="exam-row${exam.pinned ? ' pinned-row' : ''}${isExpanded ? ' expanded' : ''}${isSelected ? ' selected-row' : ''}" id="row-${exam.id}" data-status="${statusCls}">
    <td class="td-expand-num" onclick="${selectionMode ? `toggleSelectRow('${exam.id}')` : `toggleExpand('${exam.id}')`}">
      ${selectionMode
        ? `<div class="row-select-cb${isSelected ? ' checked' : ''}"></div>`
        : `<button class="expand-btn${isExpanded ? ' open' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg></button>
           <span class="row-num">${num}</span>`
      }
    </td>
    <td class="td-name" onclick="toggleExpand('${exam.id}')" style="cursor:pointer">${escHtml(exam.name)}</td>
    <td class="td-cycle">${cycleHTML}</td>
    <td class="td-agency" onclick="toggleExpand('${exam.id}')" style="cursor:pointer">${exam.agency ? escHtml(exam.agency) : '<span style="color:var(--muted)">—</span>'}</td>
    <td class="td-tag">${tagsHTML}</td>
    <td class="td-deadline">${deadlineHTML}</td>
    <td class="td-status">${statusCls === 'na' ? '<span style="color:var(--muted)">—</span>' : `<span class="status-pill ${statusCls}">${statusLabel}</span>`}</td>
    <td class="td-applied">
      <div class="row-checkbox${exam.applied ? ' checked' : ''}" onclick="toggleApplied('${exam.id}')" title="Toggle applied"></div>
    </td>
    <td class="td-pin">
      <button class="pin-btn${exam.pinned ? ' pinned' : ''}" onclick="togglePin('${exam.id}')" title="${exam.pinned ? 'Unpin' : 'Pin'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></button>
    </td>
  </tr>${detailRow}`;
}

window.toggleExpand = (id) => {
  const isNowExpanded = !expandedCards.has(id);

  // ── Accordion: collapse any other open row first ──
  if (isNowExpanded) {
    expandedCards.forEach(openId => {
      if (openId === id) return;
      expandedCards.delete(openId);
      // desktop
      const openRow = document.getElementById('row-' + openId);
      if (openRow) {
        openRow.classList.remove('expanded');
        const openBtn = openRow.querySelector('.expand-btn');
        if (openBtn) openBtn.classList.remove('open');
        const openDetail = openRow.nextElementSibling;
        if (openDetail && openDetail.classList.contains('detail-row')) openDetail.remove();
      }
      // mobile
      const openCard = document.getElementById('mcard-' + openId);
      if (openCard) openCard.classList.remove('expanded');
    });
  }

  if (isNowExpanded) expandedCards.add(id);
  else expandedCards.delete(id);

  // ── Mobile path ──
  if (isMobile()) {
    const card = document.getElementById('mcard-' + id);
    if (card) {
      card.classList.toggle('expanded', isNowExpanded);
      if (isNowExpanded) {
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
      }
    }
    return;
  }

  // ── Desktop path: surgical DOM update ──
  const examRow = document.getElementById('row-' + id);
  if (!examRow) { renderTable(); return; }

  examRow.classList.toggle('expanded', isNowExpanded);

  const expandBtn = examRow.querySelector('.expand-btn');
  if (expandBtn) {
    expandBtn.classList.toggle('open', isNowExpanded);
  }

  const existingDetailRow = examRow.nextElementSibling;
  const hasDetailRow = existingDetailRow && existingDetailRow.classList.contains('detail-row');

  if (isNowExpanded && !hasDetailRow) {
    const exam = filteredExams.find(e => e.id === id);
    if (!exam) { renderTable(); return; }
    const tmp = document.createElement('tbody');
    tmp.innerHTML = detailRowHTML(exam);
    const newDetailRow = tmp.firstElementChild;
    if (newDetailRow) examRow.insertAdjacentElement('afterend', newDetailRow);
  } else if (!isNowExpanded && hasDetailRow) {
    existingDetailRow.remove();
  }
};

// Builds only the <tr class="detail-row"> HTML for one exam
function detailRowHTML(exam) {
  const tags = exam.tags || [];
  const resItems = exam.resources || [];
  const websiteHostname = exam.website ? (() => {
    try { return new URL(exam.website.startsWith('http') ? exam.website : 'https://' + exam.website).hostname; }
    catch(e) { return exam.website; }
  })() : '';
  const isJob = !exam.examType || exam.examType === 'job';

  // Apply by urgency class
  let applyUrgencyCls = '';
  if (exam.lastDate) {
    const d = daysUntil(exam.lastDate);
    if (d < 0)       applyUrgencyCls = 'meta-past';
    else if (d <= 7) applyUrgencyCls = 'meta-warn';
    else if (d <= 30) applyUrgencyCls = 'meta-ok';
  }

  return `
  <tr class="detail-row">
    <td colspan="9">
      <div class="exp-panel">

        <!-- BLOCK 1: Info -->
        <div class="exp-info">
          <div class="exp-name">${escHtml(exam.name)}</div>
          ${exam.subtitle ? `<div class="exp-subtitle">${escHtml(exam.subtitle)}</div>` : ''}

          <div class="exp-meta-row">
            ${exam.lastDate ? `<div class="exp-meta-item ${applyUrgencyCls}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span class="exp-meta-label">Apply by</span>
              <span class="exp-meta-val">${formatDate(exam.lastDate)}</span>
            </div>` : ''}
            ${exam.examDate ? `<div class="exp-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span class="exp-meta-label">Exam</span>
              <span class="exp-meta-val">${formatDate(exam.examDate)}</span>
            </div>` : ''}
            ${exam.website ? `<a href="${exam.website.startsWith('http') ? exam.website : 'https://'+exam.website}" target="_blank" rel="noopener" class="exp-website-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              ${escHtml(websiteHostname)}
            </a>` : ''}
          </div>

          ${isJob && (exam.vacancies || exam.pay) ? `<div class="exp-job-row">
            ${exam.vacancies ? `<div class="exp-job-chip chip-vacancies"><span class="chip-label">Vacancies</span><span class="chip-val">${escHtml(exam.vacancies)}</span></div>` : ''}
            ${exam.pay ? `<div class="exp-job-chip chip-pay"><span class="chip-label">Pay Scale</span><span class="chip-val">₹${escHtml(exam.pay)}</span></div>` : ''}
          </div>` : ''}
        </div>

        <div class="exp-divider"></div>

        <!-- BLOCK 2: Content buttons -->
        <div class="exp-field-btns">
          <button class="exp-field-btn${exam.eligibility ? '' : ' empty'}" onclick="openFieldView('${exam.id}','eligibility')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Eligibility${exam.eligibility ? '' : ' <span class="fbtn-empty">empty</span>'}
          </button>
          <button class="exp-field-btn${exam.pattern ? '' : ' empty'}" onclick="openFieldView('${exam.id}','pattern')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>
            Exam Pattern${exam.pattern ? '' : ' <span class="fbtn-empty">empty</span>'}
          </button>
          <button class="exp-field-btn${exam.syllabus ? '' : ' empty'}" onclick="openFieldView('${exam.id}','syllabus')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Syllabus${exam.syllabus ? '' : ' <span class="fbtn-empty">empty</span>'}
          </button>
          ${resItems.length > 0 ? `<div class="res-popover-wrap" id="res-wrap-${exam.id}">
            <button class="exp-field-btn exp-field-res" onclick="toggleResPopover('${exam.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              Resources <span class="res-count">${resItems.length}</span>
            </button>
            <div class="res-popover" id="res-pop-${exam.id}" style="display:none">
              <div class="res-pop-list">
                ${resItems.map(r => `<div class="res-pop-item">
                  ${r.type === 'PDF'
                    ? `<svg class="res-pop-icon res-pop-icon-pdf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
                    : `<svg class="res-pop-icon res-pop-icon-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`}
                  <a href="${r.url ? (r.url.startsWith('http') ? r.url : 'https://'+r.url) : '#'}" target="_blank" rel="noopener" class="res-pop-title">${escHtml(r.label || r.title || '')}</a>
                </div>`).join('')}
              </div>
            </div>
          </div>` : ''}
        </div>

        <!-- BLOCK 3: Tags + Edit · Delete -->
        <div class="exp-bar">
          <div class="exp-tags-row">
            <span class="exp-tags-label">Tags:</span>
            ${tags.map(t => `<span class="exp-tag" onclick="toggleTagFilter('${escHtml(t)}')">${escHtml(t)}</span>`).join('')}
            <button class="exp-tag-add" onclick="openEditExam('${exam.id}')">+ add</button>
          </div>
          <div class="exp-actions">
            <div class="exp-bar-sep"></div>
            <button class="exp-action-btn" onclick="openEditExam('${exam.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</button>
            <button class="exp-action-btn danger" onclick="deleteExam('${exam.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> Delete</button>
          </div>
        </div>

      </div>
    </td>
  </tr>`;
}

window.toggleTagFilter = (tag) => {
  if (activeTags.has(tag)) activeTags.delete(tag);
  else activeTags.add(tag);
  renderTagDropdown();
  updateClearAll();
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
  // Close other dropdowns
  document.getElementById('status-dd-menu').style.display = 'none';
  document.getElementById('sort-dd-menu').style.display = 'none';
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


window.setStatusFilter = (status) => {
  activeStatus = status;
  // Update active state in status dropdown list
  document.querySelectorAll('#status-dd-list .tag-dd-item').forEach(el => {
    el.classList.toggle('active', el.dataset.status === status);
  });
  // Update button label
  const labels = { all: 'Status', open: 'Open', closed: 'Closed', applied: 'Applied' };
  const labelEl = document.getElementById('status-dd-label');
  if (labelEl) labelEl.textContent = labels[status] || 'Status';
  // Highlight button when not default
  const btn = document.getElementById('status-dd-btn');
  if (btn) btn.classList.toggle('has-active', status !== 'all');
  // Close dropdown
  document.getElementById('status-dd-menu').style.display = 'none';
  updateClearAll();
  applyFilters();
};

window.toggleStatusDropdown = () => {
  const menu = document.getElementById('status-dd-menu');
  const open = menu.style.display === 'none' || !menu.style.display;
  // Close all other dropdowns
  document.getElementById('sort-dd-menu').style.display = 'none';
  document.getElementById('tag-dd-menu').style.display = 'none';
  menu.style.display = open ? 'block' : 'none';
  if (open) {
    setTimeout(() => document.addEventListener('click', closeStatusDdOutside, { once: true }), 10);
  }
};

function closeStatusDdOutside(e) {
  const wrap = document.getElementById('status-dd-wrap');
  if (!wrap.contains(e.target)) {
    document.getElementById('status-dd-menu').style.display = 'none';
  } else {
    setTimeout(() => document.addEventListener('click', closeStatusDdOutside, { once: true }), 10);
  }
}

window.toggleSortDropdown = () => {
  const menu = document.getElementById('sort-dd-menu');
  const open = menu.style.display === 'none' || !menu.style.display;
  // Close all other dropdowns
  document.getElementById('status-dd-menu').style.display = 'none';
  document.getElementById('tag-dd-menu').style.display = 'none';
  menu.style.display = open ? 'block' : 'none';
  if (open) {
    setTimeout(() => document.addEventListener('click', closeSortDdOutside, { once: true }), 10);
  }
};

function closeSortDdOutside(e) {
  const wrap = document.getElementById('sort-dd-wrap');
  if (!wrap.contains(e.target)) {
    document.getElementById('sort-dd-menu').style.display = 'none';
  } else {
    setTimeout(() => document.addEventListener('click', closeSortDdOutside, { once: true }), 10);
  }
}

function updateClearAll() {
  const btn = document.getElementById('btn-clear-all');
  if (!btn) return;
  const active = activeStatus !== 'all' || activeTags.size > 0 || searchQuery !== '';
  btn.style.display = active ? '' : 'none';
}

window.clearAllFilters = () => {
  // Reset status
  activeStatus = 'all';
  document.querySelectorAll('#status-dd-list .tag-dd-item').forEach(el => {
    el.classList.toggle('active', el.dataset.status === 'all');
  });
  const labelEl = document.getElementById('status-dd-label');
  if (labelEl) labelEl.textContent = 'Status';
  const statusBtn = document.getElementById('status-dd-btn');
  if (statusBtn) statusBtn.classList.remove('has-active');
  // Reset tags
  activeTags.clear();
  renderTagDropdown();
  // Reset search
  searchQuery = '';
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  updateClearAll();
  applyFilters();
};

// ── Countdown rings ───────────────────────────────
function renderCountdowns() {
  const pinned  = allExams.filter(e => e.pinned);
  const strip   = document.getElementById('countdown-rings');
  const appEl   = document.getElementById('app');
  const CIRCUMF = 2 * Math.PI * 28;  // r=28

  if (pinned.length === 0) {
    strip.innerHTML = '<div class="countdown-empty">Pin up to 5 exams to track here</div>';
    if (appEl) appEl.classList.add('no-pinned');
    return;
  }
  if (appEl) appEl.classList.remove('no-pinned');

  strip.innerHTML = pinned.map(exam => {
    const targetDate = exam.examDate || exam.lastDate;
    const isExamDate = !!exam.examDate;
    const days  = targetDate ? Math.max(0, daysUntil(targetDate)) : null;
    const total = 365;
    const pct   = days !== null ? Math.min(1, days / total) : 1;
    const offset = CIRCUMF * (1 - pct);
    const color  = days === null ? '#6b6560' : days <= 7 ? '#f87171' : days <= 30 ? '#fcd34d' : '#e07b2a';
    const label  = days === null ? '—' : days > 999 ? '999+' : String(days);
    const unit   = isExamDate ? 'days' : 'apply';

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
            <div class="ring-unit">${unit}</div>
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
  updateClearAll();
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
  lockScroll();
};
window.closeProfile = () => {
  animateOut(document.getElementById('profile-modal'), () => unlockScroll());
};

window.handleSignOut = async () => {
  // Close all open UI
  document.getElementById('profile-modal').style.display  = 'none';
  document.getElementById('exam-modal').style.display     = 'none';
  document.getElementById('confirm-modal').style.display  = 'none';
  document.getElementById('input-modal').style.display    = 'none';
  document.getElementById('md-panel').style.display       = 'none';
  document.getElementById('md-overlay').style.display     = 'none';
  document.getElementById('fv-panel').style.display       = 'none';
  document.getElementById('fv-overlay').style.display     = 'none';
  document.getElementById('status-dd-menu').style.display = 'none';
  document.getElementById('tag-dd-menu').style.display    = 'none';
  document.getElementById('sort-dd-menu').style.display   = 'none';
  document.getElementById('data-dd-menu').style.display   = 'none';

  // Clear local state
  allExams      = [];
  filteredExams = [];
  activeStatus  = 'all';
  activeTags    = new Set();
  searchQuery   = '';
  activeSort    = 'createdAt_desc';
  expandedCards = new Set();
  selectionMode = false;
  selectedIds   = new Set();
  confirmCallback    = null;
  inputModalCallback = null;
  fvExamId = null;
  fvField  = null;
  mdCurrentField = null;

  // Brief feedback then sign out
  toast('Signed out successfully.', 'success');
  setTimeout(async () => {
    await signOut(auth);
  }, 600);
};

window.handleEditDisplayName = () => {
  openInputModal(
    'Edit Display Name',
    'Display Name',
    'text',
    currentUser.displayName || '',
    'Your name',
    async (value) => {
      if (!value.trim()) { toast('Name cannot be empty.', 'error'); throw new Error(); }
      try {
        await updateProfile(currentUser, { displayName: value.trim() });
        updateUserUI();
        toast('Display name updated!', 'success');
      } catch (e) {
        toast('Failed to update name.', 'error');
        throw e;
      }
    }
  );
};

window.handleChangePassword = () => {
  // Google users have no password — nothing to change
  const isGoogle = currentUser?.providerData?.some(p => p.providerId === 'google.com');
  if (isGoogle) {
    toast('Google accounts don\'t use a password. Sign in with Google to access your account.', 'error');
    return;
  }

  // Show single modal with both fields: current password + new password
  document.getElementById('input-modal-title').textContent = 'Change Password';
  document.getElementById('input-modal-label').textContent = 'Current Password';
  const field1 = document.getElementById('input-modal-field');
  field1.type        = 'password';
  field1.value       = '';
  field1.placeholder = 'Enter your current password';

  const field2Group = document.getElementById('input-modal-field2-group');
  const field2Label = document.getElementById('input-modal-label2');
  const field2      = document.getElementById('input-modal-field2');
  field2Group.style.display = 'block';
  field2Label.textContent   = 'New Password';
  field2.type        = 'password';
  field2.value       = '';
  field2.placeholder = 'min 6 characters';

  const confirmBtn = document.getElementById('input-modal-confirm-btn');
  confirmBtn.textContent = 'Update Password';
  inputModalCallback = null; // not using the generic callback path

  confirmBtn.onclick = async () => {
    const currentPassword = field1.value;
    const newPassword     = field2.value;
    if (!currentPassword) { toast('Enter your current password.', 'error'); return; }
    if (!newPassword || newPassword.length < 6) { toast('New password must be at least 6 characters.', 'error'); return; }
    if (currentPassword === newPassword) { toast('New password must be different from current.', 'error'); return; }

    const origText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="loading-spinner"></span>';

    try {
      // Reauthenticate first
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      // Then update
      await updatePassword(currentUser, newPassword);
      toast('Password updated!', 'success');
      closeInputModal();
    } catch (e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        toast('Current password is incorrect.', 'error');
      } else {
        toast('Failed to update password. Try again.', 'error');
      }
    } finally {
      confirmBtn.disabled  = false;
      confirmBtn.textContent = origText;
    }
  };

  field1.onkeydown = (e) => { if (e.key === 'Enter') field2.focus(); };
  field2.onkeydown = (e) => { if (e.key === 'Enter') confirmBtn.click(); };

  document.getElementById('input-modal').style.display = 'flex';
  lockScroll();
  setTimeout(() => field1.focus(), 50);
};

// ── Input Modal (replaces window.prompt) ─────────────
let inputModalCallback = null;

function openInputModal(title, label, type, defaultValue, placeholder, callback) {
  document.getElementById('input-modal-title').textContent = title;
  document.getElementById('input-modal-label').textContent = label;
  const field = document.getElementById('input-modal-field');
  field.type        = type;
  field.value       = defaultValue;
  field.placeholder = placeholder;
  inputModalCallback = callback;
  const confirmBtn = document.getElementById('input-modal-confirm-btn');
  confirmBtn.onclick = async () => {
    if (!inputModalCallback) return;
    const origText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="loading-spinner"></span>';
    try {
      await inputModalCallback(field.value);
      closeInputModal();
    } catch (e) {
      // callback handles its own error toast; keep modal open so user can retry
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = origText;
    }
  };
  // Allow Enter key to submit
  field.onkeydown = (e) => { if (e.key === 'Enter') confirmBtn.click(); };
  document.getElementById('input-modal').style.display = 'flex';
  lockScroll();
  setTimeout(() => field.focus(), 50);
}

window.closeInputModal = () => {
  animateOut(document.getElementById('input-modal'), () => {
    unlockScroll();
    inputModalCallback = null;
    // Reset second field in case Change Password used it
    const g = document.getElementById('input-modal-field2-group');
    if (g) g.style.display = 'none';
    const f2 = document.getElementById('input-modal-field2');
    if (f2) { f2.value = ''; f2.onkeydown = null; }
    const f1 = document.getElementById('input-modal-field');
    if (f1) f1.onkeydown = null;
    const btn = document.getElementById('input-modal-confirm-btn');
    if (btn) { btn.textContent = 'Save'; btn.onclick = null; }
  });
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
  // Detect if user signed in with Google (no password)
  const isGoogle = currentUser?.providerData?.some(p => p.providerId === 'google.com');

  openConfirm(
    'Delete Account',
    'This will permanently delete your account and ALL exam data. This action cannot be undone.',
    !isGoogle,
    async () => {
      try {
        // Re-authenticate
        if (isGoogle) {
          // Google users must re-auth via popup
          await reauthenticateWithCredential(
            currentUser,
            await (async () => {
              const { GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
              const result = await signInWithPopup(auth, gProvider);
              return GoogleAuthProvider.credentialFromResult(result);
            })()
          );
        } else {
          const password = document.getElementById('confirm-password-input').value;
          if (!password) return toast('Enter your password to confirm.', 'error');
          const credential = EmailAuthProvider.credential(currentUser.email, password);
          await reauthenticateWithCredential(currentUser, credential);
        }

        // Delete all Firestore exam data
        const snap = await getDocs(examsRef());
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        // Close all open UI
        document.getElementById('profile-modal').style.display  = 'none';
        document.getElementById('exam-modal').style.display     = 'none';
        document.getElementById('confirm-modal').style.display  = 'none';
        document.getElementById('input-modal').style.display    = 'none';
        document.getElementById('md-panel').style.display       = 'none';
        document.getElementById('md-overlay').style.display     = 'none';
        document.getElementById('fv-panel').style.display       = 'none';
        document.getElementById('fv-overlay').style.display     = 'none';
        document.getElementById('status-dd-menu').style.display = 'none';
        document.getElementById('tag-dd-menu').style.display    = 'none';
        document.getElementById('sort-dd-menu').style.display   = 'none';
        document.getElementById('data-dd-menu').style.display   = 'none';

        // Clear all local state
        allExams      = [];
        filteredExams = [];
        activeStatus  = 'all';
        activeTags    = new Set();
        searchQuery   = '';
        activeSort    = 'createdAt_desc';
        expandedCards = new Set();
        selectionMode = false;
        selectedIds   = new Set();
        confirmCallback    = null;
        inputModalCallback = null;
        fvExamId = null;
        fvField  = null;

        // Delete Firebase Auth user
        await deleteUser(currentUser);

        // onAuthStateChanged will fire and call showAuthScreen()
        toast('Account deleted.', 'success');
      } catch (e) {
        if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
          toast('Wrong password. Account not deleted.', 'error');
        } else if (e.code === 'auth/requires-recent-login') {
          toast('Please sign out, sign back in, then try again.', 'error');
        } else {
          toast('Delete failed: ' + (e.message || e.code), 'error');
        }
      }
    },
    'Delete My Account'
  );
};

// ════════════════════════════════════════════════════
//  IMPORT / EXPORT
// ════════════════════════════════════════════════════

window.exportJSON = () => {
  const data = allExams.map(e => ({
    name:         e.name         || '',
    agency:       e.agency       || '',
    subtitle:     e.subtitle     || '',
    examType:     e.examType     || 'job',
    lastDate:     e.lastDate     || '',
    examDate:     e.examDate     || '',
    website:      e.website      || '',
    vacancies:    e.vacancies    || '',
    pay:          e.pay          || '',
    eligibility:  e.eligibility  || '',
    pattern:      e.pattern      || '',
    syllabus:     e.syllabus     || '',
    tags:         Array.isArray(e.tags) ? e.tags : [],
    year:         e.year         || '',
    resources:    Array.isArray(e.resources) ? e.resources : [],
  }));
  downloadFile(JSON.stringify(data, null, 2), 'exams.json', 'application/json');
  toast('Exported JSON!', 'success');
};

window.toggleDataDropdown = () => {
  const menu = document.getElementById('data-dd-menu');
  const open = menu.style.display === 'none' || !menu.style.display;
  // Close all other dropdowns
  document.getElementById('status-dd-menu').style.display = 'none';
  document.getElementById('tag-dd-menu').style.display    = 'none';
  document.getElementById('sort-dd-menu').style.display   = 'none';
  menu.style.display = open ? 'block' : 'none';
  if (open) {
    setTimeout(() => document.addEventListener('click', closeDataDdOutside, { once: true }), 10);
  }
};

function closeDataDdOutside(e) {
  const wrap = document.getElementById('data-dd-wrap');
  if (!wrap || !wrap.contains(e.target)) {
    const menu = document.getElementById('data-dd-menu');
    if (menu) menu.style.display = 'none';
  } else {
    setTimeout(() => document.addEventListener('click', closeDataDdOutside, { once: true }), 10);
  }
}

window.importJSON = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return toast('Invalid JSON format.', 'error');

    // Build the cleaned list first
    const toImport = data
      .filter(exam => exam.name)
      .map(exam => {
        const lastDate  = exam.lastDate  || '';
        const examDate  = exam.examDate  || '';

        return {
          name:         String(exam.name   || ''),
          agency:       String(exam.agency || ''),
          subtitle:     String(exam.subtitle || ''),
          examType:     exam.examType === 'entrance' ? 'entrance' : 'job',
          lastDate,
          examDate,
          website:      exam.website      || '',
          vacancies:    String(exam.vacancies || ''),
          pay:          String(exam.pay       || ''),
          eligibility:  exam.eligibility  || '',
          pattern:      exam.pattern      || '',
          syllabus:     exam.syllabus     || '',
          tags:         Array.isArray(exam.tags) ? exam.tags.map(String) : [],
          year:         String(exam.year  || ''),
          applied:      false,
          pinned:       false,
          resources:    Array.isArray(exam.resources)
                          ? exam.resources
                              .filter(r => r.type && r.label && r.url)
                              .map(r => ({ type: String(r.type), label: String(r.label), url: String(r.url) }))
                          : [],
          createdAt:    serverTimestamp(),
        };
      });

    if (toImport.length === 0) return toast('No valid exams found in file.', 'error');
    if (toImport.length > 60) return toast('Import limit is 60 exams per file.', 'error');

    // Firestore batch limit is 500 — chunk to be safe
    const CHUNK = 400;
    for (let i = 0; i < toImport.length; i += CHUNK) {
      const batch = writeBatch(db);
      toImport.slice(i, i + CHUNK).forEach(clean => {
        batch.set(doc(collection(db, 'users', currentUser.uid, 'exams')), clean);
      });
      await batch.commit();
    }
    toast(`Imported ${toImport.length} exam${toImport.length !== 1 ? 's' : ''}!`, 'success');
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

function openConfirm(title, message, needsPassword, callback, btnLabel = 'Delete') {
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-action-btn').textContent = btnLabel;
  const pg = document.getElementById('confirm-password-group');
  pg.style.display = needsPassword ? 'block' : 'none';
  if (needsPassword) document.getElementById('confirm-password-input').value = '';
  confirmCallback = callback;
  document.getElementById('confirm-modal').style.display = 'flex';
  lockScroll();
}

window.closeConfirmModal = () => {
  animateOut(document.getElementById('confirm-modal'), () => {
    unlockScroll();
    confirmCallback = null;
  });
};

// ── Discard-changes modal (replaces window.confirm for unsaved-changes checks) ──
let discardCallback = null;

function openDiscardModal(onDiscard) {
  discardCallback = onDiscard;
  document.getElementById('discard-modal').style.display = 'flex';
  // no lockScroll — a panel is already locking scroll underneath
}

document.getElementById('discard-keep-btn').addEventListener('click', () => {
  animateOut(document.getElementById('discard-modal'), () => { discardCallback = null; });
});

document.getElementById('discard-confirm-btn').addEventListener('click', () => {
  const cb = discardCallback;
  discardCallback = null;
  animateOut(document.getElementById('discard-modal'), () => { if (cb) cb(); });
});

document.getElementById('confirm-action-btn').addEventListener('click', async () => {
  if (!confirmCallback) return;
  const btn = document.getElementById('confirm-action-btn');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span>';
  try {
    await confirmCallback();
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
});

// ════════════════════════════════════════════════════
//  THEME TOGGLE
// ════════════════════════════════════════════════════

window.toggleTheme = () => {
  const html   = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
};

// ── Scroll lock helpers ──────────────────────────────
// lockScroll / unlockScroll — only unlock when no overlay/panel is open
function lockScroll() {
  document.body.classList.add('modal-open');
}
function unlockScroll() {
  const anyOpen =
    document.getElementById('exam-modal')?.style.display    === 'flex' ||
    document.getElementById('profile-modal')?.style.display === 'flex' ||
    document.getElementById('confirm-modal')?.style.display === 'flex' ||
    document.getElementById('input-modal')?.style.display   === 'flex' ||
    document.getElementById('md-panel')?.style.display      === 'flex' ||
    document.getElementById('fv-panel')?.style.display      === 'flex';
  if (!anyOpen) document.body.classList.remove('modal-open');
}

// ════════════════════════════════════════════════════
//  MODAL OVERLAY CLICK TO CLOSE
// ════════════════════════════════════════════════════

window.closeModalOnOverlay = (event, modalId) => {
  if (event.target === event.currentTarget) {
    if (modalId === 'confirm-modal') { closeConfirmModal(); return; }
    if (modalId === 'input-modal')   { closeInputModal();   return; }
    if (modalId === 'exam-modal')    { closeExamModal();    return; }
    if (modalId === 'profile-modal') { closeProfile();      return; }
    // fallback
    animateOut(document.getElementById(modalId));
  }
};

// Global Escape key to close topmost open UI
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('fv-panel')?.style.display !== 'none') { closeFieldView(); return; }
  if (document.getElementById('md-panel')?.style.display !== 'none') { closeMdPanel(); return; }
  if (document.getElementById('input-modal')?.style.display !== 'none') { closeInputModal(); return; }
  if (document.getElementById('confirm-modal')?.style.display !== 'none') { closeConfirmModal(); return; }
  if (document.getElementById('exam-modal')?.style.display !== 'none') { closeExamModal(); return; }
  if (document.getElementById('profile-modal')?.style.display !== 'none') { closeProfile(); return; }
  // Close any open dropdown
  const anyDdOpen =
    document.getElementById('status-dd-menu')?.style.display === 'block' ||
    document.getElementById('tag-dd-menu')?.style.display    === 'block' ||
    document.getElementById('sort-dd-menu')?.style.display   === 'block' ||
    document.getElementById('data-dd-menu')?.style.display   === 'block';
  if (anyDdOpen) {
    document.getElementById('status-dd-menu').style.display = 'none';
    document.getElementById('tag-dd-menu').style.display    = 'none';
    document.getElementById('sort-dd-menu').style.display   = 'none';
    document.getElementById('data-dd-menu').style.display   = 'none';
  }
});

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

// ── Exit animation helper ─────────────────────────
// Adds `is-closing` class, waits for animation to finish, then hides + runs cb.
function animateOut(el, cb) {
  if (!el) { if (cb) cb(); return; }
  el.classList.add('is-closing');
  const onEnd = () => {
    el.classList.remove('is-closing');
    el.style.display = 'none';
    if (cb) cb();
  };
  // Use animationend; fall back after 250ms in case animation is absent
  const timer = setTimeout(onEnd, 250);
  el.addEventListener('animationend', () => { clearTimeout(timer); onEnd(); }, { once: true });
}

// ════════════════════════════════════════════════════
//  MARKDOWN PANEL — used only from Add/Edit exam modal
// ════════════════════════════════════════════════════

const fieldLabels = {
  eligibility: 'Eligibility',
  syllabus:    'Syllabus',
  pattern:     'Exam Pattern',
};

window.openMdFromModal = (field) => {
  mdCurrentField = field;
  const examName = document.getElementById('f-name')?.value.trim() || 'New Exam';
  document.getElementById('md-panel-title').textContent = `${fieldLabels[field]} — ${examName}`;
  const ta = document.getElementById('md-editor-textarea');
  ta.value = modalDraft[field] || '';
  mdPreview();
  document.getElementById('md-save-status').textContent = '';
  document.getElementById('md-panel').style.display   = 'flex';
  document.getElementById('md-overlay').style.display = 'block';
  lockScroll();
  ta.focus();
};

window.closeMdPanel = () => {
  // Warn if user has unsaved changes (textarea differs from what's in modalDraft)
  if (mdCurrentField) {
    const current = document.getElementById('md-editor-textarea').value;
    const saved   = modalDraft[mdCurrentField] || '';
    if (current !== saved) {
      openDiscardModal(() => {
        animateOut(document.getElementById('md-panel'));
        animateOut(document.getElementById('md-overlay'), () => {
          mdCurrentField = null;
          unlockScroll();
        });
      });
      return;
    }
  }
  animateOut(document.getElementById('md-panel'));
  animateOut(document.getElementById('md-overlay'), () => {
    mdCurrentField = null;
    unlockScroll();
  });
};

// Called only when clicking the overlay — auto-saves draft so work is never lost
window.closeMdPanelFromOverlay = () => {
  if (mdCurrentField) {
    const value = document.getElementById('md-editor-textarea').value;
    modalDraft[mdCurrentField] = value;
    setModalDraftPreview(mdCurrentField);
  }
  closeMdPanel();
};

window.saveMdPanel = () => {
  if (!mdCurrentField) return;
  const value = document.getElementById('md-editor-textarea').value;
  modalDraft[mdCurrentField] = value;
  setModalDraftPreview(mdCurrentField);
  document.getElementById('md-save-status').textContent = '✓ Saved to draft';
  setTimeout(closeMdPanel, 400);
};

// ════════════════════════════════════════════════════
//  FIELD VIEW PANEL (view → edit → save)
// ════════════════════════════════════════════════════

let fvExamId       = null;
let fvField        = null;
let mdCurrentField = null; // tracks which field md-panel is editing — never parse the title

window.openFieldView = (examId, field) => {
  const exam = allExams.find(e => e.id === examId);
  if (!exam) return;
  fvExamId = examId;
  fvField  = field;

  // Set titles
  document.getElementById('fv-title').textContent    = fieldLabels[field];
  document.getElementById('fv-sub').textContent      = exam.name;
  document.getElementById('fv-edit-title').textContent = `${fieldLabels[field]} — ${exam.name}`;

  // Render content in view mode
  const content = exam[field] || '';
  const contentEl = document.getElementById('fv-content');
  if (content.trim()) {
    contentEl.innerHTML = parseMd(content);
  } else {
    contentEl.innerHTML = `<div class="fv-empty-state">Nothing added yet. Click Edit to add content.</div>`;
  }

  // Always open in view mode
  document.getElementById('fv-view-mode').style.display = 'flex';
  document.getElementById('fv-edit-mode').style.display = 'none';
  document.getElementById('fv-save-status').textContent = '';

  document.getElementById('fv-panel').style.display   = 'flex';
  document.getElementById('fv-overlay').style.display = 'block';
  lockScroll();
};

window.switchToEditMode = () => {
  const exam = allExams.find(e => e.id === fvExamId);
  if (!exam) return;
  // Load content into editor
  const ta = document.getElementById('fv-editor-textarea');
  ta.value = exam[fvField] || '';
  fvLivePreview();
  document.getElementById('fv-view-mode').style.display = 'none';
  document.getElementById('fv-edit-mode').style.display = 'flex';
  ta.focus();
};

window.switchToViewMode = () => {
  // Warn if user has unsaved changes (textarea differs from last saved value)
  if (fvExamId && fvField) {
    const current = document.getElementById('fv-editor-textarea').value;
    const exam    = allExams.find(e => e.id === fvExamId);
    const saved   = (exam && exam[fvField]) || '';
    if (current !== saved) {
      openDiscardModal(() => {
        document.getElementById('fv-view-mode').style.display = 'flex';
        document.getElementById('fv-edit-mode').style.display = 'none';
      });
      return;
    }
  }
  document.getElementById('fv-view-mode').style.display = 'flex';
  document.getElementById('fv-edit-mode').style.display = 'none';
};

window.closeFieldView = () => {
  // Warn only if currently in edit mode with unsaved changes
  const editMode = document.getElementById('fv-edit-mode');
  if (editMode && editMode.style.display !== 'none' && fvExamId && fvField) {
    const current = document.getElementById('fv-editor-textarea').value;
    const exam    = allExams.find(e => e.id === fvExamId);
    const saved   = (exam && exam[fvField]) || '';
    if (current !== saved) {
      openDiscardModal(() => {
        animateOut(document.getElementById('fv-panel'));
        animateOut(document.getElementById('fv-overlay'), () => {
          fvExamId = null;
          fvField  = null;
          unlockScroll();
        });
      });
      return;
    }
  }
  animateOut(document.getElementById('fv-panel'));
  animateOut(document.getElementById('fv-overlay'), () => {
    fvExamId = null;
    fvField  = null;
    unlockScroll();
  });
};

window.fvLivePreview = () => {
  const raw = document.getElementById('fv-editor-textarea').value;
  document.getElementById('fv-live-preview').innerHTML = parseMd(raw);
};

window.saveFvPanel = async () => {
  if (!fvExamId || !fvField) return;
  const value    = document.getElementById('fv-editor-textarea').value;
  const statusEl = document.getElementById('fv-save-status');
  const saveBtn  = document.querySelector('#fv-edit-mode .btn-primary');
  statusEl.textContent = 'Saving…';
  if (saveBtn) { saveBtn.disabled = true; }
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'exams', fvExamId), { [fvField]: value });
    const exam = allExams.find(e => e.id === fvExamId);
    if (exam) exam[fvField] = value;
    statusEl.textContent = '✓ Saved';
    setTimeout(() => {
      const contentEl = document.getElementById('fv-content');
      contentEl.innerHTML = value.trim() ? parseMd(value) : `<div class="fv-empty-state">Nothing added yet.</div>`;
      document.getElementById('fv-view-mode').style.display = 'flex';
      document.getElementById('fv-edit-mode').style.display = 'none';
      // Surgical: refresh only the field buttons in the open detail-row
      const examRow = document.getElementById('row-' + fvExamId);
      const detailTr = examRow && examRow.nextElementSibling;
      if (detailTr && detailTr.classList.contains('detail-row')) {
        const exam = allExams.find(e => e.id === fvExamId);
        if (exam) {
          const tmp = document.createElement('tbody');
          tmp.innerHTML = detailRowHTML(exam);
          const newDetailTr = tmp.firstElementChild;
          if (newDetailTr) detailTr.replaceWith(newDetailTr);
        }
      }
    }, 400);  } catch (e) {
    statusEl.textContent = '✗ Save failed';
    toast('Save failed.', 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; }
  }
};

window.mdPreview = () => {
  const raw = document.getElementById('md-editor-textarea').value;
  document.getElementById('md-preview').innerHTML = parseMd(raw);
};

// Toolbar helpers
// Detect which editor panel is active and return its textarea + preview updater
function getActiveEditor() {
  const fvEdit = document.getElementById('fv-edit-mode');
  if (fvEdit && fvEdit.style.display !== 'none') {
    return { ta: document.getElementById('fv-editor-textarea'), preview: fvLivePreview };
  }
  return { ta: document.getElementById('md-editor-textarea'), preview: mdPreview };
}

window.mdInsert = (before, after, lineStart = false) => {
  const { ta, preview } = getActiveEditor();
  const s = ta.selectionStart, e = ta.selectionEnd;
  const selected = ta.value.substring(s, e);
  let replacement, cursorStart, cursorEnd;
  if (lineStart) {
    // Insert at start of line — no wrapping
    replacement = before + (selected || '');
    cursorStart = s + before.length;
    cursorEnd   = s + before.length + (selected || '').length;
  } else {
    replacement = before + (selected || 'text') + after;
    cursorStart = s + before.length;
    cursorEnd   = s + before.length + (selected || 'text').length;
  }
  ta.value = ta.value.substring(0, s) + replacement + ta.value.substring(e);
  ta.selectionStart = cursorStart;
  ta.selectionEnd   = cursorEnd;
  ta.focus();
  preview();
};

// Preview toggle — shared by both md-panel and fv-panel
let mdPreviewVisible = true; // default: on

window.toggleMdPreview = () => {
  mdPreviewVisible = !mdPreviewVisible;
  applyMdPreviewState();
};

function applyMdPreviewState() {
  const show = mdPreviewVisible;
  [1, 2].forEach(i => {
    const pane   = document.getElementById(`md-preview-pane-${i}`);
    const div    = document.getElementById(`md-divider-${i}`);
    const label  = document.getElementById(`md-preview-toggle-label-${i}`);
    const btn    = document.getElementById(`md-preview-toggle-${i}`);
    if (!pane) return;
    pane.style.display  = show ? '' : 'none';
    div.style.display   = show ? '' : 'none';
    if (label) label.textContent = show ? 'Hide Preview' : 'Preview';
    if (btn)   btn.classList.toggle('md-preview-toggle--off', !show);
  });
}

window.mdInsertTable = () => {
  const tbl = '\n| Column 1 | Column 2 | Column 3 |\n|---|---|---|\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |\n';
  const { ta, preview } = getActiveEditor();
  const pos = ta.selectionStart;
  ta.value  = ta.value.substring(0, pos) + tbl + ta.value.substring(pos);
  ta.focus();
  preview();
};

window.mdInsertLink = () => {
  const { ta, preview } = getActiveEditor();
  const s = ta.selectionStart, e = ta.selectionEnd;
  const selected = ta.value.substring(s, e) || 'Link text';
  const replacement = `[${selected}](https://url)`;
  ta.value = ta.value.substring(0, s) + replacement + ta.value.substring(e);
  ta.selectionStart = s + selected.length + 3;
  ta.selectionEnd   = s + replacement.length - 1;
  ta.focus();
  preview();
};

window.mdInsertCallout = () => {
  const { ta, preview } = getActiveEditor();
  const pos = ta.selectionStart;
  const snippet = '\n:::info\nYour important note here\n:::\n';
  ta.value = ta.value.substring(0, pos) + snippet + ta.value.substring(pos);
  ta.selectionStart = pos + 9;
  ta.selectionEnd   = pos + 9 + 24;
  ta.focus();
  preview();
};

window.mdInsertCollapsible = () => {
  const { ta, preview } = getActiveEditor();
  const pos = ta.selectionStart;
  const snippet = '\n+++ Section Title\nContent goes here\n+++\n';
  ta.value = ta.value.substring(0, pos) + snippet + ta.value.substring(pos);
  ta.selectionStart = pos + 5;
  ta.selectionEnd   = pos + 5 + 13;
  ta.focus();
  preview();
};

// ════════════════════════════════════════════════════
//  MOBILE CARD RENDERER  (≤ 640px)
// ════════════════════════════════════════════════════

function isMobile() {
  return window.innerWidth <= 640;
}

function mobileCardHTML(exam) {
  const tags     = exam.tags || [];
  const resItems = exam.resources || [];
  const isExpanded = expandedCards.has(exam.id);

  // deadline — apply-by only, not exam date
  const dateStr = exam.lastDate;
  let dlClass = '', dlText = '';
  if (dateStr) {
    const days = daysUntil(dateStr);
    dlText  = formatDate(dateStr);
    dlClass = days < 0 ? 'past' : 'active';
  }

  // status
  let statusCls = 'na', statusLabel = '';
  if (exam.lastDate) {
    const d = daysUntil(exam.lastDate);
    statusCls   = d < 0 ? 'closed' : 'open';
    statusLabel = d < 0 ? 'Closed' : 'Open';
  }

  const isJob = !exam.examType || exam.examType === 'job';

  // detail section
  const detailHTML = `
    <div class="m-card-detail">

      <div class="m-detail-meta">
        ${exam.year ? `<div class="m-detail-meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span class="m-detail-meta-label">Year</span>
          <span class="m-detail-meta-val">${escHtml(exam.year)}</span>
        </div>` : ''}
        ${exam.lastDate ? `<div class="m-detail-meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span class="m-detail-meta-label">Apply by</span>
          <span class="m-detail-meta-val">${formatDate(exam.lastDate)}</span>
        </div>` : ''}
        ${exam.examDate ? `<div class="m-detail-meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span class="m-detail-meta-label">Exam</span>
          <span class="m-detail-meta-val">${formatDate(exam.examDate)}</span>
        </div>` : ''}
      </div>

      ${isJob && (exam.vacancies || exam.pay) ? `
      <div class="m-detail-chips">
        ${exam.vacancies ? `<div class="m-detail-chip chip-vacancies"><span class="m-chip-label">Vacancies</span><span class="m-chip-val">${escHtml(exam.vacancies)}</span></div>` : ''}
        ${exam.pay ? `<div class="m-detail-chip chip-pay"><span class="m-chip-label">Pay</span><span class="m-chip-val">₹${escHtml(exam.pay)}</span></div>` : ''}
      </div>` : ''}

      <div class="m-detail-field-btns">
        <button class="m-detail-field-btn${exam.eligibility ? '' : ' empty'}" onclick="event.stopPropagation();openFieldView('${exam.id}','eligibility')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Eligibility${exam.eligibility ? '' : ' <span class="fbtn-empty">empty</span>'}
        </button>
        <button class="m-detail-field-btn${exam.pattern ? '' : ' empty'}" onclick="event.stopPropagation();openFieldView('${exam.id}','pattern')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>
          Pattern${exam.pattern ? '' : ' <span class="fbtn-empty">empty</span>'}
        </button>
        <button class="m-detail-field-btn${exam.syllabus ? '' : ' empty'}" onclick="event.stopPropagation();openFieldView('${exam.id}','syllabus')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Syllabus${exam.syllabus ? '' : ' <span class="fbtn-empty">empty</span>'}
        </button>
        ${resItems.length > 0 ? `<div class="res-popover-wrap" id="m-res-wrap-${exam.id}">
          <button class="m-detail-field-btn exp-field-res" onclick="event.stopPropagation();toggleResPopover('m-${exam.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Resources <span class="res-count">${resItems.length}</span>
          </button>
          <div class="res-popover" id="res-pop-m-${exam.id}" style="display:none">
            <div class="res-pop-list">
              ${resItems.map(r => `<div class="res-pop-item">
                ${r.type === 'PDF'
                  ? `<svg class="res-pop-icon res-pop-icon-pdf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
                  : `<svg class="res-pop-icon res-pop-icon-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`}
                <a href="${r.url ? (r.url.startsWith('http') ? r.url : 'https://'+r.url) : '#'}" target="_blank" rel="noopener" class="res-pop-title">${escHtml(r.label || r.title || '')}</a>
              </div>`).join('')}
            </div>
          </div>
        </div>` : ''}
        ${exam.website ? `<a href="${exam.website.startsWith('http') ? exam.website : 'https://'+exam.website}" target="_blank" rel="noopener" class="m-detail-field-btn m-detail-link-btn" onclick="event.stopPropagation()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Website
        </a>` : ''}
      </div>

      ${tags.length > 0 ? `
      <div class="m-detail-tags">
        <span class="m-detail-tags-label">Tags:</span>
        ${tags.map(t => `<span class="m-detail-tag" onclick="event.stopPropagation();toggleTagFilter('${escHtml(t)}')">${escHtml(t)}</span>`).join('')}
      </div>` : ''}

      <div class="m-detail-actions">
        <button class="m-detail-action-btn" onclick="event.stopPropagation();openEditExam('${exam.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        <button class="m-detail-action-btn danger" onclick="event.stopPropagation();deleteExam('${exam.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          Delete
        </button>
      </div>
    </div>`;

  return `
  <div class="m-card${exam.pinned ? ' pinned-card' : ''}${isExpanded ? ' expanded' : ''}"
       data-status="${statusCls}" data-id="${exam.id}"
       id="mcard-${exam.id}">
    <div class="m-card-top" onclick="toggleExpand('${exam.id}')">
      <div class="m-card-chevron">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="m-card-main">
        <div class="m-card-name">${escHtml(exam.name)}</div>
        <div class="m-card-meta">
          ${exam.agency ? `<span class="m-card-agency">${escHtml(exam.agency)}</span>` : ''}
          ${exam.year   ? `<span class="m-card-agency m-card-year" style="color:var(--muted)">${escHtml(exam.year)}</span>` : ''}
          ${dlText ? `<div class="m-card-status-date">
            ${statusLabel ? `<span class="m-status-pill ${statusCls}">${statusLabel}</span>` : ''}
            <span class="m-card-deadline ${dlClass}">${dlText}</span>
          </div>` : (statusLabel ? `<span class="m-status-pill ${statusCls}">${statusLabel}</span>` : '')}
        </div>
      </div>
      <div class="m-card-right">
        <div class="m-card-applied${exam.applied ? ' checked' : ''}"
             onclick="event.stopPropagation();toggleApplied('${exam.id}')"
             title="Toggle applied"></div>
        <button class="m-card-pin${exam.pinned ? ' pinned' : ''}"
                onclick="event.stopPropagation();togglePin('${exam.id}')"
                title="${exam.pinned ? 'Unpin' : 'Pin'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </button>
      </div>
    </div>
    ${detailHTML}
  </div>`;
}

function renderMobileCards() {
  const container = document.getElementById('mobile-card-list');
  if (!container) return;

  const empty         = document.getElementById('list-empty');
  const emptyFiltered = document.getElementById('list-empty-filtered');

  if (filteredExams.length === 0) {
    container.innerHTML = '';
    if (allExams.length === 0) {
      empty.style.display = 'block';
      if (emptyFiltered) emptyFiltered.style.display = 'none';
    } else {
      empty.style.display = 'none';
      if (emptyFiltered) emptyFiltered.style.display = 'block';
    }
    return;
  }

  empty.style.display = 'none';
  if (emptyFiltered) emptyFiltered.style.display = 'none';
  container.innerHTML = filteredExams.map(e => mobileCardHTML(e)).join('');
}

// Re-render on resize (rotate phone, devtools resize)
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    // Reset selection mode when switching to mobile viewport
    if (isMobile() && selectionMode) {
      selectionMode = false;
      selectedIds.clear();
      const btn = document.getElementById('btn-select-mode');
      if (btn) btn.classList.remove('active');
      updateBatchDeleteBtn();
    }
    if (allExams.length > 0 || dataLoaded) renderTable();
  }, 150);
});

// Toggle task checkbox click (visual only — does not write back to source)
window.toggleTaskCb = (btn) => {
  const isChecked = btn.classList.toggle('task-cb--checked');
  const li = btn.closest('.task-item');
  if (li) li.classList.toggle('task-done', isChecked);
};

function parseMd(md) {
  if (!md) return '';
  let html = escHtml(md);

  // Headings — most specific first
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm,  '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,   '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,    '<h1>$1</h1>');

  // HR
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Callout boxes :::type ... :::
  html = html.replace(/:::(\w+)\n([\s\S]*?):::/gm, (_, type, content) => {
    const t = type.toLowerCase();
    const cls = t === 'warn' || t === 'warning' ? 'callout-warn'
              : t === 'tip'                      ? 'callout-tip'
              : t === 'success'                  ? 'callout-success'
              :                                    'callout-info';
    const icon = t === 'warn' || t === 'warning' ? '⚠️'
               : t === 'tip'                      ? '💡'
               : t === 'success'                  ? '✅'
               :                                    'ℹ️';
    return `<div class="md-callout ${cls}"><span class="callout-icon">${icon}</span><div class="callout-body">${content.trim()}</div></div>`;
  });

  // Collapsible +++ Title \n content \n +++
  html = html.replace(/\+\+\+ (.+)\n([\s\S]*?)\+\+\+/gm, (_, title, content) => {
    return `<details class="md-collapsible"><summary class="md-collapsible-title">${title.trim()}</summary><div class="md-collapsible-body">${content.trim()}</div></details>`;
  });

  // Bold + italic (order: *** before ** before *)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g,         '<em>$1</em>');

  // Underline, strikethrough, highlight
  html = html.replace(/__(.+?)__/g,   '<u>$1</u>');
  html = html.replace(/~~(.+?)~~/g,   '<s>$1</s>');
  html = html.replace(/==(.+?)==/g,   '<mark>$1</mark>');

  // Inline code
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  // Tables
  html = html.replace(/((^\|.+\|\n?)+)/gm, (match) => {
    const rows = match.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return match;
    let out = '<table>';
    rows.forEach((row, i) => {
      if (/^\|[-| ]+\|$/.test(row.replace(/&lt;|&gt;/g,'-'))) return;
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

  // Task checkboxes (before regular lists) — clickable toggle
  html = html.replace(/^- \[x\] (.+)$/gim, '<li class="task-item task-done"><button class="task-cb task-cb--checked" onclick="toggleTaskCb(this)" type="button"></button><span class="task-label">$1</span></li>');
  html = html.replace(/^- \[ \] (.+)$/gm,  '<li class="task-item"><button class="task-cb" onclick="toggleTaskCb(this)" type="button"></button><span class="task-label">$1</span></li>');
  // Wrap consecutive task items
  html = html.replace(/(<li class="task-item[^"]*">.*<\/li>\n?)+/g, match => `<ul class="task-list">${match}</ul>`);

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
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
    let trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) && !/^mailto:/i.test(trimmed)) {
      if (/^(javascript|data|vbscript):/i.test(trimmed)) return escHtml(label);
      trimmed = 'https://' + trimmed;
    }
    return `<a href="${trimmed}" target="_blank" rel="noopener">${label}</a>`;
  });

  // Paragraphs — wrap bare lines not already in tags
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
