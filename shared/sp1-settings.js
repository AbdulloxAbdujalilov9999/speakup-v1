/* SpeakUp-1 — Settings (staff only): SpeakUp's admin dashboard, inside this site.
 * Sections: Users (owner/manager: approve, roles, teachers, add, restrict,
 * delete), Students, Lesson access, Answer key, Calendar, Account.
 * The user records, roles, teacherStudents index and calendar are SpeakUp's
 * own (same Firebase project), so a change here shows in SpeakUp's admin
 * too. Lesson access and homework answers are SpeakUp-1's (sp1/...).
 * Database calls live in shared/sp1-cloud.js; this file is only the screens. */
(function(){
"use strict";
const A = () => window.SP1App, C = () => window.SP1Cloud;
const L = (uz, en) => (A().lang() === "en" ? en : uz);
const $app = document.getElementById("app");
let section = "", query = "", lastHtml = "", owed = false;
const state = { usersFilter: "sp1", studentsFilter: "all", accessStudent: "", calTeacher: "" };
let events = {}, eventsOff = null, eventsFor = null;

const ROLE = () => ({ owner: L("Ega", "Owner"), manager: L("Menejer", "Manager"), teacher: L("Oʻqituvchi", "Teacher"), student: L("Oʻquvchi", "Student") });
const SECTIONS = () => [
  ["users", L("Foydalanuvchilar", "Users"), "user", () => C().isManager],
  ["students", L("Oʻquvchilar", "Students"), "board", () => true],
  ["access", L("Darslarga ruxsat", "Lesson access"), "unlock", () => true],
  ["progress", L("Natijalar", "Progress"), "check", () => true],
  ["answers", L("Javoblar", "Answer key"), "key", () => true],
  ["calendar", L("Taqvim", "Calendar"), "clock", () => true],
  ["account", L("Hisob", "Account"), "user", () => true],
];
const esc = s => A().esc(s);
const people = () => A().people || { users:{}, progress:{}, access:{} };
const usersList = () => Object.keys(people().users).map(id => Object.assign({ id }, people().users[id])).filter(u => u && (u.email || u.name));
const byId = id => people().users[id];
const nameOf = id => { const u = byId(id); return id === C().uid ? (C().profile.name || "") : u ? (u.name || u.email) : "—"; };
/* who can be picked as a student's teacher here: approved teachers, plus the owner and managers (so the owner can teach a class) */
const teachers = () => usersList().filter(u => u.status === "approved" && (u.role === "teacher" || u.role === "owner" || u.role === "manager"));
const isMember = u => !!(people().progress[u.id] && people().progress[u.id].joined) || u.role !== "student";

function modal(html){ const r = document.getElementById("modalRoot"); r.innerHTML = `<div class="modal-backdrop"><div class="modal-card">${html}</div></div>`; return r; }
function closeModal(){ document.getElementById("modalRoot").innerHTML = ""; }
const trialLeft = u => {
  if (u.status !== "pending" || u.role !== "student") return null;
  const start = typeof u.createdAt === "number" ? u.createdAt : Date.now();
  return Math.max(0, Math.ceil((start + 3 * 864e5 - Date.now()) / 864e5));
};
const statusLabel = u => {
  const d = trialLeft(u);
  if (d == null) return ({ approved: L("tasdiqlangan", "approved"), pending: L("kutilmoqda", "pending"), restricted: L("cheklangan", "restricted") })[u.status] || u.status;
  return d > 0 ? L(`Sinov · ${d} kun`, `Trial · ${d}d left`) : L("Sinov tugagan", "Trial expired");
};
const statusClass = u => { const d = trialLeft(u); return d == null ? "status-" + u.status : d > 0 ? "status-trial" : "status-pending"; };
const joined = u => typeof u.createdAt === "number" ? new Date(u.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
const canManage = u => C().isOwner || (C().isManager && u.role !== "owner" && u.role !== "manager");
const restrictedLast = list => list.slice().sort((a, b) => (a.status === "restricted") - (b.status === "restricted"));
async function act(fn, ok){ try{ await fn(); if (ok) A().toast(ok); }catch(e){ alert(e.message); } }

/* ---------------- shell ---------------- */
function render(sec, q){
  const allowed = SECTIONS().filter(s => s[3]());
  section = allowed.some(s => s[0] === sec) ? sec : (C().isManager ? "users" : "students");
  query = q || "";
  if (section !== "calendar" && eventsOff){ eventsOff(); eventsOff = null; eventsFor = null; }
  if (section !== "progress") watchFor(null);
  $app.innerHTML = `
    <div class="section-title"><div><h1>${A().t("settings")}</h1><p>${esc(C().profile.name || "")} · ${esc(ROLE()[C().profile.role] || C().profile.role)}</p></div></div>
    <nav class="set-tabs" aria-label="${A().t("settings")}">${allowed.map(([id, label, ic]) => `<a class="set-tab${id === section ? " active" : ""}" href="#/settings/${id}">${A().I(ic, 16)}<span>${label}</span>${id === "users" ? `<span class="nav-badge" id="usersBadge" hidden></span>` : ""}</a>`).join("")}</nav>
    <div id="setBody" class="set-body"></div>`;
  lastHtml = "";
  draw(true);
}
// Live data re-renders often; never rebuild under an open dropdown or a field being typed in.
function draw(force){
  const body = document.getElementById("setBody");
  if (!body) return;
  const a = document.activeElement;
  if (!force && a && body.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox"){ owed = true; return; }
  if (!force && document.getElementById("modalRoot").innerHTML) { owed = true; return; }
  owed = false;
  const pend = C().isManager ? usersList().filter(u => u.status === "pending").length : 0;
  const ub = document.getElementById("usersBadge"); if (ub){ ub.textContent = pend; ub.hidden = !pend; }
  if (section === "answers"){ if (force) A().viewAnswers(body); return; }
  const tmp = document.createElement("div");
  ({ users: drawUsers, students: drawStudents, access: drawAccess, progress: drawProgress, calendar: drawCalendar, account: drawAccount })[section](tmp);
  tmp.querySelectorAll(".admin-table").forEach(tb => {
    const heads = [...tb.querySelectorAll("thead th")].map(th => th.textContent.trim());
    tb.querySelectorAll("tbody tr").forEach(tr => [...tr.children].forEach((td, i) => td.setAttribute("data-label", heads[i] || "")));
  });
  if (!force && tmp.innerHTML === lastHtml) return;
  lastHtml = tmp.innerHTML;
  body.replaceChildren(...tmp.childNodes);
  wire(body);
}
document.addEventListener("focusout", () => setTimeout(() => { if (owed) draw(); }, 0));
document.addEventListener("click", e => { if (owed && !document.getElementById("modalRoot").innerHTML) setTimeout(() => owed && draw(), 0); });

function filterSwitch(name, options, current){
  return `<div class="filter-bar"><div class="lang-switch filter-switch" role="group">${options.map(o =>
    `<button type="button" data-filter="${name}" data-value="${esc(o.value)}" class="${o.value === current ? "active" : ""}">${esc(o.label)}${o.count != null ? ` <span class="filter-count">${o.count}</span>` : ""}</button>`).join("")}</div></div>`;
}

/* ---------------- Users (owner / manager) ---------------- */
function teacherPicker(u){
  if (!C().isManager) return u.teacherId ? `<span class="user-badge">${esc(nameOf(u.teacherId))}</span>` : "";
  return `<select class="select" data-teacher="${u.id}"><option value="">${L("Oʻqituvchisiz", "No teacher")}</option>
    ${teachers().map(x => `<option value="${x.id}" ${u.teacherId === x.id ? "selected" : ""}>${esc(x.name || x.email)}${x.role !== "teacher" ? " (" + esc(ROLE()[x.role]) + ")" : ""}</option>`).join("")}</select>`;
}
function userRow(u, pending){
  const initial = esc(((u.name || "?")[0] || "?").toUpperCase());
  const avatar = u.photoURL ? `<img class="user-avatar" src="${esc(u.photoURL)}" alt="">` : `<span class="user-avatar user-avatar-fallback">${initial}</span>`;
  const ident = `<div class="user-row-main">${avatar}<div class="user-identity"><span class="user-name">${esc(u.name || L("(ismsiz)", "(no name)"))}</span><span class="user-email mono" title="${esc(u.email)}">${esc(u.email)}</span></div></div>`;
  if (u.status === "restricted") return `<div class="user-row restricted"><div class="user-row-top">${ident}</div>
    ${canManage(u) ? `<div class="user-row-controls"><button class="btn btn-accent btn-sm" data-approve="${u.id}">${L("Ruxsat berish", "Grant access")}</button><button class="btn btn-danger btn-sm" data-delete-user="${u.id}">${L("Oʻchirish", "Delete user")}</button></div>` : ""}</div>`;
  const roles = ["teacher", "student"].concat(C().isOwner ? ["manager"] : []);
  return `<div class="user-row"><div class="user-row-top">${ident}
      <div class="user-row-badges"><span class="user-badge role-${u.role || "none"}">${esc(ROLE()[u.role] || u.role || "—")}</span>
        <span class="user-badge ${statusClass(u)}">${esc(statusLabel(u))}</span>
        ${isMember(u) && u.role === "student" ? `<span class="user-badge">SpeakUp-1</span>` : ""}
        ${joined(u) ? `<span class="user-joined mono">${L("Qoʻshilgan", "Joined")} ${joined(u)}</span>` : ""}</div></div>
    <div class="user-row-controls">
      ${!pending && u.role === "student" ? teacherPicker(u) : ""}
      ${pending ? `<button class="btn btn-accent btn-sm" data-approve="${u.id}">${L("Tasdiqlash", "Approve")}</button>${canManage(u) ? `<button class="btn btn-danger btn-sm" data-restrict="${u.id}">${L("Rad etish", "Deny")}</button>` : ""}`
        : canManage(u) ? `${u.role && u.role !== "owner" ? `<select class="select" data-role="${u.id}">${roles.map(r => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE()[r]}</option>`).join("")}</select>` : ""}
          ${u.provider === "password" ? `<button class="btn btn-ghost btn-sm" data-reset-pw="${esc(u.email)}">${L("Parolni tiklash", "Reset password")}</button>` : ""}
          ${u.role !== "owner" ? `<button class="btn btn-danger btn-sm" data-restrict="${u.id}">${L("Cheklash", "Restrict")}</button>` : ""}` : ""}
    </div></div>`;
}
function drawUsers(el){
  const all = usersList().filter(u => u.id !== undefined);
  const pending = all.filter(u => u.status === "pending" && (state.usersFilter === "all" || isMember(u)));
  const others = restrictedLast(all.filter(u => u.status !== "pending"));
  const scope = state.usersFilter === "all" ? others : others.filter(isMember);
  const f = [{ value: "sp1", label: "SpeakUp-1", count: others.filter(isMember).length }, { value: "teacher", label: L("Oʻqituvchilar", "Teachers"), count: others.filter(u => u.role === "teacher").length },
    { value: "all", label: L("Hammasi (SpeakUp bilan)", "Everyone (with SpeakUp)"), count: others.length }];
  const shown = state.usersFilter === "teacher" ? others.filter(u => u.role === "teacher") : scope;
  el.innerHTML = `
    ${C().isOwner ? `<section class="panel"><div class="panel-head-row"><div><h2>${L("Foydalanuvchi qoʻshish", "Add a user")}</h2>
      <p class="panel-sub">${L("Google bilan kira olmaydiganlar uchun email + parol hisobi yarating va ularga yuboring. Buni faqat siz (ega) qila olasiz.", "Create an email + password account for someone who can't use Google, then send them the login. Only you (the owner) can do this.")}</p></div>
      <button class="btn btn-accent btn-sm" data-add-user>+ ${L("Qoʻshish", "Add user")}</button></div></section>` : ""}
    <section class="panel"><div class="panel-head"><h2>${L("Kutilayotgan soʻrovlar", "Pending requests")}</h2>
      <p class="panel-sub">${L("Yangi roʻyxatdan oʻtganlar. Tasdiqlang, rol va oʻqituvchi tanlang.", "New sign-ups. Approve them and choose a role and a teacher.")}</p></div>
      ${pending.length ? pending.map(u => userRow(u, true)).join("") : `<p class="panel-sub">${L("Soʻrovlar yoʻq.", "No pending requests.")}</p>`}</section>
    <section class="panel"><div class="panel-head-row"><h2>${L("Foydalanuvchilar", "All users")} (${shown.length})</h2>${filterSwitch("users", f, state.usersFilter)}</div>
      ${shown.length ? shown.map(u => userRow(u, false)).join("") : `<p class="panel-sub">${L("Hech kim yoʻq.", "No one yet.")}</p>`}</section>`;
}

function openApprove(uid){
  const u = byId(uid), restoring = u.status === "restricted", asStudent = u.role === "student" || !u.role;
  const r = modal(`<h2>${restoring ? L("Ruxsat berish:", "Grant access to") : L("Tasdiqlash:", "Approve")} ${esc(u.name || u.email)}</h2>
    <p class="panel-sub">${L("Bu hisob uchun rol tanlang.", "Choose a role for this account.")}</p>
    <div class="role-choice"><label><input type="radio" name="apRole" value="student" ${asStudent ? "checked" : ""}> ${ROLE().student}</label>
      <label><input type="radio" name="apRole" value="teacher" ${asStudent ? "" : "checked"}> ${ROLE().teacher}</label></div>
    <div id="apPick" ${asStudent ? "" : "hidden"}><label class="auth-label">${L("Oʻqituvchisi", "Teacher")}</label>
      <select class="select" id="apTeacher" style="width:100%">${teachers().map(x => `<option value="${x.id}" ${x.id === (u.teacherId || C().uid) ? "selected" : ""}>${esc(x.name || x.email)}</option>`).join("")}</select></div>
    <div class="modal-actions"><button class="btn btn-ghost" data-x>${L("Bekor qilish", "Cancel")}</button><button class="btn btn-accent" data-ok>${restoring ? L("Ruxsat berish", "Grant access") : L("Tasdiqlash", "Approve")}</button></div>`);
  r.querySelectorAll('input[name="apRole"]').forEach(x => x.onchange = () => { r.querySelector("#apPick").hidden = x.value !== "student"; });
  r.querySelector("[data-x]").onclick = closeModal;
  r.querySelector("[data-ok]").onclick = () => {
    const role = r.querySelector('input[name="apRole"]:checked').value, tid = role === "student" ? r.querySelector("#apTeacher").value : null;
    act(() => C().approveUser(uid, role, tid, u), restoring ? L("Ruxsat berildi", "Access granted") : L("Tasdiqlandi", "Approved")).then(closeModal);
  };
}
function genPassword(){ const c = "abcdefghjkmnpqrstuvwxyz23456789", b = new Uint32Array(8); crypto.getRandomValues(b); return Array.from(b, n => c[n % c.length]).join(""); }
function openAddUser(){
  const r = modal(`<h2>${L("Foydalanuvchi qoʻshish", "Add a user")}</h2>
    <p class="panel-sub">${L("Siz tanlagan email va parol bilan darhol ishlaydigan hisob yaratiladi.", "Creates an account with the email and password you choose, ready to use straight away.")}</p>
    <label class="auth-label">${L("Ism familiya", "Full name")}</label><input class="auth-input" id="adName" autocomplete="off">
    <label class="auth-label" style="margin-top:10px">${L("Email (yoki email koʻrinishidagi login)", "Email (or any email-style username)")}</label><input class="auth-input" id="adEmail" type="email" autocomplete="off" placeholder="aziz@speakup.uz">
    <label class="auth-label" style="margin-top:10px">${L("Parol", "Password")}</label>
    <div style="display:flex;gap:8px"><input class="auth-input mono" id="adPw" value="${genPassword()}" style="flex:1"><button class="btn btn-ghost btn-sm" id="adGen" type="button">${L("Yangi", "Generate")}</button></div>
    <label class="auth-label" style="margin-top:10px">${L("Rol", "Role")}</label>
    <div class="role-choice"><label><input type="radio" name="adRole" value="student" checked> ${ROLE().student}</label><label><input type="radio" name="adRole" value="teacher"> ${ROLE().teacher}</label><label><input type="radio" name="adRole" value="manager"> ${ROLE().manager}</label></div>
    <div id="adPick"><label class="auth-label">${L("Oʻqituvchisi", "Teacher")}</label><select class="select" id="adTeacher" style="width:100%">${teachers().map(x => `<option value="${x.id}" ${x.id === C().uid ? "selected" : ""}>${esc(x.name || x.email)}</option>`).join("")}</select></div>
    <div class="auth-error" id="adErr" style="display:none;margin-top:10px"></div>
    <div class="modal-actions"><button class="btn btn-ghost" data-x>${L("Bekor qilish", "Cancel")}</button><button class="btn btn-accent" data-ok>${L("Hisob yaratish", "Create account")}</button></div>`);
  r.querySelectorAll('input[name="adRole"]').forEach(x => x.onchange = () => { r.querySelector("#adPick").hidden = x.value !== "student"; });
  r.querySelector("#adGen").onclick = () => { r.querySelector("#adPw").value = genPassword(); };
  r.querySelector("[data-x]").onclick = closeModal;
  const ok = r.querySelector("[data-ok]");
  ok.onclick = async () => {
    const name = r.querySelector("#adName").value.trim(), email = r.querySelector("#adEmail").value.trim().toLowerCase(), password = r.querySelector("#adPw").value;
    const role = r.querySelector('input[name="adRole"]:checked').value, teacherId = role === "student" ? r.querySelector("#adTeacher").value : "";
    const err = m => { const e = r.querySelector("#adErr"); e.textContent = m; e.style.display = "block"; };
    if (!name) return err(L("Ismini yozing.", "Enter their name."));
    if (!email) return err(L("Email yozing.", "Enter an email."));
    if (password.length < 6) return err(L("Parol kamida 6 belgi boʻlsin.", "The password needs at least 6 characters."));
    ok.disabled = true;
    try{
      await C().createManagedUser({ name, email, password, role, teacherId });
      const msg = `SpeakUp-1\n${L("Sayt", "Website")}: ${location.origin}/\nEmail: ${email}\n${L("Parol", "Password")}: ${password}\n(${L("Google emas, email bilan kiring.", "Sign in with email, not Google.")})`;
      const r2 = modal(`<h2>${esc(name)} ${L("endi kira oladi", "can sign in now")}</h2><p class="panel-sub">${L("Bu maʼlumotlarni yuboring — <strong>parol qayta koʻrsatilmaydi</strong>.", "Send them these details — <strong>the password can't be shown again</strong>.")}</p>
        <pre class="mono" id="adCreds" style="white-space:pre-wrap;word-break:break-all;background:var(--surface-2);padding:12px;border-radius:10px;margin:12px 0">${esc(msg)}</pre>
        <div class="modal-actions"><button class="btn btn-ghost" data-copy>${L("Nusxa olish", "Copy")}</button><button class="btn btn-accent" data-x>${L("Tayyor", "Done")}</button></div>`);
      r2.querySelector("[data-copy]").onclick = () => navigator.clipboard.writeText(msg).then(() => A().toast(L("Nusxa olindi", "Copied")), () => {});
      r2.querySelector("[data-x]").onclick = closeModal;
    }catch(e){
      ok.disabled = false;
      const c = e && e.code;
      err(c === "auth/email-already-in-use" ? L("Bu email allaqachon band.", "That email already has an account.") : c === "auth/invalid-email" ? L("Email notoʻgʻri.", "That email isn't valid.") : e.message);
    }
  };
}

/* ---------------- Students ---------------- */
function drawStudents(el){
  const all = A().members(), mgr = C().isManager;
  let f = [], cur = "all";
  if (mgr){
    f = [{ value: "all", label: L("Hammasi", "All"), count: all.length }].concat(teachers().map(x => ({ value: x.id, label: x.name || x.email, count: all.filter(s => s.teacherId === x.id).length })).filter(o => o.count))
      .concat([{ value: "none", label: L("Oʻqituvchisiz", "No teacher"), count: all.filter(s => !s.teacherId).length }]);
    cur = f.some(o => o.value === state.studentsFilter) ? state.studentsFilter : "all";
  }
  const list = cur === "all" ? all : cur === "none" ? all.filter(s => !s.teacherId) : all.filter(s => s.teacherId === cur);
  const units = A().D.units.filter(u => u.type === "lesson" || u.type === "quiz");
  el.innerHTML = `<section class="panel"><div class="panel-head-row"><div><h2>${L("Oʻquvchilar", "Students")} (${list.length})</h2>
      <p class="panel-sub">${mgr ? L("SpeakUp-1 ga kirgan barcha oʻquvchilar.", "Every student who has signed in to SpeakUp-1.") : L("Sizga biriktirilgan oʻquvchilar.", "Students assigned to you.")}</p></div>
      ${list.length ? `<button class="btn btn-accent btn-sm" data-assign="">+ ${L("Uy vazifasi berish", "Assign homework")}</button>` : ""}</div>
    ${f.length > 2 ? filterSwitch("students", f, cur) : ""}
    ${list.length ? `<div class="stu-list">${list.map(s => {
        const open = units.filter(u => A().hasFor(s, A().keyOf(u))).length, done = Object.keys(s.sp1.hwDone).length;
        const started = Object.keys(s.sp1.hwInputs).filter(k => (s.sp1.hwInputs[k] || []).some(x => x) && !s.sp1.hwDone[k]).length;
        const nm = s.name || s.email || "—";
        return `<div class="stu-card">
          <div class="stu-id"><span class="user-avatar user-avatar-fallback stu-avatar">${esc(nm.trim().charAt(0).toUpperCase())}</span>
            <span class="user-identity"><span class="user-name">${esc(nm)}</span><span class="user-email" title="${esc(s.email || "")}">${esc(s.email || "")}</span>${s.status === "pending" ? `<span class="user-badge stu-pending">${L("tasdiqlanmagan", "not approved")}</span>` : ""}</span></div>
          <div class="stu-stats">
            <span class="stu-stat"><b>${open}</b><small>${L("dars ochiq", "lessons open")}</small></span>
            <span class="stu-stat"><b title="${L("bajarildi", "done")}: ${done}${started ? " · " + L("jarayonda", "in progress") + ": " + started : ""}">${done} ✓${started ? `<i> · ${started} ✎</i>` : ""}</b><small>${L("uy vazifasi", "homework")}</small></span>
            <span class="stu-stat"><b class="stu-ago">${A().fmtAgo(s.sp1.updatedAt || s.sp1.lastSeen || s.lastActive)}</b><small>${L("faollik", "active")}</small></span>
          </div>
          ${mgr ? `<label class="stu-teacher"><small>${L("Oʻqituvchi", "Teacher")}</small>${teacherPicker(Object.assign({ id: s.uid }, s))}</label>` : ""}
          <div class="stu-actions"><a class="btn btn-sm btn-accent" href="#/settings/progress?s=${s.uid}">${L("Natijalar", "Progress")}</a><a class="btn btn-sm" href="#/student/${s.uid}">${L("Javoblari", "Answers")}</a><a class="btn btn-sm" href="#/settings/access?s=${s.uid}">${L("Ruxsat", "Access")}</a></div>
        </div>`;
      }).join("")}</div>` : `<p class="panel-sub">${A().t("noMembers")}</p>`}</section>`;
}

/* ---------------- Lesson access ----------------
 * Tick lessons (or pick a range, like SpeakUp's "Unlock lessons early"), then open or close them all at once. */
const unitsAll = () => A().D.units.filter(u => u.type === "lesson" || u.type === "quiz");
const unitOpts = sel => unitsAll().map(u => `<option value="${A().keyOf(u)}" ${A().keyOf(u) === sel ? "selected" : ""}>${esc(A().unitName(u))} — ${esc(u.title)}</option>`).join("");
function drawAccess(el){
  const all = A().members(), sel = new URLSearchParams(query).get("s") || state.accessStudent || "";
  const s = all.find(x => x.uid === sel), units = unitsAll(), picked = state.accessSel || (state.accessSel = new Set());
  el.innerHTML = `<section class="panel"><div class="panel-head-row"><div><h2>${L("Darslarga ruxsat", "Lesson access")}</h2>
      <p class="panel-sub">${L("Oʻquvchilar barcha darslarni koʻradi, lekin faqat siz ochganlariga kira oladi. Darsni boshlaganingizda u sinfingizga avtomatik ochiladi.", "Students see every lesson but can only enter the ones you open. Starting a lesson opens it for your class automatically.")}</p></div>
      <select class="select" id="accStudent" style="max-width:260px"><option value="">${L("Barcha oʻquvchilar", "All students")}</option>${all.map(x => `<option value="${x.uid}" ${x.uid === sel ? "selected" : ""}>${esc(x.name || x.email)}</option>`).join("")}</select></div>
    <div class="range-bar">
      <span class="panel-sub">${L("Oraliq:", "Range:")}</span>
      <select class="select" id="rgFrom">${unitOpts(state.rgFrom || "lesson-1")}</select><span class="panel-sub">→</span>
      <select class="select" id="rgTo">${unitOpts(state.rgTo || "lesson-5")}</select>
      <button class="btn btn-ghost btn-sm" data-range>${L("Belgilash", "Select")}</button>
      <button class="btn btn-ghost btn-sm" data-pick-none>${L("Tozalash", "Clear")}</button>
    </div>
    <div class="bulk-bar"><b>${picked.size} ${L("ta dars belgilandi", "selected")}</b>
      ${s ? `<button class="btn btn-accent btn-sm" data-bulk-open ${picked.size ? "" : "disabled"}>${A().I("unlock", 14)}${L("Ochish", "Open")}</button><button class="btn btn-ghost btn-sm" data-bulk-close ${picked.size ? "" : "disabled"}>${A().I("lock", 14)}${L("Yopish", "Close")}</button>`
        : `<button class="btn btn-accent btn-sm" data-bulk-grant ${picked.size ? "" : "disabled"}>${A().I("unlock", 14)}${A().t("grantAccess")}</button>`}</div>
    <div class="unit-list acc-grid">${units.map(u => {
      const k = A().keyOf(u), b = u.type === "quiz" ? ["TEST", u.num] : ["DARS", u.num], every = !!A().openAll[k];
      const box = `<input type="checkbox" class="acc-pick" data-pick="${k}" ${picked.has(k) ? "checked" : ""} aria-label="${esc(A().unitName(u))}">`;
      if (s){
        const on = A().hasFor(s, k);
        return `<label class="unit-row acc-row${u.type === "quiz" ? " quiz" : ""}${on ? " done" : ""}">${box}<span class="unit-badge"><small>${b[0]}</small><b>${b[1]}</b></span>
          <span class="unit-main"><h3>${esc(u.title)}</h3><p class="unit-meta">${esc(A().unitName(u))}${on && s.access[k] && s.access[k].at ? " · " + A().fmtAgo(s.access[k].at) : ""}</p></span>
          <span class="unit-side">${every ? `<span class="chip accent">${A().t("openToAll")}</span>` : `<button class="btn btn-sm ${on ? "btn-ghost" : "btn-accent"}" data-toggle="${k}">${A().I(on ? "lock" : "unlock", 14)}${on ? L("Yopish", "Close") : L("Ochish", "Open")}</button>`}</span></label>`;
      }
      const n = A().openFor(k).length;
      return `<label class="unit-row acc-row${u.type === "quiz" ? " quiz" : ""}${n || every ? " done" : ""}">${box}<span class="unit-badge"><small>${b[0]}</small><b>${b[1]}</b></span>
        <span class="unit-main"><h3>${esc(u.title)}</h3><p class="unit-meta">${esc(A().unitName(u))} · ${every ? A().t("openToAll") : n ? `${n}/${all.length} ${A().t("openForN")}` : A().t("notOpenYet")}</p></span>
        <span class="unit-side"><button class="btn btn-sm ${n || every ? "btn-ghost" : "btn-accent"}" data-grant="${k}" title="${esc(A().t("grantAccess"))}">${A().I("unlock", 14)}${L("Ruxsat berish", "Grant access")}</button></span></label>`;
    }).join("")}</div></section>`;
}

/* ---------------- Progress (one student; copied from SpeakUp's admin Progress page) ---------------- */
let assignView = { uid: null, off: null, list: {} }, resetView = { uid: null, off: null, list: {} }, reviewView = { uid: null, off: null, list: {} };
function watchFor(uid){
  if (assignView.uid !== uid){
    if (assignView.off) assignView.off();
    if (resetView.off) resetView.off();
    if (reviewView.off) reviewView.off();
    reviewView = { uid, list: {}, off: uid ? C().watchReviewsOf(uid, v => { reviewView.list = v; draw(); }) : null };
    assignView = { uid, list: {}, off: uid ? C().watchAssignments(uid, v => { assignView.list = v; draw(); }) : null };
    resetView = { uid, list: {}, off: uid ? C().watchResets(uid, v => { resetView.list = v; draw(); }) : null };
  }
}
const hwOpts = sel => A().D.homeworks.map(h => `<option value="${h.num}" ${String(h.num) === String(sel) ? "selected" : ""}>${esc(h.title)}</option>`).join("");
function drawProgress(el){
  const all = A().members(), uid = new URLSearchParams(query).get("s") || "", s = all.find(x => x.uid === uid);
  if (!s){
    watchFor(null);
    el.innerHTML = `<section class="panel"><div class="panel-head-row"><div><h2>${L("Natijalar", "Progress")}</h2><p class="panel-sub">${L("Oʻquvchini tanlang: darslari, uy vazifalari va topshiriqlari.", "Pick a student to see their lessons, homework and assignments.")}</p></div>
      ${all.length ? `<button class="btn btn-accent btn-sm" data-assign="">+ ${L("Uy vazifasi berish", "Assign homework")}</button>` : ""}</div>
      ${all.length ? `<div class="pick-list">${all.map(x => `<a class="pick-row" href="#/settings/progress?s=${x.uid}"><span>${esc(x.name || x.email)}</span><span class="panel-sub mono">${esc(x.email || "")}</span></a>`).join("")}</div>` : `<p class="panel-sub">${A().t("noMembers")}</p>`}</section>`;
    return;
  }
  watchFor(uid);
  const p = s.sp1, units = unitsAll(), open = units.filter(u => A().hasFor(s, A().keyOf(u)));
  const rvl = reviewView.list || {}, isDone = n => !!(p.hwDone[n] || (rvl[n] && rvl[n].checked));
  const done = [...new Set(Object.keys(p.hwDone).concat(Object.keys(rvl).filter(n => rvl[n] && rvl[n].checked)))].map(Number).sort((a, b) => a - b);
  const started = Object.keys(p.hwInputs).map(Number).filter(n => (p.hwInputs[n] || []).some(x => x)).sort((a, b) => a - b);
  const asg = Object.keys(assignView.list).map(id => Object.assign({ id }, assignView.list[id])).sort((a, b) => (b.at || 0) - (a.at || 0));
  const rs = Object.keys(resetView.list).map(id => Object.assign({ id }, resetView.list[id]));
  const hwRows = [...new Set(done.concat(started))].sort((a, b) => a - b);
  el.innerHTML = `<a class="auth-link-btn" href="#/settings/progress">← ${L("Barcha oʻquvchilar", "All students")}</a>
    <section class="panel"><div class="panel-head"><h2>${esc(s.name || s.email)}</h2><p class="panel-sub">${esc(s.email || "")}${s.teacherId ? " · " + L("Oʻqituvchi", "Teacher") + ": " + esc(nameOf(s.teacherId)) : ""} · ${L("Oxirgi faollik", "Last active")}: ${A().fmtAgo(p.updatedAt || p.lastSeen || s.lastActive)}</p></div>
      <div class="stat-row"><div class="stat-tile"><span class="stat-num">${open.length}/${units.length}</span><span class="stat-label">${L("Ochiq darslar", "Open lessons")}</span></div>
        <div class="stat-tile"><span class="stat-num">${done.length}/30</span><span class="stat-label">${L("Bajarilgan uy vazifalari", "Homework done")}</span></div>
        <div class="stat-tile"><span class="stat-num">${asg.length}</span><span class="stat-label">${L("Berilgan vazifalar", "Assigned")}</span></div></div>
      <div class="toolbar" style="margin-top:12px"><a class="btn btn-sm" href="#/student/${uid}">${A().I("pencil", 16)}${L("Barcha javoblarini koʻrish", "See all their answers")}</a><a class="btn btn-sm" href="#/settings/access?s=${uid}">${A().I("unlock", 16)}${L("Darslarga ruxsat", "Lesson access")}</a></div></section>
    <section class="panel"><div class="panel-head-row"><div><h2>${L("Berilgan uy vazifalari", "Homework assigned")}</h2>
      <p class="panel-sub">${L("Oʻquvchi ularni bosh sahifasida va «Uy vazifalari»da koʻradi. Vazifa berilganda shu dars ham ochiladi.", "They see these on their home page and under Homeworks. Assigning also opens that lesson for them.")}</p></div>
      <button class="btn btn-accent btn-sm" data-assign="${uid}">+ ${L("Uy vazifasi berish", "Assign homework")}</button></div>
      ${asg.length ? `<div class="reset-log">${asg.map(a => `<div class="reset-log-row"><span>${esc((A().hwByNum(a.hw) || {}).title || "#" + a.hw)}${a.dueDate ? ` · ${L("muddati", "due")} ${esc(a.dueDate)}` : ""}${a.note ? ` · “${esc(a.note)}”` : ""} ${isDone(a.hw) ? `<span class="user-badge status-approved">${L("bajarildi", "done")}</span>` : ""}</span>
        <span class="panel-sub" style="display:flex;align-items:center;gap:8px">${a.byName ? esc(a.byName) : ""}<button class="btn btn-ghost btn-sm" data-cancel-assign="${a.id}">${L("Bekor qilish", "Cancel")}</button></span></div>`).join("")}</div>` : `<p class="panel-sub">${L("Hali hech narsa berilmagan.", "Nothing assigned yet.")}</p>`}</section>
    <section class="panel"><div class="panel-head"><h2>${L("Darslarni ochish (oraliq)", "Open a range of lessons")}</h2>
      <p class="panel-sub">${L("Shu oʻquvchi uchun bir nechta darsni birdaniga oching yoki yoping.", "Open or close several lessons at once for this student.")}</p></div>
      <div class="reset-row"><select class="select" id="pgFrom">${unitOpts(state.rgFrom || "lesson-1")}</select><select class="select" id="pgTo">${unitOpts(state.rgTo || "lesson-5")}</select>
        <button class="btn btn-accent" data-pg-open>${L("Ochish", "Open")}</button><button class="btn btn-ghost" data-pg-close>${L("Yopish", "Close")}</button></div></section>
    <section class="panel"><div class="panel-head"><h2>${L("Uy vazifasini qaytadan boshlash", "Reset a homework")}</h2>
      <p class="panel-sub">${L("Tanlangan uy vazifasidagi barcha javoblarini va «bajarildi» belgisini oʻchiradi, shunda qaytadan bajaradi.", "Clears every answer and the done mark on one homework so they can redo it.")}</p></div>
      <div class="reset-row"><select class="select" id="rsHw">${hwOpts(state.rsHw || (hwRows[0] || 1))}</select><button class="btn btn-accent" data-reset-hw>${L("Qaytadan boshlash", "Reset this homework")}</button></div>
      ${rs.length ? `<div class="reset-log"><p class="panel-sub" style="margin:14px 0 6px">${L("Kutilmoqda (oʻquvchi saytni ochganda bajariladi)", "Waiting (applies when the student opens the site)")}</p>${rs.map(r => `<div class="reset-log-row"><span>${esc((A().hwByNum(r.hw) || {}).title || r.hw)}</span><span class="panel-sub">${esc(r.byName || "")}</span></div>`).join("")}</div>` : ""}</section>
    <section class="panel"><div class="panel-head"><h2>${L("Uy vazifalari", "Homework")} (${hwRows.length})</h2></div>
      ${hwRows.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>${L("Uy vazifasi", "Homework")}</th><th>${L("Holati", "Status")}</th><th>${L("Toʻldirilgan", "Filled")}</th><th>${L("Vaqti", "When")}</th><th></th></tr></thead><tbody>
        ${hwRows.map(n => `<tr><td>${esc((A().hwByNum(n) || {}).title || n)}</td><td>${isDone(n) ? `<span class="user-badge status-approved">${L("bajarildi", "done")}</span>` : `<span class="user-badge status-trial">${L("bajarilmoqda", "in progress")}</span>`}${rvl[n] && rvl[n].checked ? ` <span class="user-badge status-approved">${L("tekshirildi", "checked")}</span>` : ""}</td>
          <td class="mono">${(p.hwInputs[n] || []).filter(x => x).length}</td><td class="mono">${A().fmtAgo(p.hwAt[n])}</td>
          <td class="hw-row-actions">${rvl[n] && rvl[n].checked ? `<button class="btn btn-ghost btn-sm" data-finish="${n}" data-on="0" title="${L("Oʻquvchi yana tahrirlay oladi", "The student can edit again")}">${L("Qayta ochish", "Reopen")}</button>` : `<button class="btn btn-accent btn-sm" data-finish="${n}" data-on="1">${A().I("check", 14)}${L("Bajarildi", "Passed")}</button>`} <a class="btn btn-ghost btn-sm" href="#/hw/${n}?s=${uid}">${L("Javoblari", "Answers")}</a> <button class="btn btn-ghost btn-sm" data-reset-row="${n}">${L("Qaytadan", "Reset")}</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="panel-sub">${L("Hali uy vazifasi boshlanmagan.", "No homework started yet.")}</p>`}</section>`;
}
function openAssign(preset){
  const all = A().members(), pre = new Set(preset ? [preset] : A().myClass().map(x => x.uid));
  const r = modal(`<h2>${L("Uy vazifasi berish", "Assign homework")}</h2>
    <p class="panel-sub">${L("Oʻquvchi uni bosh sahifasida koʻradi; shu dars ham unga ochiladi.", "They see it on their home page; the lesson opens for them too.")}</p>
    <label class="auth-label">${L("Uy vazifasi", "Homework")}</label><select class="select" id="asHw" style="width:100%">${hwOpts(state.asHw || 1)}</select>
    <label class="auth-label" style="margin-top:10px">${L("Muddati (ixtiyoriy)", "Due date (optional)")}</label><input class="auth-input" id="asDue" type="date">
    <label class="auth-label" style="margin-top:10px">${L("Izoh (ixtiyoriy)", "Note (optional)")}</label><input class="auth-input" id="asNote" maxlength="200" placeholder="${L("masalan: 4-mashqni ham bajaring", "e.g. do exercise 4 too")}">
    <label class="auth-label" style="margin-top:10px">${L("Kimlarga", "Students")}</label>
    <div class="grant-tools"><button class="btn btn-ghost btn-sm" data-sel="all">${L("Hammasi", "All")}</button><button class="btn btn-ghost btn-sm" data-sel="none">${L("Hech kim", "None")}</button></div>
    <div class="grant-list">${all.map(x => `<label class="grant-row"><input type="checkbox" value="${x.uid}" ${pre.has(x.uid) ? "checked" : ""}><span class="grow"><b>${esc(x.name || x.email)}</b><small>${esc(x.email || "")}</small></span></label>`).join("")}</div>
    <div class="modal-actions"><button class="btn btn-ghost" data-x>${L("Bekor qilish", "Cancel")}</button><button class="btn btn-accent" data-ok>${L("Berish", "Assign")}</button></div>`);
  const boxes = [...r.querySelectorAll(".grant-list input")];
  r.querySelectorAll("[data-sel]").forEach(b => b.onclick = () => boxes.forEach(x => { x.checked = b.dataset.sel === "all"; }));
  r.querySelector("[data-x]").onclick = closeModal;
  r.querySelector("[data-ok]").onclick = () => {
    const uids = boxes.filter(x => x.checked).map(x => x.value);
    if (!uids.length) return alert(L("Kamida bitta oʻquvchini tanlang.", "Pick at least one student."));
    state.asHw = r.querySelector("#asHw").value;
    act(() => C().assign(uids, { hw: state.asHw, dueDate: r.querySelector("#asDue").value, note: r.querySelector("#asNote").value.trim() }), L("Uy vazifasi berildi", "Homework assigned")).then(closeModal);
  };
}
const rangeKeys = (from, to) => {
  const u = unitsAll().map(A().keyOf), a = u.indexOf(from), b = u.indexOf(to);
  return a < 0 || b < 0 ? [] : u.slice(Math.min(a, b), Math.max(a, b) + 1);
};

/* ---------------- Calendar (SpeakUp's events/{teacherId}) ---------------- */
function calTeacher(){
  if (C().profile.role === "teacher") return C().uid;
  const ts = teachers();
  if (!state.calTeacher || !ts.some(x => x.id === state.calTeacher)) state.calTeacher = (ts.find(x => x.id === C().uid) || ts[0] || {}).id || "";
  return state.calTeacher;
}
function drawCalendar(el){
  const tid = calTeacher();
  if (tid !== eventsFor){
    if (eventsOff) eventsOff();
    eventsFor = tid; events = {};
    eventsOff = tid ? C().watchEvents(tid, v => { events = v; draw(); }) : null;
  }
  const list = Object.keys(events).map(id => Object.assign({ id }, events[id])).sort((a, b) => (a.startAt || 0) - (b.startAt || 0));
  const groups = [];
  const loc = A().lang() === "en" ? "en-GB" : "uz-Latn-UZ";
  list.forEach(ev => { const d = new Date(ev.startAt || Date.now()).toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); let g = groups.find(x => x.d === d); if (!g) groups.push(g = { d, evs: [] }); g.evs.push(ev); });
  el.innerHTML = `<section class="panel"><div class="panel-head-row"><div><h2>${L("Taqvim", "Calendar")}</h2><p class="panel-sub">${L("Rejalashtirilgan darslar (SpeakUp bilan umumiy).", "Scheduled lessons (shared with SpeakUp).")}</p></div>
    ${C().isManager ? `<select class="select" id="calTeacher">${teachers().map(x => `<option value="${x.id}" ${x.id === tid ? "selected" : ""}>${esc(x.name || x.email)}</option>`).join("")}</select>` : ""}
    ${tid ? `<button class="btn btn-accent btn-sm" data-add-event>+ ${L("Dars rejalashtirish", "Schedule lesson")}</button>` : ""}</div>
    ${!tid ? `<p class="panel-sub">${L("Oʻqituvchi tanlanmagan.", "No teacher selected.")}</p>` : groups.length ? groups.map(g => `<div class="cal-group"><h3 class="cal-date">${esc(g.d)}</h3>
      ${g.evs.map(ev => `<div class="cal-event" data-edit-event="${ev.id}"><div class="cal-event-time">${ev.startAt ? new Date(ev.startAt).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) : ""}</div>
        <div><span class="cal-event-title">${esc(ev.title)}</span>${ev.studentIds && ev.studentIds.length ? `<span class="cal-event-students">${ev.studentIds.map(id => esc(nameOf(id))).join(", ")}</span>` : ""}</div></div>`).join("")}</div>`).join("")
      : `<p class="panel-sub">${L("Rejalashtirilgan dars yoʻq.", "No lessons scheduled.")}</p>`}</section>`;
}
function openEvent(ev){
  const tid = calTeacher(), studs = A().members().filter(s => s.teacherId === tid || (C().isManager && tid === C().uid && !s.teacherId));
  const pad = n => String(n).padStart(2, "0"), dl = ms => { if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const r = modal(`<h2>${ev ? L("Darsni tahrirlash", "Edit lesson") : L("Dars rejalashtirish", "Schedule a lesson")}</h2>
    <form id="evForm" class="auth-form">
      <label class="auth-label">${L("Nomi", "Title")}</label><input class="auth-input" id="evTitle" required value="${ev ? esc(ev.title) : ""}">
      <label class="auth-label">${L("Boshlanishi", "Start")}</label><input class="auth-input" id="evStart" type="datetime-local" required value="${ev ? dl(ev.startAt) : ""}">
      <label class="auth-label">${L("Oʻquvchilar", "Student(s)")}</label>
      <select class="select" id="evStudents" multiple size="${Math.min(6, Math.max(2, studs.length))}" style="width:100%">${studs.map(s => `<option value="${s.uid}" ${ev && (ev.studentIds || []).includes(s.uid) ? "selected" : ""}>${esc(s.name || s.email)}</option>`).join("")}</select>
      <label class="auth-label">${L("Izoh", "Notes")}</label><textarea class="auth-input" id="evNotes" rows="3">${ev ? esc(ev.notes || "") : ""}</textarea>
      <div class="modal-actions">${ev ? `<button type="button" class="btn btn-danger" data-del>${L("Oʻchirish", "Delete")}</button>` : ""}<button type="button" class="btn btn-ghost" data-x>${L("Bekor qilish", "Cancel")}</button><button class="btn btn-accent">${ev ? L("Saqlash", "Save") : L("Rejalashtirish", "Schedule")}</button></div>
    </form>`);
  r.querySelector("[data-x]").onclick = closeModal;
  const del = r.querySelector("[data-del]");
  if (del) del.onclick = () => { if (confirm(L("Bu darsni oʻchirasizmi?", "Delete this scheduled lesson?"))) act(() => C().deleteEvent(tid, ev.id)).then(closeModal); };
  r.querySelector("#evForm").onsubmit = e => {
    e.preventDefault();
    const payload = { teacherId: tid, teacherName: nameOf(tid), title: r.querySelector("#evTitle").value.trim(), notes: r.querySelector("#evNotes").value.trim(),
      studentIds: [...r.querySelector("#evStudents").selectedOptions].map(o => o.value), startAt: new Date(r.querySelector("#evStart").value).getTime() };
    act(() => C().saveEvent(tid, ev && ev.id, payload), ev ? L("Saqlandi", "Lesson updated") : L("Rejalashtirildi", "Lesson scheduled")).then(closeModal);
  };
}

/* ---------------- Account ---------------- */
function drawAccount(el){
  const me = C().profile, pid = C().providerId, pw = pid === "password";
  el.innerHTML = `<section class="panel"><div class="panel-head"><h2>${L("Hisob", "Account")}</h2></div>
    <div class="user-row"><div><span class="user-name">${esc(me.name || "")}</span><span class="user-email">${esc(me.email || "")} · ${esc(ROLE()[me.role] || me.role)}</span></div></div>
    ${pw ? `<div class="user-row"><div><span class="user-name">${L("Parol", "Password")}</span><span class="user-email">${L("Yangi parol oʻrnatish uchun emailingizga havola yuboramiz.", "We'll email you a link to set a new one.")}</span></div><button class="btn btn-ghost btn-sm" data-my-reset>${L("Havola yuborish", "Send reset email")}</button></div>
      <div class="user-row"><div><span class="user-name">${L("Email manzil", "Email address")}</span><span class="user-email">${L("Yangi manzilga tasdiqlash havolasi yuboriladi.", "Sends a confirmation link to your new address.")}</span></div><button class="btn btn-ghost btn-sm" data-change-email>${L("Emailni oʻzgartirish", "Change email")}</button></div>`
      : `<div class="user-row"><div><span class="user-name">${L("Google orqali kirgansiz", "Signed in with Google")}</span><span class="user-email">${L("Email va parolingiz Google’da boshqariladi.", "Your email and password are managed there.")}</span></div></div>`}
    <div class="user-row"><div><span class="user-name">${L("Chiqish", "Sign out")}</span><span class="user-email">${L("Bu qurilmadan chiqish.", "End your session on this device.")}</span></div><button class="btn btn-danger btn-sm" data-signout>${L("Chiqish", "Sign out")}</button></div></section>`;
}
function openChangeEmail(){
  const r = modal(`<h2>${L("Emailni oʻzgartirish", "Change email")}</h2><p class="panel-sub">${L("Joriy parolni kiriting, keyin yangi manzilga kelgan havolani bosing.", "Confirm your current password, then click the link we send to the new address.")}</p>
    <form id="emForm" class="auth-form"><label class="auth-label">${L("Yangi email", "New email")}</label><input class="auth-input" id="emNew" type="email" required value="${esc(C().profile.email || "")}">
      <label class="auth-label">${L("Joriy parol", "Current password")}</label><input class="auth-input" id="emPw" type="password" required autocomplete="current-password">
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-x>${L("Bekor qilish", "Cancel")}</button><button class="btn btn-accent">${L("Oʻzgartirish", "Change email")}</button></div></form>`);
  r.querySelector("[data-x]").onclick = closeModal;
  r.querySelector("#emForm").onsubmit = e => { e.preventDefault(); const n = r.querySelector("#emNew").value.trim(); act(() => C().changeEmail(n, r.querySelector("#emPw").value), L("Tasdiqlash havolasi yuborildi: ", "Confirmation link sent to ") + n).then(closeModal); };
}

/* ---------------- events ---------------- */
function wire(body){
  body.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { state[b.dataset.filter + "Filter"] = b.dataset.value; draw(true); });
  const q = (sel, fn) => body.querySelectorAll(sel).forEach(fn);
  q("[data-add-user]", b => b.onclick = openAddUser);
  q("[data-approve]", b => b.onclick = () => openApprove(b.dataset.approve));
  q("[data-restrict]", b => b.onclick = () => { if (confirm(L("Bu odamning kirishini cheklaysizmi? U darhol chiqarib yuboriladi.", "Restrict this person's access? They'll be signed out immediately."))) act(() => C().setUserStatus(b.dataset.restrict, "restricted"), L("Cheklandi", "Access restricted")); });
  q("[data-delete-user]", b => b.onclick = () => {
    const u = byId(b.dataset.deleteUser); if (!u) return;
    if (confirm(L(`${u.name || u.email} butunlay oʻchirilsinmi? Buni qaytarib boʻlmaydi.`, `Permanently delete ${u.name || u.email}? This can't be undone.`))) act(() => C().deleteUser(b.dataset.deleteUser, u, people().users), L("Oʻchirildi", "User deleted"));
  });
  q("[data-role]", s => s.onchange = () => {
    const u = byId(s.dataset.role) || {};
    if (!confirm(L(`${u.name || u.email}: rol «${ROLE()[s.value]}» ga oʻzgartirilsinmi?`, `Change ${u.name || u.email}'s role to ${ROLE()[s.value]}?`))){ s.value = u.role; s.blur(); return; }
    act(() => C().setUserRole(s.dataset.role, s.value, u), L("Rol oʻzgartirildi", "Role changed"));
  });
  q("[data-teacher]", s => s.onchange = () => act(() => C().reassignTeacher(s.dataset.teacher, s.value, byId(s.dataset.teacher)), L("Oʻqituvchi yangilandi", "Teacher updated")));
  q("[data-reset-pw]", b => b.onclick = () => act(() => C().sendReset(b.dataset.resetPw), L("Havola yuborildi: ", "Reset email sent to ") + b.dataset.resetPw));
  q("[data-grant]", b => b.onclick = e => { e.preventDefault(); A().openGrantModal(b.dataset.grant); });
  const picked = () => state.accessSel || (state.accessSel = new Set());
  q("[data-pick]", c => c.onchange = () => { if (c.checked) picked().add(c.dataset.pick); else picked().delete(c.dataset.pick); draw(true); });
  q("[data-range]", b => b.onclick = () => { state.rgFrom = body.querySelector("#rgFrom").value; state.rgTo = body.querySelector("#rgTo").value; rangeKeys(state.rgFrom, state.rgTo).forEach(k => picked().add(k)); draw(true); });
  q("[data-pick-none]", b => b.onclick = () => { picked().clear(); draw(true); });
  q("[data-bulk-grant]", b => b.onclick = () => { const ks = unitsAll().map(A().keyOf).filter(k => picked().has(k)); picked().clear(); draw(true); A().openGrantModal(ks); });
  const stuOf = () => new URLSearchParams(query).get("s") || state.accessStudent;
  q("[data-bulk-open]", b => b.onclick = () => { const ks = [...picked()]; picked().clear(); act(() => C().setAccessMany(ks.map(k => [stuOf(), k, true])), A().t("accessSaved")); });
  q("[data-bulk-close]", b => b.onclick = () => { const ks = [...picked()]; picked().clear(); act(() => C().setAccessMany(ks.map(k => [stuOf(), k, false])), A().t("accessSaved")); });
  q("[data-assign]", b => b.onclick = () => openAssign(b.dataset.assign));
  q("[data-cancel-assign]", b => b.onclick = () => { if (confirm(L("Bu vazifani bekor qilasizmi?", "Cancel this assignment?"))) act(() => C().cancelAssignment(assignView.uid, b.dataset.cancelAssign)); });
  const pgRange = () => { state.rgFrom = body.querySelector("#pgFrom").value; state.rgTo = body.querySelector("#pgTo").value; return rangeKeys(state.rgFrom, state.rgTo); };
  q("[data-pg-open]", b => b.onclick = () => { const ks = pgRange(); act(() => C().setAccessMany(ks.map(k => [assignView.uid, k, true])), `${ks.length} ${A().t("lessonsWord")} · ${A().t("accessSaved")}`); });
  q("[data-pg-close]", b => b.onclick = () => { const ks = pgRange(); act(() => C().setAccessMany(ks.map(k => [assignView.uid, k, false])), A().t("accessSaved")); });
  const doReset = n => { const s = A().members().find(x => x.uid === assignView.uid); if (confirm(L(`${(s && s.name) || ""}: ${n}-uy vazifasi javoblari oʻchirilsinmi?`, `Clear ${(s && s.name) || "this student"}'s answers on homework ${n}?`))) act(() => C().queueReset(assignView.uid, n), L("Soʻrov yuborildi", "Reset queued")); };
  q("[data-reset-hw]", b => b.onclick = () => { state.rsHw = body.querySelector("#rsHw").value; doReset(state.rsHw); });
  q("[data-reset-row]", b => b.onclick = () => doReset(b.dataset.resetRow));
  q("[data-finish]", b => b.onclick = () => { const on = b.dataset.on === "1"; b.disabled = true;
    act(() => C().setChecked(assignView.uid, b.dataset.finish, on), on ? L("Uy vazifasi bajarildi deb belgilandi", "Marked as passed") : L("Qayta ochildi", "Reopened")); });
  q("[data-toggle]", b => b.onclick = e => { e.preventDefault();
    const uid = new URLSearchParams(query).get("s") || state.accessStudent, s = A().members().find(x => x.uid === uid);
    if (s) act(() => C().setAccess([uid], b.dataset.toggle, !s.access[b.dataset.toggle]));
  });
  const as = body.querySelector("#accStudent");
  if (as) as.onchange = () => { state.accessStudent = as.value; query = ""; as.blur(); history.replaceState(null, "", "#/settings/access" + (as.value ? "?s=" + as.value : "")); query = as.value ? "s=" + as.value : ""; draw(true); };
  const ct = body.querySelector("#calTeacher");
  if (ct) ct.onchange = () => { state.calTeacher = ct.value; ct.blur(); draw(true); };
  q("[data-add-event]", b => b.onclick = () => openEvent(null));
  q("[data-edit-event]", b => b.onclick = () => openEvent(Object.assign({ id: b.dataset.editEvent }, events[b.dataset.editEvent])));
  q("[data-my-reset]", b => b.onclick = () => act(() => C().sendReset(C().profile.email), L("Havola yuborildi", "Reset email sent")));
  q("[data-change-email]", b => b.onclick = openChangeEmail);
  q("[data-signout]", b => b.onclick = () => C().signOut());
}

window.SP1Settings = { render, refresh(){ if (location.hash.startsWith("#/settings")) draw(); }, scrollTop: true };
})();
