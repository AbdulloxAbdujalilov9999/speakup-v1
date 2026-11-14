/* SpeakUp-1 — learning centers: plans, paid-until dates, invite codes and the monthly usage report.
 * Shown as the "Centers" / "Center" / "Invite code" tab of Settings (shared/sp1-settings.js calls draw()).
 *   owner/manager  every center: create one, record a payment (+30 days), change the plan, see usage and what to invoice
 *   center admin   their center: status, invite codes for teachers and pupils, usage report
 *   teacher        the invite code and link for their own pupils
 * Database calls are in shared/sp1-cloud.js (createCenter, addPaidDays, createInvite, ...). */
(function(){
"use strict";
const A = () => window.SP1App, C = () => window.SP1Cloud;
const L = (uz, en) => (A().lang() === "en" ? en : uz);
const esc = s => A().esc(s);
const DAY = 864e5;

/* Prices per center per month (so'm), the same as on speakup-centers.onrender.com. The tier follows the number of
 * pupils who used SpeakUp-1 in the month. */
const PLANS = [
  { id: "s50", max: 50, price: 300000 },
  { id: "s150", max: 150, price: 600000 },
  { id: "s300", max: 300, price: 900000 },
  { id: "s300p", max: Infinity, price: 1200000 },
];
const planLabel = id => { const p = PLANS.find(x => x.id === id) || PLANS[0]; return p.max === Infinity ? L("300+ oʻquvchi", "300+ pupils") : L(`${p.max} tagacha oʻquvchi`, `up to ${p.max} pupils`); };
const planPrice = id => (PLANS.find(x => x.id === id) || PLANS[0]).price;
const tierFor = n => PLANS.find(p => n <= p.max) || PLANS[PLANS.length - 1];
const som = n => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ") + " soʻm";
const MON_UZ = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const MON_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monName = m => (A().lang() === "en" ? MON_EN : MON_UZ)[m];
const fmtDate = t => { if (!t) return "—"; const d = new Date(t); return `${d.getDate()} ${monName(d.getMonth()).slice(0, A().lang() === "en" ? 3 : 3)} ${d.getFullYear()}`; };

let centers = {}, centersOff = null, invites = {}, invitesOff = null, invitesFor = null, myCode = "", myCodeBusy = false;
let el = null, query = "";
const redraw = () => { if (el && document.body.contains(el)) draw(el, query, false); };

function status(c){
  const until = Number(c && c.paidUntil) || 0, left = Math.ceil((until - Date.now()) / DAY);
  if (until <= Date.now()) return { cls: "cs-expired", label: L("Muddati tugagan", "Expired"), left };
  if (c.pilot) return { cls: "cs-pilot", label: L(`Sinov · ${left} kun`, `Pilot · ${left}d left`), left };
  return { cls: left <= 5 ? "cs-due" : "cs-paid", label: L(`Toʻlangan · ${left} kun`, `Paid · ${left}d left`), left };
}

/* ---------- usage: from the live people list (owner: everyone; admin: their center) ---------- */
function monthRange(offset){
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + (offset || 0));
  const from = d.getTime(); d.setMonth(d.getMonth() + 1);
  const f = new Date(from);
  return { from, to: d.getTime(), label: `${monName(f.getMonth())} ${f.getFullYear()}` };
}
const inRange = (t, r) => typeof t === "number" && t >= r.from && t < r.to;
function usage(cid, r){
  const ppl = A().people || { users: {}, progress: {} };
  const rows = [];
  Object.keys(ppl.users || {}).forEach(uid => {
    const u = ppl.users[uid];
    if (!u || u.centerId !== cid) return;
    const p = (ppl.progress || {})[uid] || C().normProgress(null);
    const hwSaved = Object.values(p.hwAt || {}).filter(t => inRange(t, r)).length;
    const hwDone = Object.values(p.hwDone || {}).filter(t => inRange(Number(t), r)).length;
    const days = Object.keys(p.days || {}).filter(k => { const t = Date.parse(String(k).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")); return !isNaN(t) && t >= r.from && t < r.to; }).length;   // keys are YYYYMMDD
    const active = hwSaved > 0 || days > 0 || inRange(p.lastSeen, r) || inRange(u.lastActive, r);
    rows.push({ uid, name: u.name || u.email || "—", email: u.email || "", role: u.role, status: u.status, teacherId: u.teacherId || "", active, hwSaved, hwDone, days, xp: p.xp || 0, lastSeen: p.lastSeen || 0 });
  });
  const students = rows.filter(x => x.role === "student" && x.status !== "restricted");
  return { rows, students, teachers: rows.filter(x => x.role === "teacher" || x.role === "admin"),
    active: students.filter(x => x.active).length, hwSaved: students.reduce((a, x) => a + x.hwSaved, 0), hwDone: students.reduce((a, x) => a + x.hwDone, 0) };
}
function csv(c, u, r){
  const nameOf = id => { const x = u.rows.find(y => y.uid === id); return x ? x.name : ""; };
  const lines = [["center", "month", "name", "email", "role", "teacher", "active", "homework saved", "homework done", "practice days", "xp", "last seen"]]
    .concat(u.rows.map(x => [c.name, r.label, x.name, x.email, x.role, nameOf(x.teacherId), x.active ? "yes" : "no", x.hwSaved, x.hwDone, x.days, x.xp, x.lastSeen ? new Date(x.lastSeen).toISOString().slice(0, 10) : ""]));
  const text = "﻿" + lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = `speakup-${(c.name || "center").replace(/[^\w-]+/g, "-")}-${new Date(r.from).toISOString().slice(0, 7)}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- screens ---------- */
function draw(target, q, force){
  el = target; query = q || "";
  if (!force && el.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const me = C();
  if (me.isManager && !centersOff) centersOff = me.watchCenters(v => { centers = v; redraw(); });
  const cid = me.isManager ? new URLSearchParams(query).get("c") : me.centerId;
  if (cid && (me.isManager || me.isAdmin) && invitesFor !== cid){
    if (invitesOff) invitesOff();
    invitesFor = cid; invites = {};
    invitesOff = me.watchCenterInvites(cid, v => { invites = v; redraw(); });
  }
  if (me.isManager && !cid) return drawList();
  const c = me.isManager ? centers[cid] : me.center;
  if (!c) { el.innerHTML = `<section class="panel"><p class="panel-sub">${L("Yuklanmoqda…", "Loading…")}</p></section>`; return; }
  if (!me.isManager && !me.isAdmin) return drawTeacher(c);
  drawCenter(cid, c);
}

function drawList(){
  const r = monthRange(0), ids = Object.keys(centers).sort((a, b) => (centers[a].name || "").localeCompare(centers[b].name || ""));
  let mrr = 0;
  const rows = ids.map(id => {
    const c = centers[id], st = status(c), u = usage(id, r);
    if (!c.pilot && st.left > 0) mrr += planPrice(c.plan);
    return `<tr><td><a href="#/settings/center?c=${id}"><b>${esc(c.name)}</b></a><br><small>${esc(c.contact || "")} ${esc(c.phone || "")}</small></td>
      <td><span class="c-pill ${st.cls}">${st.label}</span><br><small>${fmtDate(c.paidUntil)}</small></td>
      <td>${planLabel(c.plan)}<br><small>${som(planPrice(c.plan))}</small></td>
      <td><b>${u.active}</b> / ${u.students.length}<br><small>${u.teachers.filter(x => x.role === "teacher").length} ${L("oʻqituvchi", "teachers")}</small></td>
      <td>${u.hwSaved}</td></tr>`;
  }).join("");
  el.innerHTML = `
  <section class="panel">
    <div class="panel-head-row"><div><h2>${L("Oʻquv markazlari", "Learning centers")} (${ids.length})</h2>
      <p class="panel-sub">${L("Har bir markaz oʻz admini, oʻqituvchilari va oʻquvchilari bilan. Muddat tugasa, markaz hisoblari avtomatik yopiladi.", "Each center has its own admin, teachers and pupils. When the paid period ends, the center's accounts lock automatically.")}</p></div>
      <button class="btn btn-accent btn-sm" data-new-center>+ ${L("Yangi markaz", "New center")}</button></div>
    <div class="c-kpis">
      <div class="c-kpi"><b>${som(mrr)}</b><small>${L("oylik daromad (toʻlaganlar)", "monthly revenue (paying)")}</small></div>
      <div class="c-kpi"><b>${ids.filter(id => centers[id].pilot && status(centers[id]).left > 0).length}</b><small>${L("sinovda", "on pilot")}</small></div>
      <div class="c-kpi"><b>${ids.filter(id => status(centers[id]).left <= 5).length}</b><small>${L("5 kun ichida toʻlov / tugagan", "due within 5 days / expired")}</small></div>
    </div>
    ${ids.length ? `<div class="c-table-wrap"><table class="c-table"><thead><tr><th>${L("Markaz", "Center")}</th><th>${L("Holat", "Status")}</th><th>${L("Tarif", "Plan")}</th><th>${L("Faol oʻquvchi", "Active pupils")} (${esc(r.label)})</th><th>${L("Uy vazifalari", "Homework")}</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p class="panel-sub">${L("Hali markaz yoʻq. Birinchi sinov markazini qoʻshing.", "No centers yet. Add your first pilot center.")}</p>`}
  </section>`;
  el.querySelector("[data-new-center]").onclick = newCenterModal;
}

function modal(html){ const r = document.getElementById("modalRoot"); r.innerHTML = `<div class="modal-backdrop"><div class="modal-card">${html}</div></div>`; r.querySelectorAll("[data-x]").forEach(b => b.onclick = () => { r.innerHTML = ""; }); return r; }
const closeModal = () => { document.getElementById("modalRoot").innerHTML = ""; };
async function act(fn, ok){ try{ const v = await fn(); if (ok) A().toast(ok); return v; }catch(e){ alert(e.message); } }

function newCenterModal(){
  const r = modal(`<h2>${L("Yangi markaz", "New center")}</h2>
    <label class="auth-label">${L("Markaz nomi", "Center name")}</label><input class="auth-input" id="ncName" required>
    <label class="auth-label">${L("Masʼul shaxs", "Contact person")}</label><input class="auth-input" id="ncContact">
    <label class="auth-label">${L("Telefon", "Phone")}</label><input class="auth-input" id="ncPhone" inputmode="tel">
    <label class="auth-label">${L("Tarif", "Plan")}</label><select class="select" id="ncPlan">${PLANS.map(p => `<option value="${p.id}">${planLabel(p.id)} · ${som(p.price)}</option>`).join("")}</select>
    <label class="auth-label">${L("Bepul sinov (kun)", "Free pilot (days)")}</label><input class="auth-input" id="ncDays" type="number" min="1" max="90" value="30">
    <div class="modal-actions"><button class="btn btn-ghost" data-x>${L("Bekor", "Cancel")}</button><button class="btn btn-accent" data-ok>${L("Yaratish", "Create")}</button></div>`);
  r.querySelector("[data-ok]").onclick = async () => {
    const name = r.querySelector("#ncName").value.trim();
    if (!name) return r.querySelector("#ncName").focus();
    const cid = await act(() => C().createCenter({ name, contact: r.querySelector("#ncContact").value.trim(), phone: r.querySelector("#ncPhone").value.trim(),
      plan: r.querySelector("#ncPlan").value, days: r.querySelector("#ncDays").value }), L("Markaz yaratildi", "Center created"));
    if (!cid) return;
    // the center's admin code straight away, so it can be handed over at the visit
    await act(() => C().createInvite(cid, "admin"));
    closeModal(); location.hash = "#/settings/center?c=" + cid;
  };
}

function inviteRows(cid){
  const nameOf = id => { const u = (A().people && A().people.users || {})[id]; return u ? (u.name || u.email) : id === C().uid ? (C().profile.name || "") : "—"; };
  const roleL = { admin: L("Admin", "Admin"), teacher: L("Oʻqituvchi", "Teacher"), student: L("Oʻquvchi", "Pupil") };
  const codes = Object.keys(invites).sort((a, b) => (invites[b].at || 0) - (invites[a].at || 0)).filter(code => C().isManager || invites[code].role !== "admin");
  if (!codes.length) return `<p class="panel-sub">${L("Hali kod yoʻq.", "No codes yet.")}</p>`;
  return `<div class="c-codes">${codes.map(code => { const v = invites[code];
    return `<div class="c-code"><span class="c-code-val mono">${esc(code)}</span><span class="user-badge">${roleL[v.role] || v.role}</span>
      ${v.teacherId ? `<small>${L("oʻqituvchi", "teacher")}: ${esc(nameOf(v.teacherId))}</small>` : ""}
      <span class="c-code-act"><button class="btn btn-sm" data-copy-link="${esc(code)}">${L("Havolani nusxalash", "Copy link")}</button><button class="btn btn-sm btn-ghost" data-del-code="${esc(code)}" title="${L("Oʻchirish", "Switch off")}">×</button></span></div>`; }).join("")}</div>`;
}

function drawCenter(cid, c){
  const me = C(), st = status(c), sel = new URLSearchParams(query).get("m") === "prev" ? -1 : 0, r = monthRange(sel), u = usage(cid, r);
  const tier = tierFor(u.active), due = me.isManager ? planPrice(c.plan) : 0;
  // teachers first, then the admin (who may teach a group too)
  const teachersOpt = u.teachers.filter(x => x.role === "teacher").concat(u.teachers.filter(x => x.role === "admin"), me.isAdmin ? [{ uid: me.uid, name: me.profile.name || me.profile.email }] : [])
    .filter((x, i, a) => a.findIndex(y => y.uid === x.uid) === i);
  const byTeacher = u.teachers.filter(t => t.role === "teacher" || u.students.some(s => s.teacherId === t.uid)).map(t => ({ t, n: u.students.filter(s => s.teacherId === t.uid).length, a: u.students.filter(s => s.teacherId === t.uid && s.active).length }));
  const pays = Object.values(c.payments || {}).sort((a, b) => b.at - a.at);
  el.innerHTML = `
  ${me.isManager ? `<nav class="crumbs"><a href="#/settings/center">${L("Markazlar", "Centers")}</a><span>›</span><span>${esc(c.name)}</span></nav>` : ""}
  <section class="panel">
    <div class="panel-head-row"><div><h2>${esc(c.name)}</h2>
      <p class="panel-sub"><span class="c-pill ${st.cls}">${st.label}</span> · ${L("muddat", "paid until")} <b>${fmtDate(c.paidUntil)}</b> · ${planLabel(c.plan)}${me.isManager ? " · " + som(planPrice(c.plan)) + L("/oy", "/month") : ""}</p>
      ${me.isManager && (c.contact || c.phone) ? `<p class="panel-sub">${esc(c.contact || "")} ${c.phone ? `· <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}</p>` : ""}</div>
      ${me.isManager ? `<div class="c-actions"><button class="btn btn-accent btn-sm" data-paid>${L("Toʻlov qabul qilindi", "Payment received")}</button><button class="btn btn-sm" data-edit-center>${L("Tahrirlash", "Edit")}</button></div>` : ""}</div>
    ${me.isAdmin && st.left <= 5 ? `<p class="c-warn">${st.left > 0 ? L(`Obuna ${st.left} kundan keyin tugaydi. Darslar toʻxtab qolmasligi uchun toʻlovni oldindan qiling.`, `The subscription ends in ${st.left} days. Pay ahead so lessons don't stop.`) : ""}</p>` : ""}
  </section>

  <section class="panel">
    <div class="panel-head-row"><div><h2>${L("Taklif kodlari", "Invite codes")}</h2>
      <p class="panel-sub">${L("Kod bilan roʻyxatdan oʻtgan kishi darhol shu markazga qoʻshiladi — tasdiqlash shart emas. Havolani Telegram guruhiga yuboring.", "Anyone who signs up with a code joins this center straight away, no approval needed. Send the link to the group's Telegram chat.")}</p></div></div>
    <div class="c-new-code">
      ${me.isManager ? `<button class="btn btn-sm" data-new-code="admin">+ ${L("Admin kodi", "Admin code")}</button>` : ""}
      <button class="btn btn-sm" data-new-code="teacher">+ ${L("Oʻqituvchi kodi", "Teacher code")}</button>
      <span class="c-stu-code"><select class="select" id="codeTeacher">${teachersOpt.map(t => `<option value="${t.uid}">${esc(t.name)}</option>`).join("")}</select>
      <button class="btn btn-sm" data-new-code="student" ${teachersOpt.length ? "" : "disabled"}>+ ${L("Oʻquvchi kodi", "Pupil code")}</button></span>
    </div>
    ${teachersOpt.length ? "" : `<p class="panel-sub">${L("Oʻquvchi kodi oʻqituvchiga bogʻlanadi: avval oʻqituvchi kodini yarating.", "A pupil code belongs to a teacher: create a teacher code first.")}</p>`}
    ${inviteRows(cid)}
  </section>

  <section class="panel">
    <div class="panel-head-row"><div><h2>${L("Oylik hisobot", "Monthly report")} · ${esc(r.label)}</h2>
      <p class="panel-sub">${L("Faol oʻquvchi — shu oyda kirgan, mashq qilgan yoki uy vazifasi yozgan.", "Active pupil: signed in, practised or wrote homework this month.")}</p></div>
      <div class="c-actions"><div class="lang-switch filter-switch"><button data-month="cur" class="${sel ? "" : "active"}">${L("Shu oy", "This month")}</button><button data-month="prev" class="${sel ? "active" : ""}">${L("Oʻtgan oy", "Last month")}</button></div>
      <button class="btn btn-sm" data-csv>CSV</button></div></div>
    <div class="c-kpis">
      <div class="c-kpi"><b>${u.active}</b><small>${L("faol oʻquvchi", "active pupils")} / ${u.students.length}</small></div>
      <div class="c-kpi"><b>${u.hwSaved}</b><small>${L("uy vazifasi yozildi", "homework written")}</small></div>
      <div class="c-kpi"><b>${u.hwDone}</b><small>${L("uy vazifasi tekshirildi", "homework checked")}</small></div>
      <div class="c-kpi"><b>${u.teachers.filter(x => x.role === "teacher").length}</b><small>${L("oʻqituvchi", "teachers")}</small></div>
    </div>
    ${byTeacher.length ? `<div class="c-table-wrap"><table class="c-table"><thead><tr><th>${L("Oʻqituvchi", "Teacher")}</th><th>${L("Oʻquvchilar", "Pupils")}</th><th>${L("Faol", "Active")}</th></tr></thead><tbody>
      ${byTeacher.map(x => `<tr><td>${esc(x.t.name)}</td><td>${x.n}</td><td>${x.a}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${me.isManager ? `<p class="c-bill">${L("Hisob-faktura", "To invoice")}: <b>${som(due)}</b> (${planLabel(c.plan)})${tier.id !== c.plan ? ` · <span class="c-warn">${L("Faol oʻquvchilar soni boshqa tarifga toʻgʻri keladi", "Active pupils fit a different plan")}: ${planLabel(tier.id)} — ${som(tier.price)}</span>` : ""}</p>` : ""}
  </section>

  ${me.isManager && pays.length ? `<section class="panel"><h2>${L("Toʻlovlar", "Payments")}</h2><div class="c-table-wrap"><table class="c-table"><tbody>
    ${pays.map(p => `<tr><td>${fmtDate(p.at)}</td><td>${som(p.amount || 0)}</td><td>+${p.days} ${L("kun", "days")} → ${fmtDate(p.until)}</td><td>${esc(p.note || "")}</td></tr>`).join("")}</tbody></table></div></section>` : ""}`;

  const q = (s, f) => el.querySelectorAll(s).forEach(f);
  q("[data-new-code]", b => b.onclick = async () => {
    const role = b.dataset.newCode, tid = role === "student" ? el.querySelector("#codeTeacher").value : null;
    const code = await act(() => C().createInvite(cid, role, tid), L("Kod yaratildi", "Code created"));
    if (code) copy(C().inviteLink(code));
  });
  q("[data-copy-link]", b => b.onclick = () => copy(C().inviteLink(b.dataset.copyLink)));
  q("[data-del-code]", b => b.onclick = () => { if (confirm(L("Bu kod oʻchirilsinmi? U bilan endi roʻyxatdan oʻtib boʻlmaydi (oldin kirganlar qoladi).", "Switch this code off? Nobody new can sign up with it (people who already joined stay)."))) act(() => C().deleteInvite(cid, b.dataset.delCode)); });
  q("[data-month]", b => b.onclick = () => { history.replaceState(null, "", "#/settings/center?" + (me.isManager ? "c=" + cid + "&" : "") + "m=" + b.dataset.month); query = (me.isManager ? "c=" + cid + "&" : "") + "m=" + b.dataset.month; redraw(); });
  q("[data-csv]", b => b.onclick = () => csv(c, u, r));
  q("[data-paid]", b => b.onclick = () => paidModal(cid, c));
  q("[data-edit-center]", b => b.onclick = () => editModal(cid, c));
}

function copy(text){
  const done = () => A().toast(L("Havola nusxalandi", "Link copied"));
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt(L("Havola:", "Link:"), text)); else prompt(L("Havola:", "Link:"), text);
}

function paidModal(cid, c){
  const r = modal(`<h2>${L("Toʻlov qabul qilindi", "Payment received")}</h2><p class="panel-sub">${esc(c.name)} · ${L("hozirgi muddat", "currently until")} ${fmtDate(c.paidUntil)}</p>
    <label class="auth-label">${L("Necha oy", "Months")}</label><select class="select" id="pdMonths"><option value="1">1</option><option value="3">3</option><option value="6">6</option><option value="12">12</option></select>
    <label class="auth-label">${L("Summa (soʻm)", "Amount (so'm)")}</label><input class="auth-input" id="pdAmount" type="number" min="0" step="1000" value="${planPrice(c.plan)}">
    <label class="auth-label">${L("Izoh (masalan: Click, naqd, bank)", "Note (e.g. Click, cash, bank)")}</label><input class="auth-input" id="pdNote">
    <div class="modal-actions"><button class="btn btn-ghost" data-x>${L("Bekor", "Cancel")}</button><button class="btn btn-accent" data-ok>${L("Muddatni uzaytirish", "Extend")}</button></div>`);
  const m = r.querySelector("#pdMonths"), a = r.querySelector("#pdAmount");
  m.onchange = () => { a.value = planPrice(c.plan) * Number(m.value); };
  r.querySelector("[data-ok]").onclick = async () => {
    const until = await act(() => C().addPaidDays(cid, 30 * Number(m.value), a.value, r.querySelector("#pdNote").value.trim()));
    if (until){ closeModal(); A().toast(L("Muddat: ", "Paid until: ") + fmtDate(until)); }
  };
}
function editModal(cid, c){
  const r = modal(`<h2>${L("Markazni tahrirlash", "Edit center")}</h2>
    <label class="auth-label">${L("Markaz nomi", "Center name")}</label><input class="auth-input" id="ecName" value="${esc(c.name || "")}">
    <label class="auth-label">${L("Masʼul shaxs", "Contact person")}</label><input class="auth-input" id="ecContact" value="${esc(c.contact || "")}">
    <label class="auth-label">${L("Telefon", "Phone")}</label><input class="auth-input" id="ecPhone" value="${esc(c.phone || "")}">
    <label class="auth-label">${L("Tarif", "Plan")}</label><select class="select" id="ecPlan">${PLANS.map(p => `<option value="${p.id}" ${p.id === c.plan ? "selected" : ""}>${planLabel(p.id)} · ${som(p.price)}</option>`).join("")}</select>
    <label class="auth-label">${L("Muddat (sana)", "Paid until (date)")}</label><input class="auth-input" id="ecUntil" type="date" value="${new Date(c.paidUntil || Date.now()).toISOString().slice(0, 10)}">
    <div class="modal-actions"><button class="btn btn-ghost" data-x>${L("Bekor", "Cancel")}</button><button class="btn btn-accent" data-ok>${L("Saqlash", "Save")}</button></div>`);
  r.querySelector("[data-ok]").onclick = async () => {
    const d = r.querySelector("#ecUntil").value, until = d ? new Date(d + "T23:59:59").getTime() : c.paidUntil;
    await act(() => C().updateCenter(cid, { name: r.querySelector("#ecName").value.trim() || c.name, contact: r.querySelector("#ecContact").value.trim(),
      phone: r.querySelector("#ecPhone").value.trim(), plan: r.querySelector("#ecPlan").value, paidUntil: until }), L("Saqlandi", "Saved"));
    closeModal();
  };
}

function drawTeacher(c){
  const st = status(c);
  if (!myCode && !myCodeBusy){
    myCodeBusy = true;
    C().myStudentInvite().then(code => { myCode = code; myCodeBusy = false; redraw(); }, e => { myCodeBusy = false; console.warn(e); });
  }
  el.innerHTML = `<section class="panel"><h2>${L("Oʻquvchilaringiz uchun taklif kodi", "Invite code for your pupils")}</h2>
    <p class="panel-sub">${esc(c.name)} · <span class="c-pill ${st.cls}">${st.label}</span></p>
    <p class="panel-sub">${L("Havolani sinf Telegram guruhiga yuboring. Kod bilan roʻyxatdan oʻtgan oʻquvchi darhol sizning sinfingizga qoʻshiladi.", "Send the link to your class's Telegram group. A pupil who signs up with it joins your class straight away.")}</p>
    ${myCode ? `<div class="c-code c-code-big"><span class="c-code-val mono">${esc(myCode)}</span><button class="btn btn-accent btn-sm" data-copy-mine>${L("Havolani nusxalash", "Copy link")}</button></div>
      <p class="panel-sub mono c-link">${esc(C().inviteLink(myCode))}</p>` : `<p class="panel-sub">${L("Yuklanmoqda…", "Loading…")}</p>`}
  </section>`;
  const b = el.querySelector("[data-copy-mine]"); if (b) b.onclick = () => copy(C().inviteLink(myCode));
}

window.SP1Centers = { draw, PLANS, usage, monthRange };
})();
