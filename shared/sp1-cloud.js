/* SpeakUp-1 — accounts and cloud sync.
 * Same Firebase project and the same /users accounts and roles as SpeakUp
 * (shared/firebase-config.js is a copy of SpeakUp's). SpeakUp-1's own data
 * lives under /sp1 so it never touches SpeakUp's /progress:
 *   sp1/progress/{uid}  a student's homework answers + done marks
 *                       (readable by owner/manager and the student's teacher)
 *   sp1/boards/{uid}    what a teacher typed onto lesson slides (private)
 *   sp1/open/{unitKey}  a lesson opened for every student (new ones too)
 *   sp1/access/{uid}    the lessons a teacher has opened for this student
 *                       ({ "lesson-3": {at, by}, "quiz-2": {...} }); a
 *                       student sees only these lessons and their homework
 * Anyone who has signed in here has a sp1/progress record, which is how
 * the Settings pages tell SpeakUp-1's students from SpeakUp's.
 * Access control is in SpeakUp's database.rules.json (the "sp1" node). */
import { initializeApp, getApps, deleteApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile,
  EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, push, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig, OWNER_EMAIL } from "./firebase-config.js";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const STAFF = ["owner", "manager", "teacher"];

const uz = () => ((JSON.parse(localStorage.getItem("sp1_settings") || "{}") || {}).lang || "uz") !== "en";
const L = (a, b) => (uz() ? a : b);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const GOOGLE_ICON = `<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4c-7.6 0-14.1 4.3-17.4 10.7z"/><path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.2-5.6l-6.6-5.6C29.6 34.8 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.8 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.6 5.6C39.9 37.4 44 31.4 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>`;

let mode = "signin", errorMsg = "", busy = false, pendingName = "";
const $root = () => document.getElementById("authRoot");
const showApp = on => { $root().hidden = on; document.getElementById("appShell").hidden = !on; };

function errText(e){
  const c = e && e.code;
  return ({
    "auth/invalid-credential": L("Email yoki parol notoʻgʻri.", "Wrong email or password."),
    "auth/wrong-password": L("Email yoki parol notoʻgʻri.", "Wrong email or password."),
    "auth/user-not-found": L("Bunday hisob yoʻq. Roʻyxatdan oʻting.", "No account with that email. Sign up instead."),
    "auth/email-already-in-use": L("Bu email band. Kirish tugmasini bosing.", "That email already has an account. Sign in instead."),
    "auth/weak-password": L("Parol kamida 6 belgidan iborat boʻlsin.", "Password must be at least 6 characters."),
    "auth/invalid-email": L("Email notoʻgʻri.", "That email address is not valid."),
    "auth/popup-closed-by-user": L("Kirish bekor qilindi.", "Sign-in was cancelled."),
    "auth/unauthorized-domain": L("Google orqali kirish bu saytda hali yoqilmagan. Email va parol bilan kiring.", "Google sign-in isn't enabled for this site yet. Use email and password."),
  })[c] || (e && e.message) || String(e);
}

function renderSignIn(){
  const signup = mode === "signup", reset = mode === "reset";
  $root().innerHTML = `
  <div class="auth-screen"><div class="auth-card">
    <span class="auth-brand">SPEAKUP-1</span>
    <h1 class="auth-title">${reset ? L("Parolni tiklash", "Reset password") : signup ? L("Hisob yaratish", "Create your account") : L("Kirish", "Sign in")}</h1>
    <p class="auth-sub">${L("Har bir oʻquvchining oʻz hisobi bor — oʻqituvchi uy vazifalaringizni shu yerda koʻradi. SpeakUp hisobingiz bilan ham kirishingiz mumkin.", "Every student has their own account so the teacher can see your homework. Your SpeakUp account works here too.")}</p>
    ${errorMsg ? `<div class="auth-error">${esc(errorMsg)}</div>` : ""}
    ${reset ? "" : `<div class="auth-providers"><button class="auth-btn-provider" id="gBtn" ${busy ? "disabled" : ""}>${GOOGLE_ICON}${L("Google orqali kirish", "Continue with Google")}</button></div>
    <div class="auth-divider">${L("yoki", "or")}</div>`}
    <form class="auth-form" id="authForm">
      ${signup ? `<label class="auth-label" for="aName">${L("Ism familiya", "Full name")}</label><input class="auth-input" id="aName" required autocomplete="name">` : ""}
      <label class="auth-label" for="aEmail">Email</label><input class="auth-input" id="aEmail" type="email" required autocomplete="email">
      ${reset ? "" : `<label class="auth-label" for="aPass">${L("Parol", "Password")}</label><input class="auth-input" id="aPass" type="password" required minlength="6" autocomplete="${signup ? "new-password" : "current-password"}">`}
      <button class="btn btn-accent" style="margin-top:14px" ${busy ? "disabled" : ""}>${reset ? L("Havola yuborish", "Send reset link") : signup ? L("Roʻyxatdan oʻtish", "Sign up") : L("Kirish", "Sign in")}</button>
    </form>
    <div class="auth-links">
      ${signup || reset ? `<button class="auth-link-btn" data-mode="signin">${L("Hisobim bor — kirish", "I have an account — sign in")}</button>` : `<button class="auth-link-btn" data-mode="signup">${L("Yangi oʻquvchi? Roʻyxatdan oʻting", "New student? Create an account")}</button><button class="auth-link-btn" data-mode="reset">${L("Parolni unutdingizmi?", "Forgot password?")}</button>`}
    </div>
  </div></div>`;
  $root().querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { mode = b.dataset.mode; errorMsg = ""; renderSignIn(); });
  const g = document.getElementById("gBtn");
  if (g) g.onclick = () => run(() => signInWithPopup(auth, new GoogleAuthProvider()));
  document.getElementById("authForm").onsubmit = e => {
    e.preventDefault();
    const email = document.getElementById("aEmail").value.trim();
    if (reset) return run(async () => { await sendPasswordResetEmail(auth, email); mode = "signin"; errorMsg = L("Havola emailingizga yuborildi.", "Reset link sent to your email."); });
    const pass = document.getElementById("aPass").value;
    if (signup){
      pendingName = document.getElementById("aName").value.trim();
      return run(async () => { const c = await createUserWithEmailAndPassword(auth, email, pass); await updateProfile(c.user, { displayName: pendingName }).catch(() => {}); });
    }
    run(() => signInWithEmailAndPassword(auth, email, pass));
  };
}
async function run(fn){
  busy = true; errorMsg = ""; renderSignIn();
  try{ await fn(); }catch(e){ errorMsg = errText(e); }
  busy = false;
  if (!auth.currentUser) renderSignIn();
}

function renderBlocked(){
  showApp(false);
  $root().innerHTML = `<div class="auth-screen"><div class="auth-card"><span class="auth-brand">SPEAKUP-1</span>
    <h1 class="auth-title">${L("Hisob cheklangan", "Account restricted")}</h1>
    <p class="auth-sub">${L("Oʻqituvchingizga murojaat qiling.", "Please contact your teacher.")}</p>
    <button class="btn btn-ghost btn-sm" id="soBtn">${L("Chiqish", "Sign out")}</button></div></div>`;
  document.getElementById("soBtn").onclick = () => signOut(auth);
}
function renderLoading(){
  $root().innerHTML = `<div class="auth-screen"><div class="auth-card"><span class="auth-brand">SPEAKUP-1</span><p class="auth-sub">${L("Yuklanmoqda…", "Loading…")}</p></div></div>`;
}

/* create the shared /users profile the same way SpeakUp does (rules require this exact shape) */
async function ensureProfile(user){
  const snap = await get(ref(db, "users/" + user.uid));
  if (snap.exists()) return snap.val();
  const email = user.email || "", isOwner = email === OWNER_EMAIL;
  const profile = {
    name: pendingName || user.displayName || email.split("@")[0],
    email, photoURL: user.photoURL || null,
    provider: (user.providerData[0] && user.providerData[0].providerId) || "password",
    status: isOwner ? "approved" : "pending", role: isOwner ? "owner" : "student",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActive: serverTimestamp(),
  };
  await set(ref(db, "users/" + user.uid), profile);
  return (await get(ref(db, "users/" + user.uid))).val();
}

const toArr = v => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => (x == null ? "" : x));
  const a = []; Object.keys(v).forEach(k => { a[+k] = v[k]; }); return Array.from(a, x => (x == null ? "" : x));
};
function normProgress(p){
  p = p || {};
  const out = { hwDone:p.hwDone || {}, hwInputs:{}, hwChecks:{}, hwAt:p.hwAt || {}, updatedAt:p.updatedAt || 0, lastSeen:p.lastSeen || 0, joined:!!(p.lastSeen || p.updatedAt || p.name) };
  Object.keys(p.hwInputs || {}).forEach(k => { out.hwInputs[k] = toArr(p.hwInputs[k]); });
  Object.keys(p.hwChecks || {}).forEach(k => { out.hwChecks[k] = toArr(p.hwChecks[k]).map(Boolean); });
  return out;
}

const isMgr = p => !!p && p.status === "approved" && (p.role === "owner" || p.role === "manager");
let current = null, unsubMe = null;
const Cloud = {
  ready:false, user:null, profile:null,
  get isStaff(){ const p = this.profile; return !!p && p.status === "approved" && STAFF.includes(p.role); },
  get isManager(){ return isMgr(this.profile); },            // owner or manager
  get isOwner(){ const p = this.profile; return !!p && p.status === "approved" && p.role === "owner"; },
  get uid(){ return this.user && this.user.uid; },
  signOut(){ return signOut(auth); },
  normProgress,
  async loadMyProgress(){ return normProgress((await get(ref(db, "sp1/progress/" + this.uid))).val()); },
  saveHomework(n, data){   // data: {inputs, checks, done, at}
    if (!this.uid) return Promise.resolve();
    const u = {};
    u[`hwInputs/${n}`] = data.inputs && data.inputs.length ? data.inputs.map(x => x || "") : null;
    u[`hwChecks/${n}`] = data.checks && data.checks.length ? data.checks.map(Boolean) : null;
    u[`hwDone/${n}`] = data.done || null;
    u[`hwAt/${n}`] = data.at || Date.now();
    u.updatedAt = Date.now();
    u.name = this.profile && this.profile.name || "";
    return update(ref(db, "sp1/progress/" + this.uid), u).catch(e => console.warn("sync", e));
  },
  // only the done flag: a checked homework's answers are locked, so don't rewrite them
  markDone(n, ts){ if (!this.uid) return Promise.resolve(); const u = {}; u[`hwDone/${n}`] = ts || Date.now(); u.updatedAt = Date.now(); return update(ref(db, "sp1/progress/" + this.uid), u); },
  async loadBoards(){ return (await get(ref(db, "sp1/boards/" + this.uid))).val() || {}; },
  saveBoard(key, board){ if (this.uid) return set(ref(db, `sp1/boards/${this.uid}/${key}`), board || null).catch(e => console.warn("board", e)); },
  watchStudent(uid, cb){ return onValue(ref(db, "sp1/progress/" + uid), s => cb(normProgress(s.val())), () => cb(normProgress(null))); },

  /* ---- lesson access ---- */
  // sp1/open/{unitKey}: opened for every student, including ones who sign up later
  watchOpenAll(cb){ return onValue(ref(db, "sp1/open"), s => cb(s.val() || {}), () => cb({})); },
  setOpenAll(keys, on){
    const u = {};
    [].concat(keys).forEach(k => { u["sp1/open/" + k] = on ? { at: Date.now(), by: this.uid } : null; });
    return update(ref(db), u);
  },
  setAccessMany(changes){   // [[uid, key, on], ...] in one write
    const u = {};
    changes.forEach(([id, k, on]) => { u[`sp1/access/${id}/${k}`] = on ? { at: Date.now(), by: this.uid } : null; });
    return Object.keys(u).length ? update(ref(db), u) : Promise.resolve();
  },

  /* ---- homework assignments and resets (SpeakUp's assignments/resets, for SpeakUp-1 homework) ----
   * sp1/assignments/{uid}/{id}: {hw, note, dueDate, by, byName, at}; the student sees them on Home and Homework.
   * sp1/resets/{uid}/{id}: {hw, by, byName, at}; the student's app clears that homework and deletes the request. */
  watchAssignments(uid, cb){ return onValue(ref(db, "sp1/assignments/" + uid), s => cb(s.val() || {}), () => cb({})); },
  assign(uids, p){
    const base = { hw: Number(p.hw), by: this.uid, byName: (this.profile && this.profile.name) || "", at: Date.now() };
    if (p.note) base.note = p.note;
    if (p.dueDate) base.dueDate = p.dueDate;
    const u = {};
    uids.forEach(id => { u[`sp1/assignments/${id}/${push(ref(db, "sp1/assignments/" + id)).key}`] = base; u[`sp1/access/${id}/lesson-${base.hw}`] = { at: Date.now(), by: this.uid }; });
    return update(ref(db), u);
  },
  cancelAssignment(uid, id){ return remove(ref(db, `sp1/assignments/${uid}/${id}`)); },
  watchResets(uid, cb){ return onValue(ref(db, "sp1/resets/" + uid), s => cb(s.val() || {}), () => cb({})); },
  queueReset(uid, hw){   // a reset also drops the teacher's corrections on that homework
    const u = {};
    u[`sp1/resets/${uid}/${push(ref(db, "sp1/resets/" + uid)).key}`] = { hw: Number(hw), by: this.uid, byName: (this.profile && this.profile.name) || "", at: Date.now() };
    u[`sp1/reviews/${uid}/${Number(hw)}`] = null;
    return update(ref(db), u);
  },
  /* ---- teacher corrections ----
   * sp1/reviews/{uid}/{hw}: {fix:{i3:"text"}, marks:{i3:1|0}, comment, checked, by, byName, at}
   * The student's own answers stay untouched in sp1/progress; only staff may write here. */
  watchReview(uid, hw, cb){ return onValue(ref(db, `sp1/reviews/${uid}/${hw}`), s => cb(s.val()), () => cb(null)); },
  watchMyReviews(cb){ return onValue(ref(db, "sp1/reviews/" + this.uid), s => cb(s.val() || {}), () => cb({})); },
  saveReview(uid, hw, r){
    const v = r ? Object.assign({}, r, { by: this.uid, byName: (this.profile && this.profile.name) || "", at: Date.now() }) : null;
    return set(ref(db, `sp1/reviews/${uid}/${hw}`), v);
  },
  doneReset(id){ return remove(ref(db, `sp1/resets/${this.uid}/${id}`)); },
  watchMyAccess(cb){ return onValue(ref(db, "sp1/access/" + this.uid), s => cb(s.val() || {}), () => cb({})); },
  setAccess(uids, key, on){
    const u = {};
    uids.forEach(id => { u[`sp1/access/${id}/${key}`] = on ? { at: Date.now(), by: this.uid } : null; });
    return Object.keys(u).length ? update(ref(db), u) : Promise.resolve();
  },

  /* ---- staff: everyone this account may see, live ----
   * Owner/manager read /users, sp1/progress and sp1/access whole. A teacher
   * reads their slice of SpeakUp's teacherStudents index, then each of
   * those students individually (the same pattern as SpeakUp's admin).
   * cb({ users: {uid: profile}, progress: {uid: normProgress}, access: {uid: {...}} }) on every change. */
  watchPeople(cb){
    const me = this, st = { users:{}, progress:{}, access:{} }, unsubs = [], per = new Map();
    let t = null;
    const emit = () => { clearTimeout(t); t = setTimeout(() => cb(st), 30); };
    if (this.isManager){
      unsubs.push(onValue(ref(db, "users"), s => { st.users = s.val() || {}; emit(); }, e => console.warn("users", e)));
      unsubs.push(onValue(ref(db, "sp1/progress"), s => { const v = s.val() || {}; st.progress = {}; Object.keys(v).forEach(k => { st.progress[k] = normProgress(v[k]); }); emit(); }, e => console.warn("progress", e)));
      unsubs.push(onValue(ref(db, "sp1/access"), s => { st.access = s.val() || {}; emit(); }, e => console.warn("access", e)));
    } else {
      unsubs.push(onValue(ref(db, "teacherStudents/" + this.uid), s => {
        const ids = Object.keys(s.val() || {}), keep = new Set(ids);
        for (const [id, offs] of per){ if (!keep.has(id)){ offs.forEach(f => f()); per.delete(id); delete st.users[id]; delete st.progress[id]; delete st.access[id]; } }
        ids.forEach(id => {
          if (per.has(id)) return;
          per.set(id, [
            onValue(ref(db, "users/" + id), x => { if (x.exists()) st.users[id] = x.val(); else delete st.users[id]; emit(); }, () => {}),
            onValue(ref(db, "sp1/progress/" + id), x => { st.progress[id] = normProgress(x.val()); emit(); }, () => {}),
            onValue(ref(db, "sp1/access/" + id), x => { st.access[id] = x.val() || {}; emit(); }, () => {}),
          ]);
        });
        if (me.profile) st.users[me.uid] = me.profile;
        emit();
      }, e => console.warn("teacherStudents", e)));
    }
    return () => { unsubs.forEach(f => f()); per.forEach(offs => offs.forEach(f => f())); clearTimeout(t); };
  },

  /* ---- admin writes (copied from SpeakUp's admin/admin.js) ---- */
  async approveUser(uid, role, teacherId, old){
    const oldTeacherId = old && old.teacherId;
    const u = {
      [`users/${uid}/role`]: role, [`users/${uid}/status`]: "approved", [`users/${uid}/updatedAt`]: serverTimestamp(),
      [`users/${uid}/teacherId`]: role === "student" ? (teacherId || null) : null,
    };
    if (oldTeacherId && oldTeacherId !== teacherId) u[`teacherStudents/${oldTeacherId}/${uid}`] = null;
    if (role === "student" && teacherId) u[`teacherStudents/${teacherId}/${uid}`] = true;
    await update(ref(db), u);
  },
  setUserStatus(uid, status){ return update(ref(db), { [`users/${uid}/status`]: status, [`users/${uid}/updatedAt`]: serverTimestamp() }); },
  async setUserRole(uid, role, old){
    const oldTeacherId = old && old.teacherId;
    const u = { [`users/${uid}/role`]: role, [`users/${uid}/updatedAt`]: serverTimestamp() };
    if (role === "student") u[`users/${uid}/teacherId`] = oldTeacherId || null;
    else { u[`users/${uid}/teacherId`] = null; if (oldTeacherId) u[`teacherStudents/${oldTeacherId}/${uid}`] = null; }
    await update(ref(db), u);
  },
  async reassignTeacher(uid, teacherId, old){
    const oldTeacherId = old && old.teacherId;
    const u = { [`users/${uid}/teacherId`]: teacherId || null, [`users/${uid}/updatedAt`]: serverTimestamp() };
    if (oldTeacherId && oldTeacherId !== teacherId) u[`teacherStudents/${oldTeacherId}/${uid}`] = null;
    if (teacherId) u[`teacherStudents/${teacherId}/${uid}`] = true;
    await update(ref(db), u);
  },
  // Removes a restricted person's records (their sign-in account stays; that needs the Admin SDK).
  async deleteUser(uid, u, allUsers){
    const x = {
      [`users/${uid}`]: null, [`progress/${uid}`]: null, [`resets/${uid}`]: null, [`assignments/${uid}`]: null,
      [`sp1/progress/${uid}`]: null, [`sp1/access/${uid}`]: null,
    };
    if (u.role === "student" && u.teacherId) x[`teacherStudents/${u.teacherId}/${uid}`] = null;
    if (u.role === "teacher"){
      x[`teacherStudents/${uid}`] = null; x[`events/${uid}`] = null;
      Object.keys(allUsers || {}).forEach(id => { const s = allUsers[id]; if (s && s.role === "student" && s.teacherId === uid) x[`users/${id}/teacherId`] = null; });
    }
    await update(ref(db), x);
  },
  sendReset(email){ return sendPasswordResetEmail(auth, email); },
  async changeEmail(newEmail, currentPassword){
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await verifyBeforeUpdateEmail(user, newEmail);
  },
  get providerId(){ const u = auth.currentUser; return (u && u.providerData[0] && u.providerData[0].providerId) || ""; },
  // The sign-in account is made on a throwaway app instance so the owner stays signed in.
  async createManagedUser({ name, email, password, role, teacherId }){
    if (!this.isOwner) throw new Error("Only the owner can add users.");
    const secondary = initializeApp(firebaseConfig, "sp1-add-user-" + Date.now());
    let uid;
    try{
      const a2 = getAuth(secondary);
      const cred = await createUserWithEmailAndPassword(a2, email, password);
      uid = cred.user.uid;
      await signOut(a2);
    } finally { deleteApp(secondary).catch(() => {}); }
    const profile = { name, email, provider: "password", status: "approved", role, createdBy: this.uid,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActive: serverTimestamp() };
    const u = {};
    if (role === "student" && teacherId){ profile.teacherId = teacherId; u[`teacherStudents/${teacherId}/${uid}`] = true; }
    u[`users/${uid}`] = profile;
    if (role === "student") u[`sp1/progress/${uid}/name`] = name;   // shows up as a SpeakUp-1 student straight away
    await update(ref(db), u);
    return uid;
  },

  /* ---- calendar (SpeakUp's events/{teacherId}) ---- */
  watchEvents(teacherId, cb){ return onValue(ref(db, "events/" + teacherId), s => cb(s.val() || {}), () => cb({})); },
  saveEvent(teacherId, id, payload){
    payload = Object.assign({}, payload, { updatedAt: serverTimestamp() });
    if (id) return update(ref(db, `events/${teacherId}/${id}`), payload);
    return set(push(ref(db, `events/${teacherId}`)), Object.assign({ createdAt: serverTimestamp() }, payload));
  },
  deleteEvent(teacherId, id){ return remove(ref(db, `events/${teacherId}/${id}`)); },
};
window.SP1Cloud = Cloud;

renderLoading();
onAuthStateChanged(auth, async user => {
  if (unsubMe){ unsubMe(); unsubMe = null; }
  if (!user){
    Cloud.user = Cloud.profile = null; window.SU_user = null; showApp(false); renderSignIn();
    if (current) location.reload();
    return;
  }
  renderLoading();
  try{
    const profile = await ensureProfile(user);
    if (profile.status === "restricted") return renderBlocked();
    Cloud.user = user; Cloud.profile = profile;
    const setSU = p => {   // what the AI teacher (shared/tutor-ui.js) reads
      window.SU_user = { uid: user.uid, name: p.name, email: p.email || user.email, role: p.role, teacherId: p.teacherId || null };
    };
    setSU(profile);
    window.SU_getToken = () => user.getIdToken();
    update(ref(db, "users/" + user.uid), { lastActive: serverTimestamp() }).catch(() => {});
    update(ref(db, "sp1/progress/" + user.uid), { name: profile.name || "", lastSeen: Date.now() }).catch(() => {});
    unsubMe = onValue(ref(db, "users/" + user.uid), s => {
      const p = s.val(); if (!p) return;
      const roleChanged = Cloud.profile && (Cloud.profile.role !== p.role || Cloud.profile.status !== p.status);
      Cloud.profile = p; setSU(p);
      if (p.status === "restricted") return renderBlocked();
      if (roleChanged && window.SP1_refresh) window.SP1_refresh();
    });
    if (current !== user.uid){
      current = user.uid; showApp(true);
      window.dispatchEvent(new CustomEvent("sp1:auth"));
    }
  }catch(e){
    errorMsg = errText(e); showApp(false); renderSignIn();
  }
});
