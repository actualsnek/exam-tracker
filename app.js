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
  onSnapshot
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
let activeSort   = 'manual';
let expandedCards = new Set();
let examsUnsubscribe = null; // holds the onSnapshot detach function
let selectionMode = false;
let reorderMode   = false;
let selectedIds   = new Set();
let dataLoaded    = false;  // true after first onSnapshot fires
let fvExamId       = null;
let fvField        = null;
let fvSaveTimer    = null;
let mdCurrentField = null; // tracks which field md-panel is editing
let modalOriginal  = null; // snapshot of exam data when modal opens; null = no modal open
let confirmCallback    = null;
let inputModalCallback = null;
let discardCallback    = null;
let modalDraft         = { eligibility: '', syllabus: '', info: '' }; // temp values while exam modal is open
let modalResources     = []; // temp resources list while exam modal is open

function resetAppState() {
  allExams           = [];
  filteredExams      = [];
  activeStatus       = 'all';
  activeTags         = new Set();
  searchQuery        = '';
  activeSort         = 'manual';
  expandedCards      = new Set();
  selectionMode      = false;
  reorderMode        = false;
  selectedIds        = new Set();
  confirmCallback    = null;
  inputModalCallback = null;
  discardCallback    = null;
  modalDraft         = { eligibility: '', syllabus: '', info: '' };
  modalResources     = [];
  fvExamId           = null;
  fvField            = null;
  clearTimeout(fvSaveTimer);
  fvSaveTimer        = null;
  mdCurrentField     = null;
  modalOriginal      = null;
}

// ── Skeleton helper ──────────────────────────────────
function hideSkeleton() {
  const sk = document.getElementById('skeleton-loader');
  if (sk) sk.style.display = 'none';
}

// ── Auth State Listener ──────────────────────────────
onAuthStateChanged(auth, user => {
  if (examsUnsubscribe) { examsUnsubscribe(); examsUnsubscribe = null; }
  if (user) {
    currentUser = user;
    showApp();
    subscribeExams();
    updateUserUI();
  } else {
    currentUser = null;
    dataLoaded  = false;
    resetAppState();
    showAuthScreen();
  }
});

function showApp() {
  const authEl = document.getElementById('auth-screen');
  const appEl  = document.getElementById('app');

  // Pre-apply no-pinned so filter-bar top is correct before first paint
  const hasPinned = allExams.some(e => e.pinned);
  if (!hasPinned) { appEl.classList.add('no-pinned'); appEl.classList.remove('has-pinned'); }
  else             { appEl.classList.remove('no-pinned'); appEl.classList.add('has-pinned'); }

  // Guard with `fired` so the callback runs exactly once regardless of
  // whether the CSS animationend or the 270ms safety timer wins the race.
  authEl.classList.add('is-fading-out');
  let fired = false;
  const onAuthGone = () => {
    if (fired) return;
    fired = true;
    clearTimeout(timer); // no-op if animationend won; cancels timer if it fires late
    authEl.classList.remove('is-fading-out');
    authEl.style.display = 'none';
    appEl.style.display  = 'block';
    appEl.classList.add('is-fading-in');
    appEl.addEventListener('animationend', () => {
      appEl.classList.remove('is-fading-in');
    }, { once: true });
    // Show skeleton only if data hasn't arrived yet.
    // If onSnapshot already fired during the auth-fade delay,
    // dataLoaded is already true — skip the skeleton entirely.
    if (!dataLoaded) {
      const sk = document.getElementById('skeleton-loader');
      if (sk) sk.style.display = '';
    }
  };
  const timer = setTimeout(onAuthGone, 270);
  authEl.addEventListener('animationend', onAuthGone, { once: true });
}

function showAuthScreen() {
  const appEl  = document.getElementById('app');
  const authEl = document.getElementById('auth-screen');

  // Clean up any lingering animation classes and skeleton from the app
  appEl.classList.remove('is-fading-in');
  hideSkeleton();

  appEl.style.display   = 'none';
  authEl.style.display  = 'flex';
  authEl.classList.remove('is-fading-out');
  // Reset login button state
  const loginBtn = document.getElementById('login-btn-text');
  if (loginBtn) loginBtn.textContent = 'Sign In';
  const regBtn = document.getElementById('register-btn-text');
  if (regBtn) regBtn.textContent = 'Create Account';
  // Clear input fields and reset all auth button states
  ['login-email','login-password','reg-name','reg-email','reg-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Re-enable all auth buttons (in case sign-in was interrupted mid-flight)
  document.querySelectorAll('#auth-screen button').forEach(b => {
    b.disabled = false;
    b.style.opacity = '';
    b.style.pointerEvents = '';
  });
  // Reset password visibility back to hidden
  resetPasswordVisibility('login-password');
  resetPasswordVisibility('reg-password');
  // Always show Login tab on return to auth screen
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  const loginTab = document.querySelector('.auth-tab');
  if (loginTab) loginTab.classList.add('active');
  document.getElementById('login-form').style.display    = 'block';
  document.getElementById('register-form').style.display = 'none';
  // Clear any auth messages
  clearAuthMessages();

  // ── Reset #app layout classes ──────────────────────────────────────────────
  // no-pinned controls filter-bar top offset; must be set correctly before
  // #app is ever shown again. Since no exams are loaded yet, always add it.
  appEl.classList.add('no-pinned'); appEl.classList.remove('has-pinned');

  // ── Clear stale exam DOM so it never bleeds into the next login session ──
  // #app is hidden here, but we wipe it clean now so the moment it becomes
  // visible again (after the next login fade), there is zero stale content.
  const tbody = document.getElementById('exam-tbody');
  if (tbody) tbody.innerHTML = '';
  const mobileList = document.getElementById('mobile-card-list');
  if (mobileList) mobileList.innerHTML = '';
  const tableScroll = document.getElementById('table-scroll');
  if (tableScroll) tableScroll.style.display = 'none';
  const listEmpty = document.getElementById('list-empty');
  if (listEmpty) listEmpty.style.display = 'none';
  const listEmptyFiltered = document.getElementById('list-empty-filtered');
  if (listEmptyFiltered) listEmptyFiltered.style.display = 'none';
  // Restore countdown-rings to its HTML default (empty-state text) so the
  // CSS :has rule can hide the strip correctly on mobile, and desktop shows
  // no rings. Also reset the strip's own display in case it was force-hidden.
  const countdownStrip = document.getElementById('countdown-strip');
  if (countdownStrip) countdownStrip.style.display = '';
  const countdownRings = document.getElementById('countdown-rings');
  if (countdownRings) countdownRings.innerHTML = '';
  const countdownLabelEl = document.getElementById('countdown-label');
  if (countdownLabelEl) countdownLabelEl.textContent = '';
  // Reset filter-bar UI: labels, active states, search input
  const statusLabel = document.getElementById('status-dd-label');
  if (statusLabel) statusLabel.textContent = 'Status';
  const statusBtn = document.getElementById('status-dd-btn');
  if (statusBtn) statusBtn.classList.remove('has-active');
  const sortLabel = document.getElementById('sort-dd-label');
  if (sortLabel) sortLabel.textContent = 'Sort';
  const sortBtn = document.getElementById('sort-dd-btn');
  if (sortBtn) sortBtn.classList.remove('has-active');
  const tagCount = document.getElementById('tag-active-count');
  if (tagCount) tagCount.style.display = 'none';
  const tagBtn = document.querySelector('.tag-dd-btn');
  if (tagBtn) tagBtn.classList.remove('has-active');
  const tagList = document.getElementById('tag-dd-list');
  if (tagList) tagList.innerHTML = '<div class="tag-dd-empty">No tags yet</div>';
  const searchInp = document.getElementById('search-input');
  if (searchInp) searchInp.value = '';
  const clearBtn = document.getElementById('btn-clear-all');
  if (clearBtn) clearBtn.style.display = 'none';
  const batchBtn = document.getElementById('btn-delete-selected');
  if (batchBtn) batchBtn.style.display = 'none';
  const selectBtn = document.getElementById('btn-select-mode');
  if (selectBtn) selectBtn.classList.remove('active');
}

function updateStatCards() {
  document.getElementById('stat-exams').textContent   = allExams.length;
  document.getElementById('stat-applied').textContent = allExams.filter(e => e.applied).length;
  document.getElementById('stat-pinned').textContent  = allExams.filter(e => e.pinned).length;
}

function updateUserUI() {
  if (!currentUser) return;
  document.getElementById('profile-name-display').textContent = currentUser.displayName || '(no name)';
  document.getElementById('profile-email-display').textContent = currentUser.email || '';
  // Stat cards — always update so they stay live if profile modal is already open
  updateStatCards();

  // Avatar initials — derive from displayName or email
  const rawName = currentUser.displayName || currentUser.email || '?';
  const parts   = rawName.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : rawName.slice(0, 2).toUpperCase();

  // Deterministic hue from email string
  let h = 0;
  const seed = currentUser.email || rawName;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  const hue = Math.abs(h) % 360;
  const bg  = `hsl(${hue},60%,42%)`;

  const topbarEl = document.getElementById('user-avatar');
  if (topbarEl) {
    topbarEl.innerHTML = `<span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:.03em;line-height:1">${initials}</span>`;
    topbarEl.style.background = bg;
  }

  const bigEl = document.getElementById('profile-avatar-big');
  if (bigEl) {
    bigEl.innerHTML = `<span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:.02em;line-height:1">${initials}</span>`;
    bigEl.style.background = bg;
    bigEl.style.boxShadow  = `0 0 0 4px hsl(${hue},60%,42%,0.18), 0 8px 24px hsl(${hue},60%,30%,0.28)`;
  }
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
  // Clear fields on tab switch so stale input never confuses the user
  if (tab === 'login') {
    ['reg-name','reg-email','reg-password'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    // Re-show password fields (in case user had toggled show)
    resetPasswordVisibility('reg-password');
  } else {
    ['login-email','login-password'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    resetPasswordVisibility('login-password');
  }
};

// ── Password visibility toggle ────────────────────
window.togglePassword = (inputId, btn) => {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  const showIcon = btn.querySelector('.pw-eye-show');
  const hideIcon = btn.querySelector('.pw-eye-hide');
  if (showIcon) showIcon.style.display = isText ? '' : 'none';
  if (hideIcon) hideIcon.style.display = isText ? 'none' : '';
  btn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
};

function resetPasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.type === 'password') return;
  input.type = 'password';
  // Find the toggle button in the same wrap
  const wrap = input.closest('.field-input-wrap');
  if (!wrap) return;
  const btn = wrap.querySelector('.pw-toggle');
  if (!btn) return;
  const showIcon = btn.querySelector('.pw-eye-show');
  const hideIcon = btn.querySelector('.pw-eye-hide');
  if (showIcon) showIcon.style.display = '';
  if (hideIcon) hideIcon.style.display = 'none';
  btn.setAttribute('aria-label', 'Show password');
}

function clearAuthMessages() {
  const e = document.getElementById('auth-error');
  const s = document.getElementById('auth-success');
  e.style.display = 'none';
  s.style.display = 'none';
}

function showAuthError(msg) {
  if (!msg) return; // silent codes return '' from friendlyAuthError
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
  const btnEl  = document.getElementById('login-btn-text').closest('button');
  const btnTxt = document.getElementById('login-btn-text');
  btnTxt.innerHTML = '<span class="loading-spinner"></span>Signing in…';
  btnEl.disabled = true;
  clearAuthMessages();
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // On success onAuthStateChanged fires → showApp(). Button stays disabled/hidden
    // with the auth screen, so no need to re-enable it here.
  } catch (e) {
    btnTxt.textContent = 'Sign In';
    btnEl.disabled = false;
    showAuthError(friendlyAuthError(e.code));
  }
};

window.handleRegister = async () => {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!name || !email || !password) return showAuthError('Please fill in all fields.');
  if (password.length < 6) return showAuthError('Password must be at least 6 characters.');
  const btnEl  = document.getElementById('register-btn-text').closest('button');
  const btnTxt = document.getElementById('register-btn-text');
  btnTxt.innerHTML = '<span class="loading-spinner"></span>Creating…';
  btnEl.disabled = true;
  clearAuthMessages();
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Set display name — if this fails the account was still created; not fatal
    try { await updateProfile(cred.user, { displayName: name }); } catch (_) {}
    // onAuthStateChanged fires → showApp(). Button stays with auth screen.
  } catch (e) {
    btnTxt.textContent = 'Create Account';
    btnEl.disabled = false;
    showAuthError(friendlyAuthError(e.code));
  }
};

window.handleGoogleLogin = async () => {
  clearAuthMessages();
  // Use getElementById-equivalent via the auth-screen so we never grab
  // a stale reference if the button is re-rendered
  const btn = document.querySelector('#auth-screen .btn-google');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.style.pointerEvents = 'none';
  }
  try {
    await signInWithPopup(auth, gProvider);
    // On success onAuthStateChanged fires → showApp()
  } catch (e) {
    // popup-closed-by-user is not an error worth showing
    if (e.code !== 'auth/popup-closed-by-user') {
      showAuthError(friendlyAuthError(e.code));
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    }
  }
};

window.handleForgotPassword = async () => {
  const email = document.getElementById('login-email').value.trim();
  if (!email) return showAuthError('Enter your email above first.');
  const btn = document.getElementById('forgot-btn');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  clearAuthMessages();
  try {
    await sendPasswordResetEmail(auth, email);
    showAuthSuccess('Reset email sent! Check your inbox.');
  } catch (e) {
    showAuthError(friendlyAuthError(e.code));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
};

function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email':                        'Invalid email address.',
    'auth/user-not-found':                       'No account found with this email.',
    'auth/wrong-password':                       'Incorrect password.',
    'auth/email-already-in-use':                 'This email is already registered.',
    'auth/weak-password':                        'Password must be at least 6 characters.',
    'auth/too-many-requests':                    'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user':                 'Sign-in popup was closed.',
    'auth/invalid-credential':                   'Incorrect email or password.',
    'auth/network-request-failed':               'Network error. Check your connection.',
    'auth/operation-not-allowed':                'This sign-in method is not enabled.',
    'auth/account-exists-with-different-credential':
      'An account already exists with this email. Try signing in with a different method.',
    'auth/popup-blocked':                        'Popup was blocked by your browser. Please allow popups for this site.',
    'auth/cancelled-popup-request':              '',   // silent — another popup opened
    'auth/user-disabled':                        'This account has been disabled.',
    'auth/requires-recent-login':                'Please sign out and sign in again to continue.',
  };
  const msg = map[code];
  if (msg === '') return '';   // intentionally silent codes
  return msg || 'Something went wrong. Please try again.';
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
      // If the fv-panel is open for an exam that was just deleted, close it immediately.
      if (fvExamId && !allExams.some(e => e.id === fvExamId)) forceCloseFieldView();
      if (!dataLoaded) {
        dataLoaded = true;
        hideSkeleton();
      }
      updateStatCards();
      renderAll();
    },
    (e) => {
      console.error('subscribeExams error:', e);
      // Hide skeleton even on error so UI isn't stuck
      dataLoaded = true;
      hideSkeleton();
      toast('Failed to sync exams.', 'error');
    }
  );
}

window.saveExam = async () => {
  const name    = document.getElementById('f-name').value.trim();
  const conductingBody = document.getElementById('f-conducting-body').value.trim();
  if (!name) return toast('Exam name is required.', 'error');

  const id = document.getElementById('exam-id').value;
  const pinned  = document.getElementById('f-pinned').checked;

  const pinnedCount = allExams.filter(e => e.pinned && e.id !== id).length;
  if (pinned && pinnedCount >= 7) {
    toast('Max 7 exams can be pinned. Unpin one first.', 'error');
    document.getElementById('f-pinned').checked = false;
    return;
  }

  const data = {
    name,
    conductingBody,
    subtitle:    document.getElementById('f-subtitle').value.trim(),
    examType:    document.getElementById('f-exam-type').value,
    lastDate:    document.getElementById('f-last-date').value,
    examDate:    document.getElementById('f-exam-date').value,
    examDateTentative: document.getElementById('f-exam-tentative').checked,
    website:     document.getElementById('f-website').value.trim(),
    vacancies:   document.getElementById('f-vacancies').value.trim(),
    pay:         document.getElementById('f-pay').value.trim(),
    eligibility: modalDraft.eligibility,
    syllabus:    modalDraft.syllabus,
    info:        modalDraft.info,
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
      // Assign manualOrder = current max + 1 so new exams appear at the bottom
      const maxOrder = allExams.reduce((m, e) => Math.max(m, e.manualOrder ?? 0), -1);
      data.manualOrder = maxOrder + 1;
      data.createdAt = serverTimestamp();
      await addDoc(examsRef(), data);
      toast('Exam added!', 'success');
    }
    modalOriginal = null;
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
  const cb = document.querySelector(`#row-${id} .row-checkbox`);
  if (cb) cb.classList.toggle('checked', newVal);
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
    if (!exam.examDate) return toast('Add an exam date first to pin this exam.', 'info');
    const pinnedCount = allExams.filter(e => e.pinned && e.id !== id).length;
    if (pinnedCount >= 7) return toast('Max 7 pinned exams. Unpin one first.', 'error');
  }
  // Optimistic update
  exam.pinned = newVal;
  const pinBtn = document.querySelector(`#row-${id} .pin-btn`);
  if (pinBtn) pinBtn.classList.toggle('pinned', newVal);
  const mPinBtn = document.querySelector(`#mcard-${id} .m-card-pin`);
  if (mPinBtn) mPinBtn.classList.toggle('pinned', newVal);
  const row  = document.getElementById(`row-${id}`);
  if (row)  row.classList.toggle('pinned-row', newVal);
  const card = document.getElementById(`mcard-${id}`);
  if (card) card.classList.toggle('pinned-card', newVal);
  renderCountdowns();
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'exams', id), { pinned: newVal });
  } catch (e) {
    // Revert on failure
    exam.pinned = !newVal;
    if (pinBtn) pinBtn.classList.toggle('pinned', !newVal);
    if (mPinBtn) mPinBtn.classList.toggle('pinned', !newVal);
    if (row)  row.classList.toggle('pinned-row', !newVal);
    if (card) card.classList.toggle('pinned-card', !newVal);
    renderCountdowns();
    toast('Update failed.', 'error');
  }
};

// ════════════════════════════════════════════════════
//  EXAM MODAL — OPEN / CLOSE / POPULATE
// ════════════════════════════════════════════════════

function renderModalResList() {
  const list = document.getElementById('modal-res-list');
  if (!list) return;
  if (modalResources.length === 0) { list.innerHTML = ''; return; }
  list.innerHTML = modalResources.map((r, i) => `
    <div class="res-item">
      <span class="res-type-badge res-${r.type.toLowerCase()}">${r.type === 'PDF' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'}</span>
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
  ['f-name','f-conducting-body','f-subtitle','f-last-date','f-exam-date','f-website','f-tags','f-year','f-vacancies','f-pay'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-exam-type').value = 'job';
  document.getElementById('job-fields-row').style.display = '';
  document.getElementById('f-applied').checked = false;
  document.getElementById('f-pinned').checked  = false;
  modalDraft = { eligibility: '', syllabus: '', info: '' };
  modalResources = [];
  modalOriginal = {
    name: '', conductingBody: '', subtitle: '', examType: 'job',
    lastDate: '', examDate: '', examDateTentative: false, website: '', vacancies: '', pay: '',
    tags: '', year: '', applied: false, pinned: false,
    eligibility: '', syllabus: '', info: '',
    resources: '[]',
  };
  renderModalResList();
  ['eligibility','syllabus','info'].forEach(setModalDraftPreview);
  document.getElementById('exam-modal').style.display = 'flex';
  lockScroll();
};

window.openEditExam = (id) => {
  const exam = allExams.find(e => e.id === id);
  if (!exam) return;
  document.getElementById('exam-modal-title').textContent = 'Edit Exam';
  document.getElementById('exam-id').value      = id;
  document.getElementById('f-name').value       = exam.name || '';
  document.getElementById('f-conducting-body').value = exam.conductingBody || '';
  document.getElementById('f-subtitle').value   = exam.subtitle || '';
  document.getElementById('f-exam-type').value  = exam.examType || 'job';
  document.getElementById('f-last-date').value  = exam.lastDate || '';
  document.getElementById('f-exam-date').value  = exam.examDate || '';
  document.getElementById('f-exam-tentative').checked = !!exam.examDateTentative;
  document.getElementById('f-website').value    = exam.website || '';
  document.getElementById('f-vacancies').value  = exam.vacancies || '';
  document.getElementById('f-pay').value        = exam.pay || '';
  document.getElementById('f-tags').value       = (exam.tags || []).join(', ');
  document.getElementById('f-applied').checked  = !!exam.applied;
  document.getElementById('f-year').value       = exam.year || '';
  document.getElementById('f-pinned').checked   = !!exam.pinned;
  document.getElementById('job-fields-row').style.display = (exam.examType === 'entrance') ? 'none' : '';
  modalDraft = {
    eligibility: exam.eligibility || '',
    syllabus:    exam.syllabus    || '',
    info:        exam.info        || '',
  };
  modalResources = (exam.resources || []).map(r => ({ ...r }));
  modalOriginal = {
    name:        exam.name        || '',
    conductingBody: exam.conductingBody || '',
    subtitle:    exam.subtitle    || '',
    examType:    exam.examType    || 'job',
    lastDate:    exam.lastDate    || '',
    examDate:    exam.examDate    || '',
    examDateTentative: !!exam.examDateTentative,
    website:     exam.website     || '',
    vacancies:   exam.vacancies   || '',
    pay:         exam.pay         || '',
    tags:        (exam.tags || []).join(', '),
    year:        exam.year        || '',
    applied:     !!exam.applied,
    pinned:      !!exam.pinned,
    eligibility: exam.eligibility || '',
    syllabus:    exam.syllabus    || '',
    info:        exam.info        || '',
    resources:   JSON.stringify((exam.resources || []).map(r => ({ ...r }))),
  };
  renderModalResList();
  ['eligibility','syllabus','info'].forEach(setModalDraftPreview);
  document.getElementById('exam-modal').style.display = 'flex';
  lockScroll();
};

function hasExamModalChanges() {
  if (!modalOriginal) return false;
  const g = id => document.getElementById(id);
  return (
    g('f-name').value.trim()        !== modalOriginal.name        ||
    g('f-conducting-body').value.trim() !== modalOriginal.conductingBody ||
    g('f-subtitle').value.trim()    !== modalOriginal.subtitle    ||
    g('f-exam-type').value          !== modalOriginal.examType    ||
    g('f-last-date').value          !== modalOriginal.lastDate    ||
    g('f-exam-date').value          !== modalOriginal.examDate    ||
    g('f-exam-tentative').checked    !== modalOriginal.examDateTentative ||
    g('f-website').value.trim()     !== modalOriginal.website     ||
    g('f-vacancies').value.trim()   !== modalOriginal.vacancies   ||
    g('f-pay').value.trim()         !== modalOriginal.pay         ||
    g('f-tags').value.trim()        !== modalOriginal.tags.trim() ||
    g('f-year').value.trim()        !== modalOriginal.year        ||
    g('f-applied').checked          !== modalOriginal.applied     ||
    g('f-pinned').checked           !== modalOriginal.pinned      ||
    modalDraft.eligibility          !== modalOriginal.eligibility ||
    modalDraft.syllabus             !== modalOriginal.syllabus    ||
    modalDraft.info                 !== modalOriginal.info         ||
    JSON.stringify(modalResources)  !== modalOriginal.resources
  );
}

window.closeExamModal = () => {
  if (hasExamModalChanges()) {
    openDiscardModal(() => {
      modalOriginal = null;
      const overlay = document.getElementById('exam-modal');
      animateOut(overlay, () => {
        unlockScroll();
        const btn = document.getElementById('save-exam-btn');
        if (btn) { btn.textContent = 'Save Exam'; btn.disabled = false; }
      });
    });
    return;
  }
  modalOriginal = null;
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

// One controller per open popover — aborted on close or next open, preventing listener stacking.
let resPopAC = null;
let _resPopWheelAC = null;

window.toggleResPopover = (id) => {
  const pop  = document.getElementById('res-pop-' + id);
  const wrap = document.getElementById('res-wrap-' + id);
  if (!pop || !wrap) return;
  const isOpen = pop.style.display !== 'none';
  // Always abort any live listeners before changing state.
  resPopAC?.abort();
  resPopAC = null;
  _resPopWheelAC?.abort();
  _resPopWheelAC = null;
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
    // Block page scroll while popover is open
    _resPopWheelAC = new AbortController();
    document.addEventListener('wheel', (e) => {
      if (!pop.contains(e.target)) e.preventDefault();
    }, { passive: false, signal: _resPopWheelAC.signal });
    resPopAC = new AbortController();
    setTimeout(() => document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        pop.style.display = 'none';
        resPopAC?.abort();
        resPopAC = null;
        _resPopWheelAC?.abort();
        _resPopWheelAC = null;
      }
    }, { capture: true, signal: resPopAC.signal }), 0);
  }
};

window.checkPinLimit = (checkbox) => {
  const id = document.getElementById('exam-id').value;
  const pinnedCount = allExams.filter(e => e.pinned && e.id !== id).length;
  if (checkbox.checked && pinnedCount >= 7) {
    toast('Max 7 pinned exams. Unpin one first.', 'error');
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

window.toggleReorderMode = () => {
  // Only meaningful when sort is manual and on mobile
  if (activeSort !== 'manual') {
    toast('Switch to Custom Order sort to reorder.', 'error');
    return;
  }
  reorderMode = !reorderMode;
  const btn = document.getElementById('btn-reorder-mode');
  if (btn) btn.classList.toggle('active', reorderMode);
  renderTable();
};

window.toggleSelectRow = (id) => {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  const checked = selectedIds.has(id);
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

  if (activeTags.size > 0) {
    exams = exams.filter(e => (e.tags || []).some(t => activeTags.has(t)));
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    exams = exams.filter(e =>
      (e.name   || '').toLowerCase().includes(q) ||
      (e.conductingBody || '').toLowerCase().includes(q) ||
      (e.tags   || []).some(t => t.toLowerCase().includes(q))
    );
  }
  filteredExams = exams;

  // ── Sort ──────────────────────────────────────────
  if (activeSort === 'manual') {
    filteredExams.sort((a, b) => (a.manualOrder ?? Infinity) - (b.manualOrder ?? Infinity));
  } else {
    const [sortKey, sortDir] = activeSort.split('_');
    const asc = sortDir === 'asc';
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
      } else {
        // createdAt
        const at = a.createdAt?.seconds ?? 0;
        const bt = b.createdAt?.seconds ?? 0;
        return asc ? at - bt : bt - at;
      }
    });
  }

  renderTable();
}

window.setSortOrder = (val) => {
  activeSort = val;
  // Exit reorder mode if switching away from manual
  if (val !== 'manual' && reorderMode) {
    reorderMode = false;
    const rb = document.getElementById('btn-reorder-mode');
    if (rb) rb.classList.remove('active');
  }
  document.querySelectorAll('#sort-dd-list .tag-dd-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sort === val);
  });
  const sortLabels = {
    'manual':        'Custom Order',
    'createdAt_desc': 'Added ↓', 'createdAt_asc': 'Added ↑',
    'deadline_asc': 'Deadline ↑', 'deadline_desc': 'Deadline ↓',
    'name_asc': 'A-Z', 'name_desc': 'Z-A'
  };
  const labelEl = document.getElementById('sort-dd-label');
  if (labelEl) labelEl.textContent = val === 'manual' ? 'Sort' : (sortLabels[val] || 'Sort');
  // Highlight when not default
  const btn = document.getElementById('sort-dd-btn');
  if (btn) btn.classList.toggle('has-active', val !== 'manual');
  document.getElementById('sort-dd-menu').style.display = 'none';
  applyFilters();
  syncMobileSheet();
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
      hideSkeleton();
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
    hideSkeleton();
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
  attachDragListeners();
}

function tableRowHTML(exam, num) {
  const isExpanded = expandedCards.has(exam.id);

  // Apply By — 2 tiers: <=3 warn, >3 normal
  function buildApplyCell(dateStr) {
    if (!dateStr) return '<span class="deadline-normal">—</span>';
    const days = daysUntil(dateStr);
    if (days === null) return '<span class="deadline-normal">—</span>';
    if (days < 0) return `<span class="deadline-past">${formatDateShort(dateStr)}</span>`;
    const cls = days <= 3 ? 'warn' : 'normal';
    return `<span class="date-cell-inline"><span class="date-text">${formatDateShort(dateStr)}</span><span class="date-pill date-pill--${cls}">${days}d</span></span>`;
  }
  // Exam On — 3 tiers: <=45 warn, <=90 ok, >90 normal
  function buildExamCell(dateStr, tentative) {
    if (!dateStr) return '<span class="deadline-normal">—</span>';
    const days = daysUntil(dateStr);
    if (days === null) return '<span class="deadline-normal">—</span>';
    const tPfx = tentative ? '~' : '';
    if (days < 0) return `<span class="deadline-past">${tPfx}${formatDateShort(dateStr)}</span>`;
    const cls = days <= 45 ? 'warn' : days <= 90 ? 'ok' : 'normal';
    return `<span class="date-cell-inline"><span class="date-text">${tPfx}${formatDateShort(dateStr)}</span><span class="date-pill date-pill--${cls}">${days}d</span></span>`;
  }
  const applyByHTML  = buildApplyCell(exam.lastDate);
  const examDateHTML = buildExamCell(exam.examDate, exam.examDateTentative);

  let yearHTML = '<span style="color:var(--muted)">—</span>';
  if (exam.year) {
    yearHTML = escHtml(exam.year);
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
  <tr class="exam-row${num % 2 === 1 ? ' row-odd' : ' row-even'}${exam.pinned ? ' pinned-row' : ''}${isExpanded ? ' expanded' : ''}${isSelected ? ' selected-row' : ''}${activeSort === 'manual' ? ' draggable-row' : ''}" id="row-${exam.id}" data-status="${statusCls}" data-id="${exam.id}" ${activeSort === 'manual' ? 'draggable="true"' : ''}>
    <td class="td-expand-num" onclick="${selectionMode ? `toggleSelectRow('${exam.id}')` : `toggleExpand('${exam.id}')`}">
      ${selectionMode
        ? `<div class="row-select-cb${isSelected ? ' checked' : ''}"></div>`
        : `${activeSort === 'manual' ? `<span class="drag-handle" title="Drag to reorder" onclick="event.stopPropagation()">⠿</span>` : `<button class="expand-btn${isExpanded ? ' open' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg></button>`}
           <span class="row-num">${num}</span>`
      }
    </td>
    <td class="td-name" onclick="toggleExpand('${exam.id}')" style="cursor:pointer">${escHtml(exam.name)}</td>
    <td class="td-year" onclick="toggleExpand('${exam.id}')" style="cursor:pointer">${yearHTML}</td>
    <td class="td-body" onclick="toggleExpand('${exam.id}')" style="cursor:pointer" title="${escHtml(exam.conductingBody || '')}">${exam.conductingBody ? escHtml(exam.conductingBody) : '<span style="color:var(--muted)">—</span>'}</td>
    <td class="td-applyby" onclick="toggleExpand('${exam.id}')" style="cursor:pointer">${applyByHTML}</td>
    <td class="td-examdate" onclick="toggleExpand('${exam.id}')" style="cursor:pointer">${examDateHTML}</td>
    <td class="td-status" onclick="toggleExpand('${exam.id}')" style="cursor:pointer">${statusCls === 'na' ? '<span style="color:var(--muted)">—</span>' : `<span class="status-pill ${statusCls}">${statusLabel}</span>`}</td>
    <td class="td-applied">
      <div class="row-checkbox${exam.applied ? ' checked' : ''}" onclick="toggleApplied('${exam.id}')" title="Toggle applied"></div>
    </td>
    <td class="td-pin">
      <button class="pin-btn${exam.pinned ? ' pinned' : ''}${!exam.examDate ? ' pin-disabled' : ''}" onclick="togglePin('${exam.id}')" title="${exam.pinned ? 'Unpin' : !exam.examDate ? 'Add exam date to pin' : 'Pin'}"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="15" height="15"><path d="M5 3a2 2 0 0 0-2 2v16l9-4 9 4V5a2 2 0 0 0-2-2H5z"/></svg></button>
    </td>
  </tr>${detailRow}`;
}

// ════════════════════════════════════════════════════
//  DRAG-TO-REORDER  (manual sort only)
// ════════════════════════════════════════════════════

let _dragId   = null;   // id of the row being dragged
let _dragOver = null;   // id of the row currently hovered
let _dragCursorY = 0;   // current cursor Y during desktop drag
let _dragScrollRaf = null; // RAF handle for desktop auto-scroll

function _dragAutoScroll() {
  if (!_dragId) return;
  const filterBar = document.querySelector('.filter-bar');
  const topBound  = filterBar ? filterBar.getBoundingClientRect().bottom : 0;
  const botBound  = window.innerHeight;
  const distFromTop = _dragCursorY - topBound;
  const distFromBot = botBound - _dragCursorY;
  let delta = 0;
  if (distFromTop >= 0 && distFromTop < 80) {
    delta = -18 * (1 - distFromTop / 80);
  } else if (distFromBot >= 0 && distFromBot < 80) {
    delta = 18 * (1 - distFromBot / 80);
  }
  if (delta !== 0) window.scrollBy(0, delta);
  _dragScrollRaf = requestAnimationFrame(_dragAutoScroll);
}

function attachDragListeners() {
  if (activeSort !== 'manual') return;
  const tbody = document.getElementById('exam-tbody');
  if (!tbody) return;

  tbody.querySelectorAll('tr.exam-row[draggable="true"]').forEach(tr => {
    tr.addEventListener('dragstart', onDragStart);
    tr.addEventListener('dragend',   onDragEnd);
    tr.addEventListener('dragover',  onDragOver);
    tr.addEventListener('dragleave', onDragLeave);
    tr.addEventListener('drop',      onDrop);
  });
}

function onDragStart(e) {
  _dragId = this.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _dragId);
  _dragCursorY = e.clientY;
  if (_dragScrollRaf) cancelAnimationFrame(_dragScrollRaf);
  _dragScrollRaf = requestAnimationFrame(_dragAutoScroll);

  // Ghost must be wrapped in a <div> — <tr> ignores border-radius/box-shadow
  const ghostWrap = document.createElement('div');
  ghostWrap.style.cssText = `
    position: fixed;
    top: -9999px; left: -9999px;
    width: ${this.offsetWidth}px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 10px 36px rgba(0,0,0,.6), 0 2px 10px rgba(0,0,0,.4);
    border: 1.5px solid var(--accent-soft);
    pointer-events: none;
    font-family: var(--font);
    font-size: 12px;
  `;
  const ghostTable = document.createElement('table');
  ghostTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    background: var(--surface2);
  `;
  const ghostTbody = document.createElement('tbody');
  const ghostRow = this.cloneNode(true);
  ghostRow.style.background = 'transparent';
  ghostRow.querySelectorAll('td').forEach(td => {
    td.style.color = 'var(--text)';
    td.style.background = 'transparent';
  });
  const dragHandle = ghostRow.querySelector('.drag-handle');
  if (dragHandle) dragHandle.style.opacity = '0.5';
  ghostTbody.appendChild(ghostRow);
  ghostTable.appendChild(ghostTbody);
  ghostWrap.appendChild(ghostTable);
  document.body.appendChild(ghostWrap);
  e.dataTransfer.setDragImage(ghostWrap, e.offsetX, e.offsetY);
  requestAnimationFrame(() => {
    ghostWrap.remove();
    // Only NOW hide the source row — after browser has captured the drag image
    this.classList.add('drag-dragging');
  });
}

// Keep a reference to the current insertion-line div
let _dropLineEl = null;

function _showDropLine(targetRow) {
  _removeDropLine();
  if (!targetRow) return;
  const line = document.createElement('div');
  line.className = 'drag-insert-line';
  // Position it just above the target row using its bounding rect
  const rect = targetRow.getBoundingClientRect();
  const scrollEl = document.getElementById('table-scroll');
  const scrollRect = scrollEl ? scrollEl.getBoundingClientRect() : { left: 0 };
  line.style.cssText = `
    position: fixed;
    top: ${rect.top - 1}px;
    left: ${scrollRect.left}px;
    width: ${scrollEl ? scrollEl.offsetWidth : rect.width}px;
    height: 2px;
    background: var(--accent);
    border-radius: 2px;
    pointer-events: none;
    z-index: 500;
  `;
  document.body.appendChild(line);
  _dropLineEl = line;
}

function _removeDropLine() {
  if (_dropLineEl) { _dropLineEl.remove(); _dropLineEl = null; }
}

function onDragEnd() {
  _dragId = null;
  _dragOver = null;
  if (_dragScrollRaf) { cancelAnimationFrame(_dragScrollRaf); _dragScrollRaf = null; }
  _removeDropLine();
  document.querySelectorAll('.drag-dragging, .drag-over').forEach(el => {
    el.classList.remove('drag-dragging', 'drag-over');
  });
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  _dragCursorY = e.clientY;
  const id = this.dataset.id;
  if (id === _dragId) return;
  if (id !== _dragOver) {
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    _dragOver = id;
    this.classList.add('drag-over');
    _showDropLine(this);
  }
}

function onDragLeave() {
  this.classList.remove('drag-over');
  if (_dragOver === this.dataset.id) {
    _dragOver = null;
    _removeDropLine();
  }
}

async function onDrop(e) {
  e.preventDefault();
  const fromId = _dragId;
  const toId   = this.dataset.id;
  if (!fromId || !toId || fromId === toId) { onDragEnd.call(this); return; }

  // Build the current visible order from filteredExams
  const ids = filteredExams.map(ex => ex.id);
  const fromIdx = ids.indexOf(fromId);
  const toIdx   = ids.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) { onDragEnd.call(this); return; }

  ids.splice(fromIdx, 1);
  ids.splice(toIdx, 0, fromId);

  // Assign new manualOrder values only to the visible (filtered) rows;
  // exams not currently visible keep their existing manualOrder intact.
  const updates = {};
  ids.forEach((id, i) => { updates[id] = i; });

  // Optimistic update in memory
  allExams.forEach(ex => {
    if (updates[ex.id] !== undefined) ex.manualOrder = updates[ex.id];
  });
  onDragEnd.call(this);
  applyFilters(); // re-render immediately with new order

  // Persist to Firestore
  try {
    const batch = writeBatch(db);
    Object.entries(updates).forEach(([id, order]) => {
      batch.update(doc(db, 'users', currentUser.uid, 'exams', id), { manualOrder: order });
    });
    await batch.commit();
  } catch (err) {
    console.error('Reorder save failed:', err);
    toast('Reorder failed to save.', 'error');
  }
}

// ════════════════════════════════════════════════════
//  MOBILE TOUCH DRAG-TO-REORDER  (manual sort only)
//  Long-press handle → drag → drop — no HTML5 drag API
// ════════════════════════════════════════════════════

const LONG_PRESS_MS = 200;   // ms hold before drag activates

let _mDragId       = null;   // exam id being dragged
let _mDragEl       = null;   // the real .m-card element
let _mGhostEl      = null;   // floating clone following finger
let _mPlaceholder  = null;   // empty slot left in the list
let _mLongTimer    = null;
let _mDragActive   = false;
let _mStartY       = 0;
let _mOffsetY      = 0;      // finger Y relative to card top
let _mTouchY       = 0;      // last known finger clientY (for rAF loop)
let _mScrollRaf    = null;   // requestAnimationFrame handle

// Auto-scroll zone: 80px band at top (below filter bar) and bottom of viewport
const SCROLL_ZONE  = 80;
const SCROLL_MAX   = 18;     // max px scrolled per frame

function _autoScroll() {
  if (!_mDragActive) return;

  const filterBar = document.querySelector('.filter-bar');
  const topBound  = filterBar ? filterBar.getBoundingClientRect().bottom : 0;
  const botBound  = window.innerHeight;

  // Scroll up when finger is anywhere in the top zone (at or below filter bar edge)
  const distFromTop = _mTouchY - topBound;   // 0 = right at edge, positive = below
  const distFromBot = botBound - _mTouchY;   // 0 = at bottom, positive = above

  let delta = 0;
  if (distFromTop >= 0 && distFromTop < SCROLL_ZONE) {
    // Finger in top scroll zone — scroll UP, fastest at the edge (distFromTop === 0)
    delta = -SCROLL_MAX * (1 - distFromTop / SCROLL_ZONE);
  } else if (distFromBot >= 0 && distFromBot < SCROLL_ZONE) {
    // Finger in bottom scroll zone — scroll DOWN
    delta = SCROLL_MAX * (1 - distFromBot / SCROLL_ZONE);
  }

  if (delta !== 0) window.scrollBy(0, delta);

  _mScrollRaf = requestAnimationFrame(_autoScroll);
}

function attachMobileDragListeners() {
  if (!reorderMode || activeSort !== 'manual') return;
  const container = document.getElementById('mobile-card-list');
  if (!container) return;

  container.querySelectorAll('.m-card.draggable-card').forEach(card => {
    const handle = card.querySelector('.m-drag-handle');
    if (!handle) return;

    handle.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      _mStartY = touch.clientY;

      _mLongTimer = setTimeout(() => {
        _mDragActive = true;
        _mDragId     = card.dataset.id;
        _mDragEl     = card;

        // Haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(30);

        // Measure card before mutating DOM
        const rect    = card.getBoundingClientRect();
        _mOffsetY     = touch.clientY - rect.top;
        _mTouchY      = touch.clientY;

        if (_mScrollRaf) cancelAnimationFrame(_mScrollRaf);
        _mScrollRaf = requestAnimationFrame(_autoScroll);

        // Create placeholder — same height as card
        _mPlaceholder = document.createElement('div');
        _mPlaceholder.className = 'mc-placeholder';
        _mPlaceholder.style.height = rect.height + 'px';
        card.parentNode.insertBefore(_mPlaceholder, card);

        // Create ghost clone
        _mGhostEl = card.cloneNode(true);
        _mGhostEl.classList.add('mc-ghost');
        _mGhostEl.style.cssText = `
          position: fixed;
          left: ${rect.left}px;
          top:  ${rect.top}px;
          width: ${rect.width}px;
          z-index: 9999;
          pointer-events: none;
        `;
        document.body.appendChild(_mGhostEl);

        // Hide real card (keep in DOM so layout is stable via placeholder)
        card.classList.add('mc-dragging-src');

      }, LONG_PRESS_MS);
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      // Cancel long-press if finger moved before it fired
      if (!_mDragActive) {
        const dy = Math.abs(e.touches[0].clientY - _mStartY);
        if (dy > 6) { clearTimeout(_mLongTimer); _mLongTimer = null; }
        return;
      }
      e.preventDefault(); // prevent scroll while dragging

      const touch = e.touches[0];
      _mTouchY = touch.clientY;

      // Ghost follows finger — clamped only to filter bar bottom so it never covers chrome
      const filterBar = document.querySelector('.filter-bar');
      const minTop = filterBar ? filterBar.getBoundingClientRect().bottom + 4 : 0;
      const y = Math.max(minTop, touch.clientY - _mOffsetY);

      // Move ghost
      _mGhostEl.style.top = y + 'px';

      // Find which card the finger is over (by midpoint)
      const ghostMid = touch.clientY;
      const container = document.getElementById('mobile-card-list');
      const cards = [...container.querySelectorAll('.m-card.draggable-card:not(.mc-dragging-src)')];

      let insertBefore = null;
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        if (ghostMid < r.top + r.height / 2) { insertBefore = c; break; }
      }

      if (insertBefore) {
        container.insertBefore(_mPlaceholder, insertBefore);
      } else {
        container.appendChild(_mPlaceholder);
      }

      // Highlight insertBefore card edge
      cards.forEach(c => c.classList.remove('mc-drop-above'));
      if (insertBefore) insertBefore.classList.add('mc-drop-above');

    }, { passive: false });

    handle.addEventListener('touchend', async () => {
      clearTimeout(_mLongTimer);
      _mLongTimer = null;
      if (_mScrollRaf) { cancelAnimationFrame(_mScrollRaf); _mScrollRaf = null; }
      if (!_mDragActive) return;

      // Clean up visual state
      document.querySelectorAll('.mc-drop-above').forEach(c => c.classList.remove('mc-drop-above'));
      _mGhostEl && _mGhostEl.remove();
      _mDragEl  && _mDragEl.classList.remove('mc-dragging-src');

      // Determine new order from placeholder position
      const container = document.getElementById('mobile-card-list');
      const allCards  = [...container.querySelectorAll('.m-card.draggable-card, .mc-placeholder')];
      const newOrder  = allCards
        .filter(el => el.classList.contains('m-card'))
        .map(el => el.dataset.id);

      // Insert dragged id at placeholder index
      const phIdx = allCards.indexOf(_mPlaceholder);
      const realCards = allCards.filter(el => el.classList.contains('m-card'));
      const orderedIds = allCards
        .filter(el => el !== _mPlaceholder)
        .filter(el => el.classList.contains('m-card'))
        .map(el => el.dataset.id);

      // Build full ordered list with the dragged item at the placeholder slot
      const withoutDragged = orderedIds.filter(id => id !== _mDragId);
      // Count non-dragged cards before placeholder
      let insertAt = 0;
      for (let i = 0; i < phIdx; i++) {
        const el = allCards[i];
        if (el.classList.contains('m-card') && el.dataset.id !== _mDragId) insertAt++;
      }
      withoutDragged.splice(insertAt, 0, _mDragId);
      const finalIds = withoutDragged;

      _mPlaceholder && _mPlaceholder.remove();
      _mGhostEl      = null;
      _mPlaceholder  = null;
      _mDragEl       = null;
      const fromId   = _mDragId;
      _mDragId       = null;
      _mDragActive   = false;

      if (!fromId) return;

      const updates = {};
      finalIds.forEach((id, i) => { updates[id] = i; });

      // Optimistic update + re-render
      allExams.forEach(ex => {
        if (updates[ex.id] !== undefined) ex.manualOrder = updates[ex.id];
      });
      applyFilters();

      // Persist
      try {
        const batch = writeBatch(db);
        Object.entries(updates).forEach(([id, order]) => {
          batch.update(doc(db, 'users', currentUser.uid, 'exams', id), { manualOrder: order });
        });
        await batch.commit();
      } catch (err) {
        console.error('Mobile reorder save failed:', err);
        toast('Reorder failed to save.', 'error');
      }
    });

    handle.addEventListener('touchcancel', () => {
      clearTimeout(_mLongTimer);
      _mLongTimer = null;
      if (_mScrollRaf) { cancelAnimationFrame(_mScrollRaf); _mScrollRaf = null; }
      if (!_mDragActive) return;
      document.querySelectorAll('.mc-drop-above').forEach(c => c.classList.remove('mc-drop-above'));
      _mGhostEl     && _mGhostEl.remove();
      _mPlaceholder && _mPlaceholder.remove();
      _mDragEl      && _mDragEl.classList.remove('mc-dragging-src');
      _mGhostEl = _mPlaceholder = _mDragEl = _mDragId = null;
      _mDragActive = false;
      applyFilters();
    });
  });
}

window.toggleExpand = (id) => {  const isNowExpanded = !expandedCards.has(id);

  // ── Accordion: collapse any other open row first ──
  if (isNowExpanded) {
    expandedCards.forEach(openId => {
      if (openId === id) return;
      expandedCards.delete(openId);
      const openRow = document.getElementById('row-' + openId);
      if (openRow) {
        openRow.classList.remove('expanded');
        const openBtn = openRow.querySelector('.expand-btn');
        if (openBtn) openBtn.classList.remove('open');
        const openDetail = openRow.nextElementSibling;
        if (openDetail && openDetail.classList.contains('detail-row')) openDetail.remove();
      }
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

  // Apply by urgency — 2 tiers: <=3 warn, else none
  let applyUrgencyCls = '';
  if (exam.lastDate) {
    const d = daysUntil(exam.lastDate);
    if (d < 0)       applyUrgencyCls = 'meta-past';
    else if (d <= 3) applyUrgencyCls = 'meta-warn';
  }
  // Exam urgency — 3 tiers: <=45 warn, <=90 ok, >90 none
  let examUrgencyCls = '';
  if (exam.examDate) {
    const d = daysUntil(exam.examDate);
    if (d < 0)        examUrgencyCls = 'meta-past';
    else if (d <= 45) examUrgencyCls = 'meta-warn';
    else if (d <= 90) examUrgencyCls = 'meta-ok';
  }

  return `
  <tr class="detail-row">
    <td colspan="9" class="detail-row-td">
      <div class="exp-panel">

        <!-- BLOCK 1: Info -->
        <div class="exp-info">
          ${exam.subtitle ? `<div class="exp-subtitle">${escHtml(exam.subtitle)}</div>` : ''}

          <div class="exp-meta-row">
            ${exam.lastDate ? `<div class="exp-meta-item ${applyUrgencyCls}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span class="exp-meta-label">Apply by</span>
              <span class="exp-meta-val">${formatDate(exam.lastDate)}</span>
            </div>` : ''}
            ${exam.examDate ? `<div class="exp-meta-item ${examUrgencyCls}${exam.examDateTentative ? ' meta-tentative' : ''}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span class="exp-meta-label">Exam${exam.examDateTentative ? ' ~' : ''}</span>
              <span class="exp-meta-val">${exam.examDateTentative ? '~' : ''}${formatDate(exam.examDate)}</span>
            </div>` : ''}
            ${exam.website ? `<a href="${escHtml(exam.website.startsWith('http') ? exam.website : 'https://'+exam.website)}" target="_blank" rel="noopener" class="exp-website-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
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
          <button class="exp-field-btn${exam.info ? '' : ' empty'}" onclick="openFieldView('${exam.id}','info')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8" stroke-linecap="round" stroke-width="2.5"/><line x1="12" y1="12" x2="12" y2="16"/></svg>
            Info${exam.info ? '' : ' <span class="fbtn-empty">empty</span>'}
          </button>
          <button class="exp-field-btn${exam.eligibility ? '' : ' empty'}" onclick="openFieldView('${exam.id}','eligibility')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/></svg>
            Eligibility${exam.eligibility ? '' : ' <span class="fbtn-empty">empty</span>'}
          </button>
          <button class="exp-field-btn${exam.syllabus ? '' : ' empty'}" onclick="openFieldView('${exam.id}','syllabus')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            Syllabus${exam.syllabus ? '' : ' <span class="fbtn-empty">empty</span>'}
          </button>
          ${resItems.length > 0 ? `<div class="res-popover-wrap" id="res-wrap-${exam.id}">
            <button class="exp-field-btn exp-field-res" onclick="toggleResPopover('${exam.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              Resources <span class="res-count">${resItems.length}</span>
            </button>
            <div class="res-popover" id="res-pop-${exam.id}" style="display:none">
              <div class="res-pop-header">Resources</div>
              <div class="res-pop-list">
                ${resItems.map(r => { const rDomain = (() => { try { return new URL(r.url.startsWith('http') ? r.url : 'https://'+r.url).hostname; } catch(e) { return ''; } })(); return `<a href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer" class="res-pop-item">
                  <div class="res-pop-icon-wrap">
                    ${r.type === 'PDF'
                      ? `<svg class="res-pop-icon res-pop-icon-pdf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/><line x1="9" y1="9" x2="10" y2="9"/></svg>`
                      : rDomain ? `<img class="res-pop-icon res-pop-icon-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(rDomain)}&sz=32" width="16" height="16" alt="" onerror="this.style.display='none'">`
                      : `<svg class="res-pop-icon res-pop-icon-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`}
                  </div>
                  <span class="res-pop-title">${escHtml(r.label || r.title || '')}</span>
                  <svg class="res-pop-ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>`; }).join('')}
              </div>
            </div>
          </div>` : ''}
        </div>

        <!-- BLOCK 3: Tags + Edit · Delete -->
        <div class="exp-bar">
          <div class="exp-tags-row">
            <span class="exp-tags-label">Tags:</span>
            ${tags.map(t => `<span class="exp-tag" onclick="toggleTagFilter(${escHtml(JSON.stringify(t))})">${escHtml(t)}</span>`).join('')}
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
  syncMobileSheet();
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
    <div class="tag-dd-item${activeTags.has(tag) ? ' active' : ''}" onclick="toggleTagFilter(${escHtml(JSON.stringify(tag))})">
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
  document.getElementById('status-dd-menu').style.display = 'none';
  document.getElementById('sort-dd-menu').style.display = 'none';
  menu.style.display = open ? 'block' : 'none';
  if (open) {
    setTimeout(() => document.addEventListener('click', e => closeDdOutside(e, 'tag-dd-wrap', 'tag-dd-menu'), { once: true }), 10);
  }
};

// Generic outside-click closer for all dropdowns.
// wrapId: the toggle-button wrapper; menuId: the menu panel.
function closeDdOutside(e, wrapId, menuId) {
  const wrap = document.getElementById(wrapId);
  const menu = document.getElementById(menuId);
  if (!wrap || !menu) return;
  if (!wrap.contains(e.target)) {
    menu.style.display = 'none';
  } else {
    setTimeout(() => document.addEventListener('click', ev => closeDdOutside(ev, wrapId, menuId), { once: true }), 10);
  }
}


window.setStatusFilter = (status) => {
  activeStatus = status;
  document.querySelectorAll('#status-dd-list .tag-dd-item').forEach(el => {
    el.classList.toggle('active', el.dataset.status === status);
  });
  const labels = { all: 'Status', open: 'Open', closed: 'Closed', applied: 'Applied' };
  const labelEl = document.getElementById('status-dd-label');
  if (labelEl) labelEl.textContent = labels[status] || 'Status';
  // Highlight button when not default
  const btn = document.getElementById('status-dd-btn');
  if (btn) btn.classList.toggle('has-active', status !== 'all');
  document.getElementById('status-dd-menu').style.display = 'none';
  updateClearAll();
  applyFilters();
  syncMobileSheet();
};

window.toggleStatusDropdown = () => {
  const menu = document.getElementById('status-dd-menu');
  const open = menu.style.display === 'none' || !menu.style.display;
  document.getElementById('sort-dd-menu').style.display = 'none';
  document.getElementById('tag-dd-menu').style.display = 'none';
  menu.style.display = open ? 'block' : 'none';
  if (open) {
    setTimeout(() => document.addEventListener('click', e => closeDdOutside(e, 'status-dd-wrap', 'status-dd-menu'), { once: true }), 10);
  }
};



window.toggleSortDropdown = () => {
  const menu = document.getElementById('sort-dd-menu');
  const open = menu.style.display === 'none' || !menu.style.display;
  document.getElementById('status-dd-menu').style.display = 'none';
  document.getElementById('tag-dd-menu').style.display = 'none';
  menu.style.display = open ? 'block' : 'none';
  if (open) {
    setTimeout(() => document.addEventListener('click', e => closeDdOutside(e, 'sort-dd-wrap', 'sort-dd-menu'), { once: true }), 10);
  }
};



function updateClearAll() {
  const btn = document.getElementById('btn-clear-all');
  if (!btn) return;
  const active = activeStatus !== 'all' || activeTags.size > 0 || searchQuery !== '';
  btn.style.display = active ? '' : 'none';
  // Mobile: update filter pill badge
  const filterCount = (activeStatus !== 'all' ? 1 : 0) + activeTags.size;
  const badge = document.getElementById('mobile-filter-badge');
  if (badge) {
    badge.textContent   = filterCount;
    badge.style.display = filterCount > 0 ? '' : 'none';
  }
  const mfsPill = document.getElementById('mobile-filter-btn');
  if (mfsPill) mfsPill.classList.toggle('has-active', filterCount > 0);
  // Mobile: sheet clear-all button
  const mfsClear = document.getElementById('mfs-clear-btn');
  if (mfsClear) mfsClear.style.display = active ? '' : 'none';
}

window.clearAllFilters = () => {
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
  // Reset tag search in mobile sheet
  const mfsTagInput = document.getElementById('mfs-tag-search');
  if (mfsTagInput) { mfsTagInput.value = ''; filterMfsTags(''); }
  // Reset search
  searchQuery = '';
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  updateClearAll();
  applyFilters();
};

// ── Mobile filter bottom sheet ─────────────────────
window.openMobileFilterSheet = () => {
  const sheet = document.getElementById('mobile-filter-sheet');
  if (!sheet) return;
  document.querySelectorAll('#mfs-status-chips .mfs-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.status === activeStatus);
  });
  document.querySelectorAll('#mfs-sort-chips .mfs-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.sort === activeSort);
  });
  // Render tag chips dynamically (tags can change)
  const tagContainer = document.getElementById('mfs-tag-chips');
  const allTags = [...new Set(allExams.flatMap(e => e.tags || []))].sort();
  // Reset tag search on open
  const tagSearchInput = document.getElementById('mfs-tag-search');
  const tagSearchClear = document.getElementById('mfs-tag-search-clear');
  if (tagSearchInput) tagSearchInput.value = '';
  if (tagSearchClear) tagSearchClear.style.display = 'none';
  if (allTags.length === 0) {
    tagContainer.innerHTML = '<span class="mfs-no-tags">No tags yet</span>';
  } else {
    tagContainer.innerHTML = allTags.map(tag =>
      `<button class="mfs-chip${activeTags.has(tag) ? ' active' : ''}"
               onclick="toggleTagFilter(${escHtml(JSON.stringify(tag))})">${escHtml(tag)}</button>`
    ).join('');
  }
  const active = activeStatus !== 'all' || activeTags.size > 0;
  const mfsClear = document.getElementById('mfs-clear-btn');
  if (mfsClear) mfsClear.style.display = active ? '' : 'none';
  sheet.style.display = 'flex';
  lockScroll();
};

window.closeMobileFilterSheet = () => {
  const sheet = document.getElementById('mobile-filter-sheet');
  if (!sheet) return;
  sheet.style.display = 'none';
  unlockScroll();
};

window.filterMfsTags = (query) => {
  const q = query.trim().toLowerCase();
  const clearBtn = document.getElementById('mfs-tag-search-clear');
  if (clearBtn) clearBtn.style.display = q ? '' : 'none';
  const chips = document.querySelectorAll('#mfs-tag-chips .mfs-chip');
  let visibleCount = 0;
  chips.forEach(chip => {
    const match = !q || chip.textContent.toLowerCase().includes(q);
    chip.style.display = match ? '' : 'none';
    if (match) visibleCount++;
  });
  // Show/hide empty state
  let noMatch = document.getElementById('mfs-tag-no-match');
  if (visibleCount === 0 && q) {
    if (!noMatch) {
      noMatch = document.createElement('span');
      noMatch.id = 'mfs-tag-no-match';
      noMatch.className = 'mfs-no-tags';
      noMatch.textContent = 'No matching tags';
      document.getElementById('mfs-tag-chips').appendChild(noMatch);
    }
    noMatch.style.display = '';
  } else if (noMatch) {
    noMatch.style.display = 'none';
  }
};

window.clearMfsTagSearch = () => {
  const input = document.getElementById('mfs-tag-search');
  if (input) { input.value = ''; input.focus(); }
  filterMfsTags('');
};

// Keep sheet chips in sync while it is open (called after each filter change)
function syncMobileSheet() {
  const sheet = document.getElementById('mobile-filter-sheet');
  if (!sheet || sheet.style.display === 'none') return;
  document.querySelectorAll('#mfs-status-chips .mfs-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.status === activeStatus);
  });
  document.querySelectorAll('#mfs-sort-chips .mfs-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.sort === activeSort);
  });
  document.querySelectorAll('#mfs-tag-chips .mfs-chip').forEach(el => {
    // tag text is the button's own textContent
    el.classList.toggle('active', activeTags.has(el.textContent));
  });
  const active = activeStatus !== 'all' || activeTags.size > 0;
  const mfsClear = document.getElementById('mfs-clear-btn');
  if (mfsClear) mfsClear.style.display = active ? '' : 'none';
}

// ── Countdown rings ───────────────────────────────
function renderCountdowns() {
  const pinned  = allExams.filter(e => e.pinned);
  const strip   = document.getElementById('countdown-rings');
  const appEl   = document.getElementById('app');
  const labelEl = document.getElementById('countdown-label');
  const CIRCUMF = 2 * Math.PI * 28;  // r=28

  if (pinned.length === 0) {
    strip.innerHTML = '';
    if (labelEl) labelEl.textContent = '';
    if (appEl) { appEl.classList.add('no-pinned'); appEl.classList.remove('has-pinned'); }
    return;
  }
  if (labelEl) labelEl.textContent = `${pinned.length} / 7`;
  if (appEl) { appEl.classList.remove('no-pinned'); appEl.classList.add('has-pinned'); }

  strip.innerHTML = pinned.map(exam => {
    const days   = Math.max(0, daysUntil(exam.examDate));
    // Linear scale capped at 180d: every day = 0.56% of arc
    // 45d = 25% fill (red), 90d = 50% (amber), 180d+ = 100% (full/safe)
    const pct    = Math.min(1, days / 180);
    const offset = CIRCUMF * (1 - pct);
    const color  = days <= 45 ? 'var(--ring-warn)' : days <= 90 ? 'var(--ring-ok)' : 'var(--ring-normal)';
    const label  = days > 999 ? '999+' : String(days);

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
        <div class="ring-name${exam.examDateTentative ? ' ring-name--tentative' : ''}">${escHtml(exam.name)}</div>
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
  // Detach Firestore listener immediately — no more onSnapshot events
  if (examsUnsubscribe) { examsUnsubscribe(); examsUnsubscribe = null; }

  // Close every open overlay/modal/dropdown immediately (no animation — we're leaving)
  ['profile-modal','exam-modal','confirm-modal','input-modal',
   'md-panel','md-overlay','fv-panel','fv-overlay',
   'status-dd-menu','tag-dd-menu','sort-dd-menu','data-dd-menu',
   'pick-modal'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Ensure scroll lock is released (lockScroll uses 'modal-open')
  document.body.classList.remove('modal-open');

  // Hide skeleton immediately — onAuthStateChanged → showAuthScreen will
  // do the full DOM reset; we just need to make sure the skeleton isn't
  // sitting visible during the async sign-out gap.
  hideSkeleton();

  // Clear JS state now so if anything async peeks at it, it sees empty
  resetAppState();
  dataLoaded = false;

  try {
    await signOut(auth);
  } catch (e) {
    console.error('Sign out error:', e);
    // Even on error, force the auth screen — user's session is likely gone
    showAuthScreen();
  }
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
          const result = await signInWithPopup(auth, gProvider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          await reauthenticateWithCredential(currentUser, credential);
        } else {
          const password = document.getElementById('confirm-password-input').value;
          if (!password) return toast('Enter your password to confirm.', 'error');
          const credential = EmailAuthProvider.credential(currentUser.email, password);
          await reauthenticateWithCredential(currentUser, credential);
        }

        // Detach Firestore listener before deleting data so onSnapshot can't fire
        if (examsUnsubscribe) { examsUnsubscribe(); examsUnsubscribe = null; }

        const snap = await getDocs(examsRef());
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        // Close all open UI (no animation — account is being destroyed)
        ['profile-modal','exam-modal','confirm-modal','input-modal',
         'md-panel','md-overlay','fv-panel','fv-overlay',
         'status-dd-menu','tag-dd-menu','sort-dd-menu','data-dd-menu',
         'pick-modal'
        ].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        // Ensure scroll lock is released (lockScroll uses 'modal-open')
        document.body.classList.remove('modal-open');
        hideSkeleton();

        resetAppState();
        dataLoaded = false;

        await deleteUser(currentUser);

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
  if (!allExams.length) return toast('No exams to export.', 'error');
  openPickModal({
    title: 'Select Exams to Export',
    items: allExams.map((e, i) => ({ id: i, label: e.name || '(Untitled)', sub: e.conductingBody || '' })),
    confirmLabel: 'Export',
    onConfirm: (selectedIds) => {
      const data = selectedIds.map(i => {
        const e = allExams[i];
        return {
          name:        e.name        || '',
          conductingBody: e.conductingBody || '',
          subtitle:    e.subtitle    || '',
          examType:    e.examType    || 'job',
          lastDate:    e.lastDate    || '',
          examDate:    e.examDate    || '',
          examDateTentative: !!e.examDateTentative,
          website:     e.website     || '',
          vacancies:   e.vacancies   || '',
          pay:         e.pay         || '',
          eligibility: e.eligibility || '',
          info:        e.info        || '',
          syllabus:    e.syllabus    || '',
          tags:        Array.isArray(e.tags) ? e.tags : [],
          year:        e.year        || '',
          resources:   Array.isArray(e.resources) ? e.resources : [],
        };
      });
      downloadFile(JSON.stringify(data, null, 2), 'exams.json', 'application/json');
      toast(`Exported ${data.length} exam${data.length !== 1 ? 's' : ''}!`, 'success');
    }
  });
};

window.toggleDataDropdown = () => {
  const menu = document.getElementById('data-dd-menu');
  const open = menu.style.display === 'none' || !menu.style.display;
  document.getElementById('status-dd-menu').style.display = 'none';
  document.getElementById('tag-dd-menu').style.display    = 'none';
  document.getElementById('sort-dd-menu').style.display   = 'none';
  menu.style.display = open ? 'block' : 'none';
  if (open) {
    setTimeout(() => document.addEventListener('click', e => closeDdOutside(e, 'data-dd-wrap', 'data-dd-menu'), { once: true }), 10);
  }
};



window.importJSON = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return toast('Invalid JSON format.', 'error');

    // Build cleaned list from file
    const parsed = data
      .filter(exam => exam.name)
      .map((exam, i) => ({
        name:         String(exam.name      || ''),
        conductingBody: String(exam.conductingBody || ''),
        subtitle:     String(exam.subtitle  || ''),
        examType:     exam.examType === 'entrance' ? 'entrance' : 'job',
        lastDate:     exam.lastDate         || '',
        examDate:     exam.examDate         || '',
        examDateTentative: !!exam.examDateTentative,
        website:      exam.website          || '',
        vacancies:    String(exam.vacancies || ''),
        pay:          String(exam.pay       || ''),
        eligibility:  exam.eligibility      || '',
        info:         exam.info             || '',
        syllabus:     exam.syllabus         || '',
        tags:         Array.isArray(exam.tags) ? exam.tags.map(String) : [],
        year:         String(exam.year      || ''),
        applied:      false,
        pinned:       false,
        manualOrder:  i,
        resources:    Array.isArray(exam.resources)
                        ? exam.resources
                            .filter(r => r.type && r.label && r.url)
                            .map(r => ({ type: String(r.type), label: String(r.label), url: String(r.url) }))
                        : [],
        createdAt:    serverTimestamp(),
      }));

    if (parsed.length === 0) return toast('No valid exams found in file.', 'error');

    openPickModal({
      title: 'Select Exams to Import',
      items: parsed.map((e, i) => ({ id: i, label: e.name, sub: e.conductingBody || '' })),
      confirmLabel: 'Import',
      onConfirm: async (selectedIds) => {
        const toImport = selectedIds.map(i => parsed[i]);
        const CHUNK = 500; // Firestore's max writes per batch
        for (let i = 0; i < toImport.length; i += CHUNK) {
          const batch = writeBatch(db);
          toImport.slice(i, i + CHUNK).forEach(clean => {
            batch.set(doc(collection(db, 'users', currentUser.uid, 'exams')), clean);
          });
          await batch.commit();
        }
        toast(`Imported ${toImport.length} exam${toImport.length !== 1 ? 's' : ''}!`, 'success');
      }
    });
  } catch (e) {
    toast('Import failed. Check JSON format.', 'error');
  }
  event.target.value = '';
};

// ════════════════════════════════════════════════════
//  PICK MODAL — selective export / import
// ════════════════════════════════════════════════════

let _pickCallback = null;

function openPickModal({ title, items, confirmLabel, onConfirm }) {
  _pickCallback = onConfirm;
  document.getElementById('pick-modal-title').textContent   = title;
  document.getElementById('pick-confirm-btn').textContent   = confirmLabel;

  const list = document.getElementById('pick-list');
  list.innerHTML = items.map(item => `
    <label class="pick-item">
      <input type="checkbox" class="pick-cb" data-id="${item.id}" checked>
      <span class="pick-item-info">
        <span class="pick-item-label">${item.label}</span>
        ${item.sub ? `<span class="pick-item-sub">${item.sub}</span>` : ''}
      </span>
    </label>
  `).join('');

  updatePickCount();

  document.getElementById('pick-modal').style.display = 'flex';
  lockScroll();
}

function updatePickCount() {
  const total    = document.querySelectorAll('.pick-cb').length;
  const selected = document.querySelectorAll('.pick-cb:checked').length;
  document.getElementById('pick-count').textContent = `${selected} of ${total} selected`;
  document.getElementById('pick-confirm-btn').disabled = selected === 0;
}

window.pickSelectAll = () => {
  document.querySelectorAll('.pick-cb').forEach(cb => cb.checked = true);
  updatePickCount();
};
window.pickSelectNone = () => {
  document.querySelectorAll('.pick-cb').forEach(cb => cb.checked = false);
  updatePickCount();
};

window.closePickModal = () => {
  document.getElementById('pick-modal').style.display = 'none';
  _pickCallback = null;
  unlockScroll();
};

window.closePickModalOnOverlay = (e) => {
  if (e.target === document.getElementById('pick-modal')) closePickModal();
};

window.confirmPick = () => {
  const selectedIds = [...document.querySelectorAll('.pick-cb:checked')]
    .map(cb => Number(cb.dataset.id));
  if (!selectedIds.length) return;
  const cb = _pickCallback;   // save before closePickModal nulls it
  closePickModal();
  if (cb) cb(selectedIds);
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
function openDiscardModal(onDiscard) {
  discardCallback = onDiscard;
  document.getElementById('discard-modal').style.display = 'flex';
  // no lockScroll — a panel is already locking scroll underneath
}

document.getElementById('pick-list').addEventListener('change', updatePickCount);

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
    document.getElementById('exam-modal')?.style.display        === 'flex' ||
    document.getElementById('profile-modal')?.style.display     === 'flex' ||
    document.getElementById('confirm-modal')?.style.display     === 'flex' ||
    document.getElementById('input-modal')?.style.display       === 'flex' ||
    document.getElementById('pick-modal')?.style.display        === 'flex' ||
    document.getElementById('md-panel')?.style.display          === 'flex' ||
    document.getElementById('fv-panel')?.style.display          === 'flex' ||
    document.getElementById('mobile-filter-sheet')?.style.display === 'flex';
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
//  EDITOR KEYBOARD SHORTCUTS
//  Ctrl+B  bold  |  Ctrl+I  italic  |  Ctrl+U  underline
//  Ctrl+K  link  |  Ctrl+Shift+C  code block
//  Tab     insert 2 spaces (prevent focus escape)
// ════════════════════════════════════════════════════

const EDITOR_IDS = ['md-editor-textarea', 'fv-editor-textarea'];

function isEditorActive() {
  return EDITOR_IDS.includes(document.activeElement?.id);
}

document.addEventListener('keydown', (e) => {
  if (!isEditorActive()) return;
  const ctrl = e.ctrlKey || e.metaKey;

  // Tab → 2 spaces, never escape textarea
  if (e.key === 'Tab') {
    e.preventDefault();
    const { ta, preview } = getActiveEditor();
    const s = ta.selectionStart, end = ta.selectionEnd;
    ta.value = ta.value.substring(0, end) + '  ' + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = end + 2;
    preview();
    return;
  }

  if (!ctrl) return;

  if (e.key === 'b' || e.key === 'B') {
    e.preventDefault();
    mdInsert('**', '**');
    return;
  }
  if (e.key === 'i' || e.key === 'I') {
    e.preventDefault();
    mdInsert('*', '*');
    return;
  }
  if (e.key === 'u' || e.key === 'U') {
    e.preventDefault();
    mdInsert('__', '__');
    return;
  }
  if (e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    mdInsertLink();
    return;
  }
  if ((e.key === 'c' || e.key === 'C') && e.shiftKey) {
    e.preventDefault();
    mdInsertCodeBlock();
    return;
  }
});

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
  let fired = false;
  const onEnd = () => {
    if (fired) return;
    fired = true;
    el.classList.remove('is-closing');
    el.style.display = 'none';
    if (cb) cb();
  };
  // Use animationend; fall back after 250ms in case animation is absent
  const timer = setTimeout(onEnd, 250);
  el.addEventListener('animationend', () => { clearTimeout(timer); onEnd(); }, { once: true });
}

// ════════════════════════════════════════════════════
//  EDITOR PANEL TAB SWITCHER
//  panel: 'md' | 'fv'
//  tab:   'write' | 'preview'
// ════════════════════════════════════════════════════

window.epSwitchTab = (panel, tab) => {
  if (panel === 'md') {
    const isWrite = tab === 'write';
    document.getElementById('md-write-body').style.display   = isWrite ? 'flex' : 'none';
    document.getElementById('md-preview-body').style.display = isWrite ? 'none' : 'flex';
    document.getElementById('md-tab-write').classList.toggle('ep-tab--active', isWrite);
    document.getElementById('md-tab-preview').classList.toggle('ep-tab--active', !isWrite);
    const strip = document.getElementById('md-toolbar-strip');
    if (strip) strip.style.display = isWrite ? '' : 'none';
    if (!isWrite) mdPreview(); // refresh preview when switching to it
  } else {
    const isWrite = tab === 'write';
    document.getElementById('fv-write-body').style.display   = isWrite ? 'flex' : 'none';
    document.getElementById('fv-preview-body').style.display = isWrite ? 'none' : 'flex';
    document.getElementById('fv-tab-write').classList.toggle('ep-tab--active', isWrite);
    document.getElementById('fv-tab-preview').classList.toggle('ep-tab--active', !isWrite);
    const strip = document.getElementById('fv-toolbar-strip');
    if (strip) strip.style.display = isWrite ? '' : 'none';
    if (!isWrite) fvLivePreview();
  }
};

// ════════════════════════════════════════════════════
//  MARKDOWN PANEL — used only from Add/Edit exam modal
// ════════════════════════════════════════════════════

const fieldLabels = {
  eligibility: 'Eligibility',
  syllabus:    'Syllabus',
  info:        'Info',
};

window.openMdFromModal = (field) => {
  mdCurrentField = field;
  const examName = document.getElementById('f-name')?.value.trim() || 'New Exam';
  document.getElementById('md-panel-title').textContent = fieldLabels[field];
  const subEl = document.getElementById('md-panel-sub');
  if (subEl) subEl.textContent = examName;
  const ta = document.getElementById('md-editor-textarea');
  ta.value = modalDraft[field] || '';
  mdPreview();
  document.getElementById('md-save-status').textContent = '';
  const statusFooter = document.getElementById('md-save-status-footer');
  if (statusFooter) statusFooter.textContent = '';
  // Reset to write tab
  epSwitchTab('md', 'write');
  // Hide the exam modal — editor takes over full screen
  const examModal = document.getElementById('exam-modal');
  if (examModal) examModal.dataset.mdHidden = '1';
  if (examModal) examModal.style.visibility = 'hidden';
  document.getElementById('md-panel').style.display = 'flex';
  lockScroll();
  ta.focus();
};

// Restores the exam modal after md-panel closes
function _restoreExamModal() {
  const examModal = document.getElementById('exam-modal');
  if (examModal && examModal.dataset.mdHidden === '1') {
    examModal.style.visibility = '';
    delete examModal.dataset.mdHidden;
  }
}

window.closeMdPanel = () => {
  // Warn if user has unsaved changes (textarea differs from what's in modalDraft)
  if (mdCurrentField) {
    const current = document.getElementById('md-editor-textarea').value;
    const saved   = modalDraft[mdCurrentField] || '';
    if (current !== saved) {
      openDiscardModal(() => {
        animateOut(document.getElementById('md-panel'), () => {
          mdCurrentField = null;
          _restoreExamModal();
          unlockScroll();
        });
      });
      return;
    }
  }
  animateOut(document.getElementById('md-panel'), () => {
    mdCurrentField = null;
    _restoreExamModal();
    unlockScroll();
  });
};

// Overlay-click close — identical unsaved-changes check as closeMdPanel.
// NOTE: ep-overlay fills the full viewport so there is no exposed backdrop;
// this function is kept as a safety alias so any future caller gets the
// correct discard-prompt behaviour instead of a silent auto-save.
window.closeMdPanelFromOverlay = () => {
  closeMdPanel();
};

window.saveMdPanel = () => {
  if (!mdCurrentField) return;
  const value = document.getElementById('md-editor-textarea').value;
  modalDraft[mdCurrentField] = value;
  setModalDraftPreview(mdCurrentField);
  document.getElementById('md-save-status').textContent = '✓ Saved';
  setTimeout(() => {
    animateOut(document.getElementById('md-panel'), () => {
      mdCurrentField = null;
      _restoreExamModal();
      unlockScroll();
    });
  }, 400);
};

// ════════════════════════════════════════════════════
//  FIELD VIEW PANEL (view → edit → save)
// ════════════════════════════════════════════════════

window.openFieldView = (examId, field) => {
  const exam = allExams.find(e => e.id === examId);
  if (!exam) return;
  fvExamId = examId;
  fvField  = field;

  document.getElementById('fv-title').textContent      = fieldLabels[field];
  document.getElementById('fv-sub').textContent        = exam.name;
  document.getElementById('fv-edit-title').textContent = fieldLabels[field];
  const examNameEl = document.getElementById('fv-edit-examname');
  if (examNameEl) examNameEl.textContent = exam.name;

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

  document.getElementById('fv-panel').style.display = 'flex';
  lockScroll();

  // Build TOC after render
  requestAnimationFrame(() => buildFvToc());
};

// ── TOC ──────────────────────────────────────────────
let _fvTocScrollSpy = null;

function buildFvToc() {
  const content   = document.getElementById('fv-content');
  const sidebar   = document.getElementById('fv-toc-sidebar');
  const tocBtn    = document.getElementById('fv-toc-btn');
  const sheetList = document.getElementById('fv-toc-sheet-list');
  if (!content || !sidebar) return;

  // Collect headings
  const headings = Array.from(content.querySelectorAll('h1,h2,h3,h4'));

  // Hide everything if fewer than 2 headings
  if (headings.length < 2) {
    sidebar.style.display = 'none';
    if (tocBtn) tocBtn.style.display = 'none';
    return;
  }

  // Build items array
  const items = headings.map(h => ({
    el:    h,
    id:    h.id,
    text:  h.textContent,
    level: parseInt(h.tagName[1])
  }));

  // ── Desktop sidebar ──────────────────────────
  const list = document.createElement('ul');
  list.className = 'fv-toc-list';
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className   = 'fv-toc-item';
    btn.dataset.level = item.level;
    btn.dataset.id    = item.id;
    btn.textContent   = item.text;
    btn.title         = item.text;
    btn.onclick = () => fvTocScrollTo(item.id);
    list.appendChild(btn);
  });

  sidebar.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'fv-toc-label';
  label.textContent = 'On this page';
  sidebar.appendChild(label);
  sidebar.appendChild(list);
  sidebar.style.display = 'block';

  // ── Mobile sheet list ────────────────────────
  if (sheetList) {
    sheetList.innerHTML = '';
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className     = 'fv-toc-sheet-item';
      btn.dataset.level = item.level;
      btn.textContent   = item.text;
      btn.title         = item.text;
      btn.onclick = () => { closeFvTocSheet(); setTimeout(() => fvTocScrollTo(item.id), 180); };
      sheetList.appendChild(btn);
    });
  }

  // Show mobile TOC button
  if (tocBtn) tocBtn.style.display = 'flex';

  // ── Scroll spy ──────────────────────────────
  const viewBody = document.getElementById('fv-view-body');
  if (_fvTocScrollSpy) { viewBody.removeEventListener('scroll', _fvTocScrollSpy); }
  _fvTocScrollSpy = () => {
    const scrollTop = viewBody.scrollTop;
    let activeId = items[0].id;
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (!el) continue;
      if (el.offsetTop - 80 <= scrollTop) activeId = item.id;
    }
    sidebar.querySelectorAll('.fv-toc-item').forEach(b => {
      b.classList.toggle('fv-toc--active', b.dataset.id === activeId);
    });
  };
  viewBody.addEventListener('scroll', _fvTocScrollSpy, { passive: true });
  _fvTocScrollSpy(); // run once on open
}

function fvTocScrollTo(id) {
  const el       = document.getElementById(id);
  const viewBody = document.getElementById('fv-view-body');
  if (!el || !viewBody) return;
  const offset = el.offsetTop - 72;
  viewBody.scrollTo({ top: offset, behavior: 'smooth' });
}

function destroyFvToc() {
  const viewBody = document.getElementById('fv-view-body');
  if (viewBody && _fvTocScrollSpy) {
    viewBody.removeEventListener('scroll', _fvTocScrollSpy);
    _fvTocScrollSpy = null;
  }
  const sidebar = document.getElementById('fv-toc-sidebar');
  if (sidebar) sidebar.style.display = 'none';
  const tocBtn = document.getElementById('fv-toc-btn');
  if (tocBtn) tocBtn.style.display = 'none';
}

// Mobile sheet open/close
window.toggleFvTocSheet = () => {
  const sheet = document.getElementById('fv-toc-sheet');
  if (!sheet) return;
  sheet.style.display === 'none' ? openFvTocSheet() : closeFvTocSheet();
};

function openFvTocSheet() {
  const overlay = document.getElementById('fv-toc-sheet-overlay');
  const sheet   = document.getElementById('fv-toc-sheet');
  if (!sheet) return;
  overlay.style.display = 'block';
  sheet.style.display   = 'flex';
  sheet.classList.remove('is-closing');
}

window.closeFvTocSheet = () => {
  const overlay = document.getElementById('fv-toc-sheet-overlay');
  const sheet   = document.getElementById('fv-toc-sheet');
  if (!sheet || sheet.style.display === 'none') return;
  sheet.classList.add('is-closing');
  sheet.addEventListener('animationend', () => {
    sheet.style.display   = 'none';
    overlay.style.display = 'none';
    sheet.classList.remove('is-closing');
  }, { once: true });
};

window.switchToEditMode = () => {
  const exam = allExams.find(e => e.id === fvExamId);
  if (!exam) return;
  const ta = document.getElementById('fv-editor-textarea');
  ta.value = exam[fvField] || '';
  fvLivePreview();
  // Reset to write tab
  epSwitchTab('fv', 'write');
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

// Called when the exam backing the open fv-panel is deleted server-side.
// Closes unconditionally — no unsaved-changes check, no discard prompt.
function forceCloseFieldView() {
  clearTimeout(fvSaveTimer);
  fvSaveTimer = null;
  // Null discardCallback SYNCHRONOUSLY before any animation starts.
  // If the discard modal is open its callback belongs to this panel —
  // killing it now closes the race window where the user could click
  // "Discard" during the 250ms animateOut and fire a stale closure.
  discardCallback = null;
  const discardEl = document.getElementById('discard-modal');
  if (discardEl && discardEl.style.display !== 'none') {
    animateOut(discardEl, () => {});
  }
  destroyFvToc();
  animateOut(document.getElementById('fv-panel'), () => {
    fvExamId = null;
    fvField  = null;
    unlockScroll();
  });
}

window.closeFieldView = () => {
  // Warn only if currently in edit mode with unsaved changes
  const editMode = document.getElementById('fv-edit-mode');
  if (editMode && editMode.style.display !== 'none' && fvExamId && fvField) {
    const current = document.getElementById('fv-editor-textarea').value;
    const exam    = allExams.find(e => e.id === fvExamId);
    const saved   = (exam && exam[fvField]) || '';
    if (current !== saved) {
      openDiscardModal(() => {
        clearTimeout(fvSaveTimer);
        fvSaveTimer = null;
        animateOut(document.getElementById('fv-panel'), () => {
          fvExamId = null;
          fvField  = null;
          unlockScroll();
        });
      });
      return;
    }
  }
  clearTimeout(fvSaveTimer);
  fvSaveTimer = null;
  destroyFvToc();
  animateOut(document.getElementById('fv-panel'), () => {
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
  const saveBtn  = document.querySelector('#fv-edit-mode .ep-btn-primary');
  statusEl.textContent = 'Saving…';
  if (saveBtn) { saveBtn.disabled = true; }
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'exams', fvExamId), { [fvField]: value });
    const exam = allExams.find(e => e.id === fvExamId);
    if (exam) exam[fvField] = value;
    statusEl.textContent = '✓ Saved';
    clearTimeout(fvSaveTimer);
    fvSaveTimer = setTimeout(() => {
      fvSaveTimer = null;
      const contentEl = document.getElementById('fv-content');
      contentEl.innerHTML = value.trim() ? parseMd(value) : `<div class="fv-empty-state">Nothing added yet.</div>`;
      document.getElementById('fv-view-mode').style.display = 'flex';
      document.getElementById('fv-edit-mode').style.display = 'none';
      requestAnimationFrame(() => buildFvToc());
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
  // Trim leading newline if inserting at the very start of the textarea
  const actualBefore = (lineStart && s === 0 && before.startsWith('\n'))
    ? before.slice(1)
    : before;
  let replacement, cursorStart, cursorEnd;
  if (lineStart) {
    // Insert at cursor position — no wrapping
    replacement = actualBefore + (selected || '');
    cursorStart = s + actualBefore.length;
    cursorEnd   = s + actualBefore.length + (selected || '').length;
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

window.mdInsertCodeBlock = () => {
  const { ta, preview } = getActiveEditor();
  const s = ta.selectionStart, e = ta.selectionEnd;
  const selected = ta.value.substring(s, e);
  const snippet = '\n```\n' + (selected || 'code here') + '\n```\n';
  ta.value = ta.value.substring(0, s) + snippet + ta.value.substring(e);
  ta.selectionStart = s + 5;
  ta.selectionEnd   = s + 5 + (selected || 'code here').length;
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

  // Apply pill — 2 tiers: <=3 warn, >3 normal
  function mBuildApplyCell(dateStr) {
    if (!dateStr) return '';
    const days = daysUntil(dateStr);
    if (days === null) return '';
    if (days < 0) return `<span class="m-date-past">${formatDateShort(dateStr)}</span>`;
    const cls = days <= 3 ? 'warn' : 'normal';
    return `<span class="m-date-sub">${formatDateShort(dateStr)}</span><span class="m-date-pill m-date-pill--${cls}">${days}d</span>`;
  }
  // Exam pill — 3 tiers: <=45 warn, <=90 ok, >90 normal
  function mBuildExamCell(dateStr, tentative) {
    if (!dateStr) return '';
    const days = daysUntil(dateStr);
    if (days === null) return '';
    const tPfx = tentative ? '~' : '';
    if (days < 0) return `<span class="m-date-past">${tPfx}${formatDateShort(dateStr)}</span>`;
    const cls = days <= 45 ? 'warn' : days <= 90 ? 'ok' : 'normal';
    return `<span class="m-date-sub">${tPfx}${formatDateShort(dateStr)}</span><span class="m-date-pill m-date-pill--${cls}">${days}d</span>`;
  }

  const applyHTML   = mBuildApplyCell(exam.lastDate);
  const examDHTML   = mBuildExamCell(exam.examDate, exam.examDateTentative);

  let statusCls = 'na', statusLabel = '';
  if (exam.lastDate) {
    const d = daysUntil(exam.lastDate);
    statusCls   = d < 0 ? 'closed' : 'open';
    statusLabel = d < 0 ? 'Closed' : 'Open';
  }

  const isJob = !exam.examType || exam.examType === 'job';

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
        ${exam.examDate ? `<div class="m-detail-meta-item${exam.examDateTentative ? ' meta-tentative' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span class="m-detail-meta-label">Exam${exam.examDateTentative ? ' ~' : ''}</span>
          <span class="m-detail-meta-val">${exam.examDateTentative ? '~' : ''}${formatDate(exam.examDate)}</span>
        </div>` : ''}
      </div>

      ${isJob && (exam.vacancies || exam.pay) ? `
      <div class="m-detail-chips">
        ${exam.vacancies ? `<div class="m-detail-chip chip-vacancies"><span class="m-chip-label">Vacancies</span><span class="m-chip-val">${escHtml(exam.vacancies)}</span></div>` : ''}
        ${exam.pay ? `<div class="m-detail-chip chip-pay"><span class="m-chip-label">Pay</span><span class="m-chip-val">₹${escHtml(exam.pay)}</span></div>` : ''}
      </div>` : ''}

      <div class="m-detail-field-btns">
        <button class="m-detail-field-btn${exam.info ? '' : ' empty'}" onclick="event.stopPropagation();openFieldView('${exam.id}','info')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8" stroke-linecap="round" stroke-width="2.5"/><line x1="12" y1="12" x2="12" y2="16"/></svg>
          Info${exam.info ? '' : ' <span class="fbtn-empty">empty</span>'}
        </button>
        <button class="m-detail-field-btn${exam.eligibility ? '' : ' empty'}" onclick="event.stopPropagation();openFieldView('${exam.id}','eligibility')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/></svg>
          Eligibility${exam.eligibility ? '' : ' <span class="fbtn-empty">empty</span>'}
        </button>
        <button class="m-detail-field-btn${exam.syllabus ? '' : ' empty'}" onclick="event.stopPropagation();openFieldView('${exam.id}','syllabus')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          Syllabus${exam.syllabus ? '' : ' <span class="fbtn-empty">empty</span>'}
        </button>
        ${resItems.length > 0 ? `<div class="res-popover-wrap" id="res-wrap-m-${exam.id}">
          <button class="m-detail-field-btn exp-field-res" onclick="event.stopPropagation();toggleResPopover('m-${exam.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Resources <span class="res-count">${resItems.length}</span>
          </button>
          <div class="res-popover" id="res-pop-m-${exam.id}" style="display:none">
            <div class="res-pop-header">Resources</div>
            <div class="res-pop-list">
              ${resItems.map(r => { const rDomain = (() => { try { return new URL(r.url.startsWith('http') ? r.url : 'https://'+r.url).hostname; } catch(e) { return ''; } })(); return `<a href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer" class="res-pop-item">
                <div class="res-pop-icon-wrap">
                  ${r.type === 'PDF'
                    ? `<svg class="res-pop-icon res-pop-icon-pdf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/><line x1="9" y1="9" x2="10" y2="9"/></svg>`
                    : rDomain ? `<img class="res-pop-icon res-pop-icon-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(rDomain)}&sz=32" width="16" height="16" alt="" onerror="this.style.display='none'">`
                    : `<svg class="res-pop-icon res-pop-icon-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`}
                </div>
                <span class="res-pop-title">${escHtml(r.label || r.title || '')}</span>
                <svg class="res-pop-ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>`; }).join('')}
            </div>
          </div>
        </div>` : ''}
        ${exam.website ? `<a href="${escHtml(exam.website.startsWith('http') ? exam.website : 'https://'+exam.website)}" target="_blank" rel="noopener" class="m-detail-field-btn m-detail-link-btn" onclick="event.stopPropagation()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Website
        </a>` : ''}
      </div>

      ${tags.length > 0 ? `
      <div class="m-detail-tags">
        <span class="m-detail-tags-label">Tags:</span>
        ${tags.map(t => `<span class="m-detail-tag" onclick="event.stopPropagation();toggleTagFilter(${escHtml(JSON.stringify(t))})">${escHtml(t)}</span>`).join('')}
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
  <div class="m-card${exam.pinned ? ' pinned-card' : ''}${isExpanded ? ' expanded' : ''}${reorderMode ? ' draggable-card' : ''}"
       data-status="${statusCls}" data-id="${exam.id}"
       id="mcard-${exam.id}">
    <div class="m-card-top" onclick="toggleExpand('${exam.id}')">
      ${reorderMode ? `<div class="m-drag-handle" onclick="event.stopPropagation()" title="Hold to reorder">
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
      </div>` : ''}
      <div class="m-card-main">
        <div class="m-card-name">${escHtml(exam.name)}</div>
        ${exam.subtitle ? `<div class="m-card-subtitle">${escHtml(exam.subtitle)}</div>` : ''}
        <div class="m-card-dates">
          ${applyHTML ? `<div class="m-card-date-row">
            <span class="m-date-label">Apply</span>
            <span class="m-date-content">${applyHTML}</span>
          </div>` : ''}
          ${examDHTML ? `<div class="m-card-date-row">
            <span class="m-date-label">Exam</span>
            <span class="m-date-content">${examDHTML}</span>
          </div>` : ''}
          ${!applyHTML && !examDHTML ? `<span class="m-date-none">No dates set</span>` : ''}
        </div>
      </div>
      <div class="m-card-right">
        <div class="m-card-applied${exam.applied ? ' checked' : ''}"
             onclick="event.stopPropagation();toggleApplied('${exam.id}')"
             title="Toggle applied"></div>
        <button class="m-card-pin${exam.pinned ? ' pinned' : ''}${!exam.examDate ? ' pin-disabled' : ''}"
                onclick="event.stopPropagation();togglePin('${exam.id}')"
                title="${exam.pinned ? 'Unpin' : !exam.examDate ? 'Add exam date to pin' : 'Pin'}">
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="14" height="14"><path d="M5 3a2 2 0 0 0-2 2v16l9-4 9 4V5a2 2 0 0 0-2-2H5z"/></svg>
        </button>
        <div class="m-card-chevron">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
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
  attachMobileDragListeners();
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
    // Reset reorder mode when switching to desktop viewport
    if (!isMobile() && reorderMode) {
      reorderMode = false;
      const rb = document.getElementById('btn-reorder-mode');
      if (rb) rb.classList.remove('active');
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

// Applies only inline-level markdown patterns to an already-escHtml'd string.
// Used for content captured by block patterns (callout body, collapsible body/title)
// that would otherwise be swallowed before the inline passes run on the main string.
function inlineFmt(s) {
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g,         '<em>$1</em>');
  s = s.replace(/__(.+?)__/g,         '<u>$1</u>');
  s = s.replace(/~~(.+?)~~/g,         '<s>$1</s>');
  s = s.replace(/==(.+?)==/g,         '<mark>$1</mark>');
  s = s.replace(/`(.+?)`/g,           '<code>$1</code>');
  s = s.replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
    let trimmed = url.trim().replace(/&quot;/g, '%22').replace(/&#039;/g, '%27');
    // Block dangerous schemes first, before any prefix logic
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return label;
    if (!/^https?:\/\//i.test(trimmed) && !/^mailto:/i.test(trimmed)) {
      trimmed = 'https://' + trimmed;
    }
    return `<a href="${escHtml(trimmed)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  return s;
}

function parseMd(md) {
  if (!md) return '';
  let html = escHtml(md);

  // Headings — most specific first, with slug IDs for TOC anchors
  const _slugCount = {};
  function _slugify(raw) {
    // raw is already escHtml'd — strip tags, lowercase, replace non-alphanum
    const text = raw.replace(/<[^>]+>/g, '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    _slugCount[text] = (_slugCount[text] || 0) + 1;
    return _slugCount[text] > 1 ? text + '-' + _slugCount[text] : text;
  }
  html = html.replace(/^#### (.+)$/gm, (_, t) => `<h4 id="${_slugify(t)}">${t}</h4>`);
  html = html.replace(/^### (.+)$/gm,  (_, t) => `<h3 id="${_slugify(t)}">${t}</h3>`);
  html = html.replace(/^## (.+)$/gm,   (_, t) => `<h2 id="${_slugify(t)}">${t}</h2>`);
  html = html.replace(/^# (.+)$/gm,    (_, t) => `<h1 id="${_slugify(t)}">${t}</h1>`);

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
    return `<div class="md-callout ${cls}"><span class="callout-icon">${icon}</span><div class="callout-body">${inlineFmt(content.trim())}</div></div>`;
  });

  // Collapsible +++ Title \n content \n +++
  html = html.replace(/\+\+\+ (.+)\n([\s\S]*?)\+\+\+/gm, (_, title, content) => {
    return `<details class="md-collapsible"><summary class="md-collapsible-title">${inlineFmt(title.trim())}</summary><div class="md-collapsible-body">${inlineFmt(content.trim())}</div></details>`;
  });

  // Bold + italic (order: *** before ** before *)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g,         '<em>$1</em>');

  // Underline, strikethrough, highlight
  html = html.replace(/__(.+?)__/g,   '<u>$1</u>');
  html = html.replace(/~~(.+?)~~/g,   '<s>$1</s>');
  html = html.replace(/==(.+?)==/g,   '<mark>$1</mark>');

  // Fenced code blocks (``` lang? ... ```) — must run before inline code
  html = html.replace(/```(\w*)\n([\s\S]*?)```/gm, (_, lang, code) => {
    const langAttr = lang ? ` data-lang="${escHtml(lang)}"` : '';
    const langLabel = lang ? `<span class="code-block-lang">${escHtml(lang)}</span>` : '';
    return `<pre class="md-code-block"${langAttr}>${langLabel}<code>${code.trimEnd()}</code></pre>`;
  });

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

  // Links — replace &quot;/&#039; in URL with percent-encoding to prevent attribute injection
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
    let trimmed = url.trim().replace(/&quot;/g, '%22').replace(/&#039;/g, '%27');
    // Block dangerous schemes first, before any prefix logic
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return label;
    if (!/^https?:\/\//i.test(trimmed) && !/^mailto:/i.test(trimmed)) {
      trimmed = 'https://' + trimmed;
    }
    return `<a href="${escHtml(trimmed)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Paragraphs — wrap bare lines not already in tags
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');

  return html;
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

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// Returns a safe href value: blocks javascript:/data:/vbscript:, normalises to https://, HTML-escapes.
function safeUrl(url) {
  if (!url) return '#';
  const trimmed = url.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '#';
  const full = /^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)
    ? trimmed
    : 'https://' + trimmed;
  return escHtml(full);
}
