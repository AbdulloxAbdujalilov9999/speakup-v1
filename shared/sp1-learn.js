/* SpeakUp-1 — interactive learning for the v2 course ("English from Zero v2").
 * Everything here is built from data/course-v2.js (course_v2.json):
 *   #/practice/N[/A..H|words|rules|exit]   a lesson's self-checking practice
 *   #/review                                today's spaced-repetition review
 *   #/check/K                               a progress check as a timed test
 *   #/me                                    XP, streak, badges, class leaderboard
 *   #/dashboard                             teacher dashboard + CSV export
 *   #/game/P  (teacher)  #/play (pupil)     live "Savol-ball" (Jeopardy) game
 * A pupil's practice lives next to their homework in sp1/progress/{uid}
 * (xp, days, badges, px, srs, wrong, chk, game), so no new database rules are
 * needed. The leaderboard and the live game are published by staff under
 * sp1/open/_lb and sp1/open/_game (readable by every signed-in user). */
(function(){
"use strict";

const A = () => window.SP1App;
const C = () => window.SP1Cloud;
const course = () => window.SU1C || null;
const L = (uz, en) => (A() && A().lang() === "en" ? en : uz);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const $app = () => document.getElementById("app");
const LETTERS = "ABCDEFGH";
const lessonData = n => course() && course().lessons.find(l => l.n === +n);
const checkData = k => course() && course().checks.find(c => c.k === +k);
const P = () => A().progress;
const isStaff = () => A().isStaff();
const toast = m => A().toast(m);
const icon = (n, s) => A().I(n, s);

/* ---------------- answers: normalise and compare ----------------
 * Accept every alternative separated by " / ", ignore case, extra spaces,
 * final punctuation and ’ vs '. True/false keys are "T" or "F – correction". */
function norm(s){
  return String(s == null ? "" : s).toLowerCase()
    .replace(/[’‘`ʼ´′ʻ]/g, "'").replace(/[“”«»"]/g, "").replace(/[–—−]/g, "-")
    .replace(/\s*(…|\.\.\.)\s*/g, " ").replace(/\s+/g, " ").replace(/\s+([?!.,;:])/g, "$1").trim()
    .replace(/[\s.!?,;:]+$/g, "").trim();
}
function alts(a){
  const s = String(a == null ? "" : a).trim();
  const parts = s.split(/\s+\/\s+/).map(x => x.trim()).filter(Boolean);
  return parts.length > 1 ? [s].concat(parts) : [s];
}
const firstAlt = a => alts(a)[alts(a).length > 1 ? 1 : 0];
/* true / false, or null when only the teacher can tell (a bare "F" without the correction) */
function check(a, ans){
  const v = norm(ans); if (!v) return false;
  const s = String(a == null ? "" : a).trim();
  const f = s.match(/^F\s*[–-]\s*(.+)$/);
  if (f){
    if (v === "f" || v === "false") return null;
    const vv = v.replace(/^f\s*-?\s*/, "");
    return alts(f[1]).some(x => norm(x) === v || norm(x) === vv);
  }
  if (/^T$/i.test(s)) return ["t", "true", "to'g'ri", "togri"].includes(v);
  if (/^F$/i.test(s)) return ["f", "false", "noto'g'ri", "notogri"].includes(v);
  return alts(s).some(x => norm(x) === v);
}
const fillBlank = (q, a) => String(q || "").replace(/_{3,}/, firstAlt(a));
const isUz = s => { const x = String(s || ""); return /ʻ|ʼ/.test(x) || /q(?!u)/i.test(x) || /\b(va|men|sen|biz|ular|bilan|uchun|emas|nima|qanday|qayerda|juda|kerak|bormi|yoki|bola)\b/i.test(x); };

/* seeded shuffle, so a page looks the same after a redraw */
function seeded(seed){ let x = seed % 2147483647; if (x <= 0) x += 2147483646; return () => (x = x * 16807 % 2147483647) / 2147483647; }
function shuffle(arr, seed){ const a = arr.slice(), r = seeded(seed || 1); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------------- audio: Web Speech API, en-GB ---------------- */
let voice = null;
function pickVoice(){
  try{
    const vs = speechSynthesis.getVoices();
    voice = vs.find(v => /en[-_]GB/i.test(v.lang) && /google|natural|online/i.test(v.name)) || vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
  }catch(e){}
}
if ("speechSynthesis" in window){ pickVoice(); try{ speechSynthesis.addEventListener("voiceschanged", pickVoice); }catch(e){} }
const slow = () => !!(A() && A().settings.slowAudio);
function speak(text){
  if (!("speechSynthesis" in window)) return toast(L("Bu brauzerda ovoz yoʻq", "No speech in this browser"));
  const tx = String(text || "").replace(/_{3,}/g, " … ").replace(/→/g, ", ").replace(/\s\/\s/g, ", ").replace(/[«»“”]/g, "");
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(tx);
    u.lang = "en-GB"; if (voice) u.voice = voice; u.rate = slow() ? 0.62 : 0.92;
    speechSynthesis.speak(u);
  }catch(e){}
}
const SPK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14"/></svg>';
const say = text => text ? `<button type="button" class="say" data-say="${esc(text)}" title="${L("Tinglash", "Listen")}" aria-label="${L("Tinglash", "Listen")}">${SPK}</button>` : "";
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-say]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  speak(b.dataset.say); b.classList.add("on"); setTimeout(() => b.classList.remove("on"), 700);
});
function slowBtn(){ return `<button type="button" class="chip slow-btn${slow() ? " on" : ""}" id="slowBtn" title="${L("Sekin oʻqish", "Slower audio")}">🐢 ${L("Sekin", "Slow")}</button>`; }
function bindSlow(root){
  const b = (root || document).querySelector("#slowBtn"); if (!b) return;
  b.onclick = () => { A().settings.slowAudio = !slow(); A().saveSettings(); b.classList.toggle("on", slow()); toast(slow() ? L("Sekin ovoz", "Slow audio") : L("Oddiy tezlik", "Normal speed")); };
}

/* ---------------- days, XP, streak, badges ---------------- */
const dayNum = ts => { const d = ts ? new Date(ts) : new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };
const dayKey = dn => new Date(dn * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
const today = () => dayNum();

/* changes → cloud: only the changed paths, debounced */
const dirty = {}; let syncT = null;
function mark(path, val){
  dirty[path] = val === undefined ? null : val;
  A().saveProgress();
  clearTimeout(syncT); syncT = setTimeout(flush, 1200);
}
function flush(){
  clearTimeout(syncT); syncT = null;
  const u = Object.assign({}, dirty); Object.keys(dirty).forEach(k => delete dirty[k]);
  if (Object.keys(u).length && C() && C().uid) C().savePractice(u);
}
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

function ensure(){
  const p = P();
  ["days", "badges", "px", "srs", "wrong", "chk"].forEach(k => { if (!p[k] || typeof p[k] !== "object") p[k] = {}; });
  if (typeof p.xp !== "number") p.xp = 0;
  return p;
}
function streakOf(p){
  const d0 = p.days || {}; let d = today(), s = 0;
  if (!d0[dayKey(d)]) d--;
  while (d0[dayKey(d)]){ s++; d--; }
  return s;
}
function weekXp(p){ let s = 0; for (let i = 0; i < 7; i++) s += (p.days || {})[dayKey(today() - i)] || 0; return s; }
function addXp(n){
  if (!n) return;
  const p = ensure(), k = dayKey(today());
  p.xp = (p.xp || 0) + n; p.days[k] = (p.days[k] || 0) + n;
  mark("xp", p.xp); mark("days/" + k, p.days[k]);
  const old = Object.keys(p.days).sort(); while (old.length > 70){ const o = old.shift(); delete p.days[o]; mark("days/" + o, null); }
  floatXp(n); checkBadges(); refreshNavBadge();
}
function floatXp(n){
  const el = document.createElement("div"); el.className = "xp-float"; el.textContent = "+" + n + " XP";
  document.body.appendChild(el); setTimeout(() => el.remove(), 1300);
}
const lessonsDone = p => Object.keys(p.px || {}).filter(n => p.px[n] && p.px[n].x).length;
const wordsLearned = p => Object.keys(p.srs || {}).filter(id => id[0] === "w" && (p.srs[id] || [])[0] >= 2).length;
const BADGES = [
  ["first", "🎯", "Birinchi qadam", "First step", p => (p.xp || 0) > 0],
  ["l5", "📘", "5 dars", "5 lessons", p => lessonsDone(p) >= 5],
  ["l10", "📚", "10 dars", "10 lessons", p => lessonsDone(p) >= 10],
  ["l30", "🎓", "30 dars", "30 lessons", p => lessonsDone(p) >= 30],
  ["w100", "🧠", "100 soʻz", "100 words", p => wordsLearned(p) >= 100],
  ["w300", "💡", "300 soʻz", "300 words", p => wordsLearned(p) >= 300],
  ["s7", "🔥", "7 kun ketma-ket", "7-day streak", p => streakOf(p) >= 7],
  ["s30", "🏆", "30 kun ketma-ket", "30-day streak", p => streakOf(p) >= 30],
  ["x1000", "⭐", "1000 XP", "1000 XP", p => (p.xp || 0) >= 1000],
  ["exit5", "✅", "Mukammal chipta", "Perfect exit ticket", p => Object.values(p.px || {}).some(x => x && x.x && x.x.c === x.x.t && x.x.t)],
  ["chk90", "🏅", "Nazorat 90%+", "Check 90%+", p => Object.values(p.chk || {}).some(c => c && (c.best || 0) >= 0.9)],
];
function checkBadges(){
  const p = ensure();
  BADGES.forEach(([id, ic, uz, en, test]) => {
    if (p.badges[id]) return;
    let ok = false; try{ ok = test(p); }catch(e){}
    if (ok){ p.badges[id] = Date.now(); mark("badges/" + id, p.badges[id]); setTimeout(() => toast(`${ic} ${L("Yangi nishon", "New badge")}: ${L(uz, en)}`), 900); }
  });
}

/* ---------------- spaced repetition (Leitner boxes: 1, 2, 4, 7, 15 days) ----------------
 * srs[id] = [box, dueDay]. Words: "w{lesson}-{i}". Practice items: "{lesson}-{ex}-{i}",
 * exit ticket: "{lesson}-x-{i}", progress checks: "k{k}-{section}-{i}". */
const INT = [0, 1, 2, 4, 7, 15];
function srsAdd(id){ const p = ensure(); if (!p.srs[id]){ p.srs[id] = [0, today()]; mark("srs/" + id, p.srs[id]); } }
function srsWrong(id){
  const p = ensure(); p.srs[id] = [1, today()]; mark("srs/" + id, p.srs[id]);
  p.wrong[id] = (p.wrong[id] || 0) + 1; mark("wrong/" + id, p.wrong[id]);
}
function srsReview(id, ok){
  const p = ensure(), cur = p.srs[id] || [0, today()];
  const b = ok ? Math.min(5, (cur[0] || 0) + 1) : 1;
  p.srs[id] = [b, today() + (ok ? INT[b] : 1)]; mark("srs/" + id, p.srs[id]);
  if (!ok){ p.wrong[id] = (p.wrong[id] || 0) + 1; mark("wrong/" + id, p.wrong[id]); }
}
function seedWords(n){
  const l = lessonData(n); if (!l) return;
  const p = ensure(); let added = false;
  l.vocab.forEach((w, i) => { const id = "w" + n + "-" + i; if (!p.srs[id]){ p.srs[id] = [0, today()]; mark("srs/" + id, p.srs[id]); added = true; } });
  if (added) refreshNavBadge();
}
function dueList(){
  const p = ensure(), t = today();
  const all = Object.keys(p.srs).filter(id => resolve(id)).map(id => ({ id, b:p.srs[id][0] || 0, d:p.srs[id][1] || 0 }));
  const due = all.filter(x => x.d <= t).sort((a, b) => (a.id[0] === "w") - (b.id[0] === "w") || a.d - b.d || a.b - b.b);
  let list = due.slice(0, 15);
  if (list.length < 10) list = list.concat(all.filter(x => x.d > t).sort((a, b) => a.d - b.d).slice(0, 10 - list.length));
  return { list, dueN: due.length };
}
const dueCount = () => { try{ return course() && P() ? Math.min(15, dueList().dueN) : 0; }catch(e){ return 0; } };
function refreshNavBadge(){ const b = document.getElementById("revBadge"); if (b){ const n = dueCount(); b.textContent = n; b.hidden = !n; } }

/* an item from its id → { kind, type, q, uz, a, options, box, from } */
function resolve(id){
  const c = course(); if (!c) return null;
  let m = id.match(/^w(\d+)-(\d+)$/);
  if (m){ const l = lessonData(+m[1]); const w = l && l.vocab[+m[2]]; if (!w) return null;
    const hook = (l.vocabHooks || []).find(h => norm(h[0]) === norm(w[0]));
    return { kind:"word", lesson:l.n, en:w[0], uz:w[1], hook:hook ? hook[1] : "", pool:l.vocab.map(x => x[0]), poolUz:l.vocab.map(x => x[1]) }; }
  m = id.match(/^(\d+)-x-(\d+)$/);
  if (m){ const l = lessonData(+m[1]); const it = l && l.exit[+m[2]]; return it ? Object.assign({ kind:"item", type:"gap", lesson:l.n, src:L("Chiqish chiptasi", "Exit ticket") }, it) : null; }
  m = id.match(/^(\d+)-(\d+)-(\d+)$/);
  if (m){ const l = lessonData(+m[1]); const ex = l && l.exercises[+m[2]]; const it = ex && ex.items[+m[3]];
    return it ? Object.assign({ kind:"item", type:ex.type, lesson:l.n, box:ex.box, pool:ex.items.map(x => x.a), src:`${L("Mashq", "Exercise")} ${LETTERS[+m[2]]}` }, it) : null; }
  m = id.match(/^k(\d+)-(\d+)-(\d+)$/);
  if (m){ const k = checkData(+m[1]); const s = k && k.sections[+m[2]]; const it = s && s.items[+m[3]];
    return it ? Object.assign({ kind:"item", type:s.type, check:k.k, lesson:k.covers[0], box:s.box, pool:s.items.map(x => x.a), src:k.titleUz }, it) : null; }
  return null;
}

/* ---------------- one exercise item ---------------- */
const gapHtml = q => esc(q).replace(/_{3,}/g, '<span class="gapline">&nbsp;</span>');
/* mount an item into box. opts: {num, live (instant feedback), onAnswer(ok, value), xp} → { value(), grade(), reveal() } */
function mountItem(box, it, opts){
  opts = opts || {};
  const type = it.type, n = opts.num;
  const enQ = type !== "translate" && type !== "order" && !isUz(it.q);
  let done = false, val = "";
  const qtext = type === "order" ? "" : gapHtml(it.q);
  box.className = "it it-" + type;
  box.innerHTML = `
    <div class="it-q">${n ? `<span class="it-n">${n}</span>` : ""}<span class="it-text">${type === "order" ? `<span class="it-uz-main">${esc(it.uz || "")}</span>` : qtext}</span>${enQ ? say(it.q) : ""}</div>
    ${it.uz && type !== "order" ? `<div class="it-uz">${esc(it.uz)}</div>` : ""}
    <div class="it-ctl"></div>
    <div class="it-fb" hidden></div>`;
  const ctl = box.querySelector(".it-ctl"), fb = box.querySelector(".it-fb");
  const full = () => {
    if (it.en) return it.en;
    if (type === "truefalse"){ const m = String(it.a).match(/^F\s*[–-]\s*(.+)$/); return m ? firstAlt(m[1]) : it.q; }
    if ((type === "gap" || type === "choose") && /_{3,}/.test(it.q)) return fillBlank(it.q, it.a);
    return firstAlt(it.a);
  };
  const sayFull = () => { const f = full(); return isUz(f) ? "" : say(f); };
  function finish(ok, v){
    if (done) return; done = true; val = v;
    box.classList.add(ok ? "ok" : "bad");
    if (opts.live !== false) reveal(ok);
    if (opts.onAnswer) opts.onAnswer(ok, v);
  }
  function reveal(ok){
    if (ok === undefined) ok = grade();
    box.classList.toggle("ok", ok === true); box.classList.toggle("bad", ok !== true);
    const fs = full();
    const gl = box.querySelector(".gapline");
    if (gl && (type === "choose" || type === "gap")){ gl.textContent = ok === true ? val : firstAlt(it.a); gl.classList.add(ok === true ? "g-ok" : "g-fix"); }
    fb.hidden = false;
    fb.innerHTML = ok === true
      ? `<span class="fb-ok">✓ ${L("Toʻgʻri!", "Correct!")}${opts.xp ? ` <b>+${opts.xp} XP</b>` : ""}</span>${sayFull()}`
      : `<span class="fb-bad">✗ ${val && type !== "choose" && type !== "truefalse" ? `<s>${esc(val)}</s> ` : ""}${L("Toʻgʻrisi", "Answer")}: <b>${esc(type === "truefalse" ? String(it.a) : firstAlt(it.a))}</b></span>${sayFull()}`;
    ctl.querySelectorAll("input,button,textarea").forEach(x => { if (!x.classList.contains("say")) x.disabled = true; });
  }
  function grade(){
    if (type === "choose" || type === "pick") return norm(val) === norm(it.a);
    if (type === "truefalse") return !!val && (val === "T") === /^T$/i.test(String(it.a).trim());
    return check(it.a, val) === true;
  }
  if (type === "choose" || type === "pick"){
    const opts2 = it.options || [];
    ctl.innerHTML = `<div class="opt-row">${opts2.map(o => `<button type="button" class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
    ctl.querySelectorAll(".opt").forEach(b => b.onclick = () => {
      if (done) return;
      ctl.querySelectorAll(".opt").forEach(x => x.classList.remove("sel")); b.classList.add("sel"); val = b.dataset.v;
      if (opts.live === false){ if (opts.onAnswer) opts.onAnswer(null, val); return; }
      const ok = norm(val) === norm(it.a);
      b.classList.add(ok ? "right" : "wrong");
      if (!ok) ctl.querySelectorAll(".opt").forEach(x => { if (norm(x.dataset.v) === norm(it.a)) x.classList.add("right"); });
      finish(ok, val);
    });
  } else if (type === "truefalse"){
    ctl.innerHTML = `<div class="opt-row tf"><button type="button" class="opt" data-v="T">T · ${L("Toʻgʻri", "True")}</button><button type="button" class="opt" data-v="F">F · ${L("Notoʻgʻri", "False")}</button></div>`;
    ctl.querySelectorAll(".opt").forEach(b => b.onclick = () => {
      if (done) return;
      ctl.querySelectorAll(".opt").forEach(x => x.classList.remove("sel")); b.classList.add("sel"); val = b.dataset.v;
      if (opts.live === false){ if (opts.onAnswer) opts.onAnswer(null, val); return; }
      const ok = (val === "T") === /^T$/i.test(String(it.a).trim());
      b.classList.add(ok ? "right" : "wrong");
      finish(ok, val);
    });
  } else {
    const isOrder = type === "order";
    const tokens = isOrder ? shuffle(String(it.q).split(/\s*\/\s*/).filter(Boolean), (opts.seed || 7) + String(it.q).length) : [];
    ctl.innerHTML = `
      ${isOrder ? `<div class="ord-line" data-zone="line" aria-label="${L("Gap", "Sentence")}"></div><div class="ord-pool" data-zone="pool">${tokens.map((w, i) => `<button type="button" class="chip-w" data-chip="${i}">${esc(w)}</button>`).join("")}</div>` : ""}
      ${it.box && it.box.length && type === "gap" ? `<div class="box-row">${it.box.map(w => `<button type="button" class="chip-w box-w" data-fill="${esc(w)}">${esc(w)}</button>`).join("")}</div>` : ""}
      <div class="in-row"><input class="it-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="${type === "translate" ? L("Inglizcha yozing…", "Write in English…") : isOrder ? L("Soʻzlarni bosing yoki yozing…", "Tap the words or type…") : L("Javobingiz…", "Your answer…")}">
      ${opts.live === false ? "" : `<button type="button" class="btn btn-accent btn-sm it-go">${L("Tekshirish", "Check")}</button>`}</div>`;
    const inp = ctl.querySelector(".it-in");
    const submit = () => { if (done) return; const v = inp.value.trim(); if (!v) { inp.focus(); return; } val = v; finish(grade(), v); };
    inp.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); if (opts.live === false){ const nx = box.parentElement && box.parentElement.querySelectorAll(".it-in"); const arr = nx ? [...nx] : []; const j = arr.indexOf(inp); if (arr[j + 1]) arr[j + 1].focus(); else inp.blur(); } else submit(); } });
    inp.addEventListener("input", () => { val = inp.value; if (opts.live === false && opts.onAnswer) opts.onAnswer(null, val); });
    const go = ctl.querySelector(".it-go"); if (go) go.onclick = submit;
    ctl.querySelectorAll("[data-fill]").forEach(b => b.onclick = () => { if (done) return; inp.value = b.dataset.fill; val = inp.value; if (opts.live === false){ if (opts.onAnswer) opts.onAnswer(null, val); } else submit(); });
    if (isOrder){
      const line = ctl.querySelector(".ord-line"), pool = ctl.querySelector(".ord-pool");
      const sync = () => { const t = [...line.querySelectorAll("[data-chip]")].map(x => x.textContent).join(" ").replace(/\s+([?!.,])/g, "$1"); inp.value = t.charAt(0).toUpperCase() + t.slice(1); val = inp.value; if (opts.live === false && opts.onAnswer) opts.onAnswer(null, val); };
      dragChips(ctl, {
        tap: chip => { if (done) return; (chip.parentElement === line ? pool : line).appendChild(chip); sync(); },
        drop: (chip, zone, x) => {
          if (done) return;
          if (zone === pool){ pool.appendChild(chip); return sync(); }
          const kids = [...line.querySelectorAll("[data-chip]")].filter(k => k !== chip);
          const before = kids.find(k => { const r = k.getBoundingClientRect(); return x < r.left + r.width / 2; });
          line.insertBefore(chip, before || null); sync();
        },
      });
    }
  }
  return { get value(){ return val; }, set value(v){ val = v; }, grade, reveal, get done(){ return done; } };
}

/* tap or drag word chips between zones ([data-zone] containers, [data-chip] buttons) */
function dragChips(root, h){
  root.addEventListener("pointerdown", e => {
    const chip = e.target.closest("[data-chip]"); if (!chip || chip.disabled) return;
    const x0 = e.clientX, y0 = e.clientY; let ghost = null;
    const move = ev => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8){
        ghost = chip.cloneNode(true); ghost.classList.add("chip-ghost"); document.body.appendChild(ghost); chip.classList.add("dragging");
      }
      if (ghost){ ev.preventDefault(); ghost.style.transform = `translate(${ev.clientX - 30}px, ${ev.clientY - 22}px)`; }
    };
    const up = ev => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
      if (!ghost){ h.tap(chip); return; }
      ghost.remove(); chip.classList.remove("dragging");
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const zone = under && under.closest("[data-zone]");
      if (zone && root.contains(zone)) h.drop(chip, zone, ev.clientX, under.closest("[data-target]"));
    };
    document.addEventListener("pointermove", move, { passive:false }); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
  });
  root.addEventListener("click", e => { if (e.target.closest("[data-chip]")) e.preventDefault(); });
}

/* match: tap (or drag) a left item onto its partner on the right */
function mountMatch(box, ex, opts){
  const items = ex.items, right = shuffle(items.map((it, i) => ({ a:it.a, i })), opts.seed || 11);
  const missed = new Set(), matched = new Set();
  let sel = null;
  box.className = "match";
  box.innerHTML = `<div class="m-cols"><div class="m-col" data-zone="left">${items.map((it, i) => `<div class="m-l-wrap"><button type="button" class="m-item m-left" data-chip="${i}" data-i="${i}"><span class="m-num">${i + 1}</span>${esc(it.q)}</button>${!isUz(it.q) ? say(it.q) : ""}</div>`).join("")}</div>
    <div class="m-col" data-zone="right">${right.map((r, j) => `<button type="button" class="m-item m-right" data-target="${r.i}" data-j="${j}"><span class="m-let">${"abcdefghij"[j]}</span>${esc(r.a)}</button>`).join("")}</div></div>
    <p class="panel-sub m-help">${L("Chapdagi gapni bosing, keyin oʻngdagi juftini bosing (yoki sudrab olib boring).", "Tap a left item, then its partner on the right (or drag it).")}</p>`;
  const lefts = [...box.querySelectorAll(".m-left")], rights = [...box.querySelectorAll(".m-right")];
  const tryPair = (i, rb) => {
    if (matched.has(i) || rb.classList.contains("done")) return;
    const ok = +rb.dataset.target === i;
    const lb = lefts[i];
    if (ok){
      matched.add(i); lb.classList.add("done"); rb.classList.add("done"); lb.classList.remove("sel");
      lb.querySelector(".m-num").textContent = (i + 1) + "–" + rb.querySelector(".m-let").textContent;
      sel = null;
      opts.onItem && opts.onItem(i, !missed.has(i));
      if (matched.size === items.length) opts.onDone && opts.onDone(items.length - missed.size);
    } else {
      if (!missed.has(i)){ missed.add(i); opts.onMiss && opts.onMiss(i); }
      rb.classList.add("wrong"); lb.classList.add("wrong");
      setTimeout(() => { rb.classList.remove("wrong"); lb.classList.remove("wrong"); }, 600);
    }
  };
  dragChips(box, {
    tap: chip => { const i = +chip.dataset.i; if (matched.has(i)) return; lefts.forEach(x => x.classList.toggle("sel", x === chip && sel !== i)); sel = sel === i ? null : i; },
    drop: (chip, zone, x, target) => { if (target) tryPair(+chip.dataset.i, target); },
  });
  rights.forEach(rb => rb.addEventListener("click", () => { if (sel != null) tryPair(sel, rb); else toast(L("Avval chapdan tanlang", "Pick a left item first")); }));
}

/* ---------------- practice page ---------------- */
let cleanup = null;
function leave(){ if (cleanup){ try{ cleanup(); }catch(e){} cleanup = null; } flush(); }

function lessonGate(n){
  const l = lessonData(n);
  if (!l){ A().notFound(); return null; }
  if (!A().hasAccess("lesson-" + n)){ A().lockedView(); return null; }
  return l;
}
function pxOf(n){ const p = ensure(); return p.px[n] || {}; }
function practiceStats(n, p){
  const px = (((p || ensure()).px) || {})[n] || {}; let c = 0, t = 0, exN = 0;
  LETTERS.split("").forEach(k => { if (px[k]){ c += px[k].c; t += px[k].t; exN++; } });
  return { c, t, exN, pct:t ? c / t : 0, exit:px.x || null };
}

function viewPractice(n, tab){
  const l = lessonGate(n); if (!l) return;
  if (!isStaff()) seedWords(n);
  const px = pxOf(n), st = practiceStats(n);
  const tabs = [["", L("Mashqlar", "Exercises")], ["words", L("Soʻzlar", "Words")], ["rules", L("Qoidalar", "Rules")], ["exit", L("Chiqish chiptasi", "Exit ticket")]];
  const cur = tab && LETTERS.includes(tab) ? "" : (tab || "");
  const exIdx = tab && LETTERS.includes(tab) ? LETTERS.indexOf(tab) : Math.max(0, l.exercises.findIndex((e, i) => !px[LETTERS[i]]));
  $app().innerHTML = `
  <nav class="crumbs"><a href="#/lessons">${A().t("lessons")}</a><span>›</span><a href="#/u/lesson-${n}">${esc(A().unitName(A().unitByKey("lesson-" + n)))}</a><span>›</span><span>${L("Mashq", "Practice")}</span></nav>
  <section class="lp-head">
    <div class="lp-title"><p class="eyebrow">${n}-${L("DARS", "LESSON")} · ${L("MASHQ", "PRACTICE")}</p><h1>${esc(l.title)}</h1><p class="panel-sub">${esc(l.titleUz)}</p></div>
    <div class="lp-stats">
      <span class="lp-stat"><b>${st.exN}/8</b><small>${L("mashq", "exercises")}</small></span>
      <span class="lp-stat"><b>${st.t ? Math.round(st.pct * 100) + "%" : "–"}</b><small>${L("natija", "score")}</small></span>
      <span class="lp-stat"><b>${st.exit ? st.exit.c + "/" + st.exit.t : "–"}</b><small>${L("chipta", "ticket")}</small></span>
      ${slowBtn()}
    </div>
  </section>
  <nav class="lp-tabs" role="tablist">${tabs.map(([k, lab]) => `<a role="tab" class="lp-tab${k === cur ? " active" : ""}" href="#/practice/${n}${k ? "/" + k : ""}">${lab}</a>`).join("")}</nav>
  <div id="lpBody"></div>`;
  bindSlow($app());
  const body = document.getElementById("lpBody");
  if (cur === "words") return renderWords(body, l);
  if (cur === "rules") return renderRules(body, l);
  if (cur === "exit") return renderExit(body, l);
  renderExercise(body, l, exIdx < 0 ? 0 : exIdx);
}

function renderExercise(body, l, ei){
  const n = l.n, ex = l.exercises[ei], letter = LETTERS[ei], px = pxOf(n);
  const typeName = { choose:L("Tanlang", "Choose"), gap:L("Toʻldiring", "Fill in"), fix:L("Xatoni tuzating", "Fix it"), order:L("Tartiblang", "Put in order"), translate:L("Tarjima", "Translate"), match:L("Moslang", "Match"), truefalse:L("T / F", "True / false"), transform:L("Oʻzgartiring", "Transform") };
  body.innerHTML = `
    <div class="ex-chips">${l.exercises.map((e, i) => { const r = px[LETTERS[i]]; return `<a class="ex-chip${i === ei ? " active" : ""}${r ? (r.c === r.t ? " full" : " done") : ""}" href="#/practice/${n}/${LETTERS[i]}"><b>${LETTERS[i]}</b><small>${r ? r.c + "/" + r.t : esc(typeName[e.type] || e.type)}</small></a>`; }).join("")}</div>
    <section class="panel ex-panel">
      <div class="ex-head"><span class="ex-letter">${letter}</span><div><h2>${esc(ex.titleUz)}</h2><p class="panel-sub">${esc(ex.instrUz)}</p></div></div>
      ${ex.box && ex.box.length ? `<div class="ex-box">${L("Soʻzlar", "Words")}: ${ex.box.map(w => `<b>${esc(w)}</b>`).join(" · ")}</div>` : ""}
      <div class="ex-items" id="exItems"></div>
      <div class="ex-done" id="exDone" hidden></div>
    </section>`;
  const list = document.getElementById("exItems");
  let answered = 0, right = 0;
  const total = ex.items.length;
  const finishEx = () => {
    const prev = px[letter], p = ensure();
    const rec = { c:right, t:total, at:Date.now() };
    p.px[n] = p.px[n] || {}; p.px[n][letter] = rec; mark("px/" + n + "/" + letter, rec);
    const gain = Math.max(0, right - (prev ? prev.c : 0)) * 10;
    if (gain) addXp(gain); else checkBadges();
    const nextI = ei + 1 < l.exercises.length ? ei + 1 : -1;
    const dn = document.getElementById("exDone");
    dn.hidden = false;
    dn.innerHTML = `<div class="ex-score ${right === total ? "full" : ""}"><b>${right}/${total}</b> ${L("toʻgʻri", "correct")}${gain ? ` · +${gain} XP` : ""}</div>
      ${right < total ? `<p class="panel-sub">${L("Xatolar «Bugungi takrorlash»ga qoʻshildi.", "Your mistakes were added to today's review.")}</p>` : `<p class="panel-sub">${L("Barakalla! Hammasi toʻgʻri.", "Well done! All correct.")}</p>`}
      <div class="toolbar"><a class="btn btn-ghost btn-sm" href="#/practice/${n}/${letter}" data-again>${icon("reset", 16)}${L("Qayta", "Again")}</a>
      ${nextI >= 0 ? `<a class="btn btn-accent" href="#/practice/${n}/${LETTERS[nextI]}">${L("Keyingi mashq", "Next exercise")} ${LETTERS[nextI]} ${icon("right", 16)}</a>` : `<a class="btn btn-accent" href="#/practice/${n}/exit">${L("Chiqish chiptasi", "Exit ticket")} ${icon("right", 16)}</a>`}</div>`;
    dn.querySelector("[data-again]").onclick = e => { e.preventDefault(); renderExercise(body, l, ei); };
    dn.scrollIntoView({ behavior:"smooth", block:"center" });
  };
  if (ex.type === "match"){
    const mb = document.createElement("div"); list.appendChild(mb);
    mountMatch(mb, ex, { seed:n * 100 + ei,
      onMiss: i => { if (!isStaff()) srsWrong(n + "-" + ei + "-" + i); },
      onItem: (i, ok) => { answered++; if (ok) right++; },
      onDone: () => finishEx() });
    return;
  }
  ex.items.forEach((it, ii) => {
    const box = document.createElement("div"); list.appendChild(box);
    mountItem(box, Object.assign({ type:ex.type, box:ex.box }, it), { num:ii + 1, seed:n * 100 + ei * 10 + ii, xp:10,
      onAnswer: ok => {
        answered++; if (ok) right++;
        else if (!isStaff()) srsWrong(n + "-" + ei + "-" + ii);
        if (answered === total) finishEx();
        else { const nx = box.nextElementSibling && box.nextElementSibling.querySelector(".it-in"); if (nx && window.matchMedia("(min-width: 761px)").matches) nx.focus({ preventScroll:true }); }
      } });
  });
}

/* flashcards: both directions, memory hook on the back; "I know it" moves the word up a box */
function renderWords(body, l){
  const n = l.n;
  let dir = "en", i = 0, flipped = false;
  const words = l.vocab;
  const hook = w => { const h = (l.vocabHooks || []).find(x => norm(x[0]) === norm(w[0]) || norm(x[0]).split(" / ").includes(norm(w[0]))); return h ? h[1] : ""; };
  const draw = () => {
    const w = words[i], front = dir === "en" ? w[0] : w[1], back = dir === "en" ? w[1] : w[0];
    const p = ensure(), box = (p.srs["w" + n + "-" + i] || [0])[0];
    body.innerHTML = `
      <div class="fc-bar"><div class="seg"><button class="seg-b${dir === "en" ? " on" : ""}" data-dir="en">EN → UZ</button><button class="seg-b${dir === "uz" ? " on" : ""}" data-dir="uz">UZ → EN</button></div>
        <span class="fc-count">${i + 1} / ${words.length}</span></div>
      <div class="fc-card${flipped ? " flipped" : ""}" id="fcCard" tabindex="0" role="button" aria-label="${L("Kartani aylantirish", "Flip card")}">
        <div class="fc-face fc-front"><span class="fc-word">${esc(front)}</span>${dir === "en" ? say(w[0]) : ""}<small>${L("Bosing — aylanadi", "Tap to flip")}</small></div>
        <div class="fc-face fc-back"><span class="fc-word">${esc(back)}</span>${dir === "uz" ? say(w[0]) : say(w[0])}${hook(w) ? `<p class="fc-hook">💡 ${esc(hook(w))}</p>` : ""}</div>
      </div>
      <div class="fc-box">${[1, 2, 3, 4, 5].map(b => `<i class="${b <= box ? "on" : ""}"></i>`).join("")}<small>${L("Quti", "Box")} ${box || 0}/5</small></div>
      <div class="fc-actions">
        <button class="btn btn-ghost" data-know="0">${L("Bilmayman", "Don't know")}</button>
        <button class="btn btn-accent" data-know="1">${icon("check", 16)}${L("Bilaman", "I know it")}</button>
      </div>
      <div class="toolbar"><button class="btn btn-ghost btn-sm" data-mv="-1">${icon("left", 16)}</button><span class="spacer"></span><button class="btn btn-ghost btn-sm" data-mv="1">${icon("right", 16)}</button></div>
      <section class="panel"><h2 class="mini-h">${L("16 ta yangi soʻz", "16 new words")}</h2><div class="vocab-list">${words.map((x, j) => `<div class="v-row"><b>${esc(x[0])}</b>${say(x[0])}<span>${esc(x[1])}</span></div>`).join("")}</div></section>`;
    const card = document.getElementById("fcCard");
    card.onclick = e => { if (e.target.closest(".say")) return; flipped = !flipped; card.classList.toggle("flipped", flipped); };
    card.onkeydown = e => { if (e.key === " " || e.key === "Enter"){ e.preventDefault(); card.click(); } };
    body.querySelectorAll("[data-dir]").forEach(b => b.onclick = () => { dir = b.dataset.dir; flipped = false; draw(); });
    body.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => { i = (i + +b.dataset.mv + words.length) % words.length; flipped = false; draw(); });
    body.querySelectorAll("[data-know]").forEach(b => b.onclick = () => {
      const ok = b.dataset.know === "1", id = "w" + n + "-" + i, p2 = ensure();
      if (!isStaff()){
        const cur = p2.srs[id] || [0, today()];
        if (ok){ const nb = Math.min(5, (cur[0] || 0) + 1); p2.srs[id] = [nb, today() + INT[nb]]; }
        else p2.srs[id] = [1, today()];
        mark("srs/" + id, p2.srs[id]); refreshNavBadge(); checkBadges();
      }
      i = (i + 1) % words.length; flipped = false; draw();
    });
  };
  draw();
}

function renderRules(body, l){
  const ex = pair => `<li><span class="en">${esc(pair[0])}</span>${say(pair[0])}<span class="uz">${esc(pair[1])}</span></li>`;
  body.innerHTML = `
    <section class="panel"><p class="eyebrow">${L("Bugun oʻrganamiz", "Today we learn")}</p><ul class="objectives">${l.goals.map(g => `<li>${esc(g)}</li>`).join("")}</ul>
      ${l.hook ? `<p class="rule-hook">💬 ${esc(l.hook)}</p>` : ""}</section>
    ${l.rules.map((r, i) => `<section class="panel rule-card"><p class="eyebrow">${L("Qoida", "Rule")} ${i + 1}</p><h2>${esc(r.title)}</h2>
      <p class="rule-one">${esc(r.oneLine)}</p>${r.formula ? `<div class="rule-formula">${esc(r.formula)}</div>` : ""}
      <ul class="ex-list">${(r.examples || []).map(ex).join("")}</ul>${r.tip ? `<p class="rule-tip">💡 ${esc(r.tip)}</p>` : ""}</section>`).join("")}
    ${l.table && l.table.rows ? `<section class="panel"><h2 class="mini-h">${esc(l.table.title || "")}</h2><div class="hw-table-wrap"><table class="hw-table"><tr>${(l.table.header || []).map(h => `<th style="background:#5416B5;color:#fff">${esc(h)}</th>`).join("")}</tr>${l.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></div></section>` : ""}
    ${l.mnemonic ? `<section class="panel mnem"><p class="eyebrow">${L("Eslab qolish siri", "Memory trick")}</p><h2>${esc(l.mnemonic.title)}</h2><p>${esc(l.mnemonic.text)}</p>
      ${(l.mnemonic.chant || []).length ? `<div class="chant">${l.mnemonic.chant.map(c => `<div>♪ ${esc(c)} ${say(c)}</div>`).join("")}</div>` : ""}</section>` : ""}
    ${(l.mistakes || []).length ? `<section class="panel"><p class="eyebrow">${L("Koʻp uchraydigan xatolar", "Common mistakes")}</p><div class="mist">${l.mistakes.map(m => `<div class="mist-row"><span class="m-bad">✗ ${esc(m[0])}</span><span class="m-good">✓ ${esc(m[1])} ${say(m[1])}</span><small>${esc(m[2])}</small></div>`).join("")}</div></section>` : ""}
    ${l.reading ? `<section class="panel"><p class="eyebrow">${L("Oʻqish", "Reading")}</p><h2>${esc(l.reading.title)} ${say(l.reading.text.map(x => x[0]).join(" "))}</h2>
      <ul class="ex-list read">${l.reading.text.map(ex).join("")}</ul>
      <ol class="read-qs">${(l.reading.qs || []).map(q => `<li><span>${esc(q.q)}</span>${say(q.q)}<small>${esc(q.uz)}</small><details><summary>${L("Javob", "Answer")}</summary>${esc(q.a)} ${say(q.a)}</details></li>`).join("")}</ol></section>` : ""}
    ${l.speaking && l.speaking.dialogue ? `<section class="panel"><p class="eyebrow">${L("Juftlikda gapiring", "Speak in pairs")}</p>
      <div class="dlg">${l.speaking.dialogue.map(d => `<div class="dlg-row ${d[0] === "A" ? "a" : "b"}"><b>${esc(d[0])}</b><div><span>${esc(d[1])}</span>${say(d[1])}<small>${esc(d[2])}</small></div></div>`).join("")}</div>
      ${(l.speaking.tasks || []).length ? `<ul class="tips">${l.speaking.tasks.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</section>` : ""}
    ${(l.recap || []).length ? `<section class="panel"><p class="eyebrow">${L("Bir qarashda", "At a glance")}</p><ol class="recap">${l.recap.map(r => `<li>${esc(r)}</li>`).join("")}</ol></section>` : ""}
    ${(l.tips || []).length ? `<section class="panel"><p class="eyebrow">${L("Maslahatlar", "Tips")}</p><ul class="tips">${l.tips.map(r => `<li>${esc(r)}</li>`).join("")}</ul></section>` : ""}`;
}

/* exit ticket: the lesson's 5 questions as one quiz, checked at the end */
function renderExit(body, l){
  const n = l.n, prev = pxOf(n).x;
  body.innerHTML = `<section class="panel ex-panel"><div class="ex-head"><span class="ex-letter">🎟</span><div><h2>${L("Chiqish chiptasi", "Exit ticket")}</h2>
    <p class="panel-sub">${L("5 ta savol. Hammasini yozing, keyin «Topshirish»ni bosing.", "5 questions. Answer them all, then press “Submit”.")}${prev ? ` ${L("Oxirgi natija", "Last score")}: <b>${prev.c}/${prev.t}</b>` : ""}</p></div></div>
    <div class="ex-items" id="exItems"></div>
    <div class="toolbar"><button class="btn btn-accent" id="exitGo">${icon("check", 16)}${L("Topshirish", "Submit")}</button></div><div class="ex-done" id="exDone" hidden></div></section>`;
  const list = document.getElementById("exItems"), ms = [];
  l.exit.forEach((it, i) => { const b = document.createElement("div"); list.appendChild(b); ms.push(mountItem(b, Object.assign({ type:"gap" }, it), { num:i + 1, live:false })); });
  document.getElementById("exitGo").onclick = () => {
    if (ms.some(m => !String(m.value || "").trim()) && !confirm(L("Baʼzi savollarga javob yozilmagan. Topshirasizmi?", "Some answers are empty. Submit anyway?"))) return;
    let c = 0;
    ms.forEach((m, i) => { const ok = m.grade() === true; if (ok) c++; else if (!isStaff()) srsWrong(n + "-x-" + i); m.reveal(ok); });
    const p = ensure(), rec = { c, t:ms.length, at:Date.now() };
    p.px[n] = p.px[n] || {}; p.px[n].x = rec; mark("px/" + n + "/x", rec);
    const gain = Math.max(0, c - (prev ? prev.c : 0)) * 10 + (c === ms.length && !(prev && prev.c === prev.t) ? 20 : 0);
    if (gain) addXp(gain); else checkBadges();
    document.getElementById("exitGo").hidden = true;
    const dn = document.getElementById("exDone"); dn.hidden = false;
    dn.innerHTML = `<div class="ex-score ${c === ms.length ? "full" : ""}"><b>${c}/${ms.length}</b> ${L("toʻgʻri", "correct")}${gain ? ` · +${gain} XP` : ""}</div>
      <p class="panel-sub">${c === ms.length ? L("Dars sizniki! 🎉", "You own this lesson! 🎉") : L("Xatolar takrorlashga qoʻshildi.", "Mistakes were added to your review.")}</p>
      <div class="toolbar"><button class="btn btn-ghost btn-sm" id="exitAgain">${icon("reset", 16)}${L("Qayta", "Again")}</button><a class="btn btn-accent" href="#/review">${L("Bugungi takrorlash", "Today's review")} ${icon("right", 16)}</a></div>`;
    document.getElementById("exitAgain").onclick = () => renderExit(body, l);
  };
}

/* ---------------- today's review ---------------- */
function reviewSpec(id, seed){
  const r = resolve(id); if (!r) return null;
  if (r.kind === "word"){
    const toEn = seed % 2 === 0;
    if (toEn) return { type:"translate", q:r.uz, a:r.en, uz:L("Inglizcha yozing", "Write it in English"), hook:r.hook, en:r.en };
    const opts = shuffle([r.uz].concat(shuffle(r.poolUz.filter(x => x !== r.uz), seed).slice(0, 3)), seed + 3);
    return { type:"pick", q:r.en, a:r.uz, options:opts, uz:L("Oʻzbekchasini tanlang", "Pick the Uzbek"), hook:r.hook, en:r.en };
  }
  if (r.type === "match"){
    const opts = shuffle([r.a].concat(shuffle((r.pool || []).filter(x => x !== r.a), seed).slice(0, 3)), seed + 5);
    return Object.assign({}, r, { type:"pick", options:opts });
  }
  return r;
}
function viewReview(){
  const { list, dueN } = dueList();
  if (!course()) return A().notFound();
  let i = 0, right = 0, xp = 0;
  const queue = list.map(x => x.id), again = new Set();
  const total = queue.length;
  const p = ensure();
  $app().innerHTML = `
    <div class="section-title"><div><h1>${L("Bugungi takrorlash", "Today's review")}</h1><p>${dueN ? `${Math.min(dueN, 15)} ${L("ta savol bugun", "items due today")}` : L("Bugun muddati kelgan savol yoʻq — oldinroq takrorlaymiz.", "Nothing is due today — let's review ahead.")} · 🔥 ${streakOf(p)} ${L("kun", "days")}</p></div>${slowBtn()}</div>
    <div class="rv-bar"><span id="rvProg" style="width:0%"></span></div>
    <section class="panel rv-card" id="rvCard"></section>`;
  bindSlow($app());
  const card = document.getElementById("rvCard");
  if (!total){
    card.innerHTML = `<div class="empty-big"><div class="big-emoji">🌱</div><h2>${L("Takrorlash navbati boʻsh", "Your review queue is empty")}</h2><p class="panel-sub">${L("Dars mashqlarini bajaring — yangi soʻzlar va xatolar shu yerga tushadi.", "Do a lesson's practice — new words and mistakes land here.")}</p><a class="btn btn-accent" href="#/lessons">${A().t("myLessons")}</a></div>`;
    return;
  }
  const next = () => {
    document.getElementById("rvProg").style.width = Math.min(100, i / total * 100) + "%";
    if (i >= queue.length) return end();
    const id = queue[i], spec = reviewSpec(id, i + today());
    if (!spec){ i++; return next(); }
    const r = resolve(id);
    card.innerHTML = `<div class="rv-meta"><span class="chip">${r.kind === "word" ? L("Soʻz", "Word") : esc(r.src || "")} · ${r.lesson}-${L("dars", "lesson")}</span><span class="rv-count">${Math.min(i + 1, total)} / ${total}</span></div><div id="rvItem"></div><div class="rv-next" id="rvNext" hidden></div>`;
    const box = document.getElementById("rvItem");
    mountItem(box, spec, { seed:i + 3, xp:5, onAnswer: ok => {
      if (i < total){ if (!isStaff()) srsReview(id, ok); if (ok){ right++; xp += 5; addXp(5); } refreshNavBadge(); }
      if (!ok && !again.has(id)){ again.add(id); queue.push(id); }
      if (spec.hook && r.kind === "word") document.querySelector("#rvItem .it-fb").insertAdjacentHTML("beforeend", `<p class="fc-hook">💡 ${esc(spec.hook)}</p>`);
      if (r.kind === "word") document.querySelector("#rvItem .it-fb").insertAdjacentHTML("beforeend", say(r.en));
      const nx = document.getElementById("rvNext"); nx.hidden = false;
      nx.innerHTML = `<button class="btn btn-accent" id="rvGo">${L("Keyingisi", "Next")} ${icon("right", 16)}</button>`;
      const go = document.getElementById("rvGo"); go.onclick = () => { i++; next(); }; go.focus({ preventScroll:true });
    } });
    const inp = box.querySelector(".it-in"); if (inp && window.matchMedia("(min-width: 761px)").matches) inp.focus();
  };
  const end = () => {
    refreshNavBadge();
    card.innerHTML = `<div class="empty-big"><div class="big-emoji">${right === total ? "🏆" : "💪"}</div><h2>${L("Takrorlash tugadi!", "Review done!")}</h2>
      <p class="ex-score"><b>${right}/${total}</b> ${L("toʻgʻri", "correct")} · +${xp} XP · 🔥 ${streakOf(ensure())} ${L("kun ketma-ket", "day streak")}</p>
      <p class="panel-sub">${L("Toʻgʻri javoblar keyinroq (1 → 2 → 4 → 7 → 15 kun) yana soʻraladi, xatolar — ertaga.", "Correct items come back later (1 → 2 → 4 → 7 → 15 days), mistakes tomorrow.")}</p>
      <div class="toolbar" style="justify-content:center"><a class="btn btn-ghost" href="#/me">${L("Yutuqlarim", "My progress")}</a><a class="btn btn-accent" href="#/">${A().t("home")}</a></div></div>`;
  };
  next();
}

/* ---------------- progress checks: timed tests ---------------- */
function viewCheck(k){
  const c = checkData(k); if (!c) return A().notFound();
  if (!A().hasAccess("quiz-" + k)) return A().lockedView();
  const prev = ensure().chk[k];
  const nItems = c.sections.reduce((s, x) => s + x.items.length, 0);
  const minutes = Math.max(10, c.sections.length * 5);
  $app().innerHTML = `
    <nav class="crumbs"><a href="#/lessons">${A().t("lessons")}</a><span>›</span><a href="#/u/quiz-${k}">${esc(c.titleUz)}</a><span>›</span><span>${L("Test", "Test")}</span></nav>
    <section class="panel chk-intro"><p class="eyebrow">${L("NAZORAT ISHI", "PROGRESS CHECK")} ${k} · ${c.covers.map(x => x + "-" + L("dars", "lesson")).join(" · ")}</p>
      <h1>${esc(c.titleUz)}</h1>
      <ul class="objectives">${c.covers.map(x => `<li>${x}-${L("dars", "lesson")}: ${esc((lessonData(x) || {}).title || "")}</li>`).join("")}</ul>
      <div class="stat-row"><div class="stat-tile"><span class="stat-num">${nItems}</span><span class="stat-label">${L("savol", "questions")}</span></div>
        <div class="stat-tile"><span class="stat-num">${minutes}</span><span class="stat-label">${L("daqiqa", "minutes")}</span></div>
        <div class="stat-tile"><span class="stat-num">${prev ? Math.round((prev.best || 0) * 100) + "%" : "–"}</span><span class="stat-label">${L("eng yaxshi natija", "best score")}</span></div></div>
      <p class="panel-sub">${L("Kitob va daftarni yoping. Vaqt tugaganda test oʻzi topshiriladi.", "Close your book. When time runs out the test is submitted automatically.")}</p>
      <button class="btn btn-accent btn-lg" id="chkStart">${icon("play", 18)}${L("Testni boshlash", "Start the test")}</button></section>`;
  document.getElementById("chkStart").onclick = () => runCheck(c, minutes);
}
function runCheck(c, minutes){
  const k = c.k, t0 = Date.now(), end = t0 + minutes * 60000;
  $app().innerHTML = `
    <div class="chk-top" id="chkTop"><b>${esc(c.titleUz)}</b><span class="chk-timer" id="chkTimer">${minutes}:00</span><button class="btn btn-accent btn-sm" id="chkSubmit">${L("Topshirish", "Submit")}</button></div>
    <div id="chkSecs"></div>
    <section class="panel"><button class="btn btn-accent btn-lg" id="chkSubmit2" style="width:100%">${icon("check", 18)}${L("Testni topshirish", "Submit the test")}</button></section>`;
  const secs = document.getElementById("chkSecs"), ms = [];
  c.sections.forEach((s, si) => {
    const sec = document.createElement("section"); sec.className = "panel ex-panel";
    sec.innerHTML = `<div class="ex-head"><span class="ex-letter">${"ABCD"[si] || si + 1}</span><div><h2>${esc(s.titleUz)}</h2><p class="panel-sub">${esc(s.instrUz)}</p></div></div>
      ${s.box && s.box.length ? `<div class="ex-box">${L("Soʻzlar", "Words")}: ${s.box.map(w => `<b>${esc(w)}</b>`).join(" · ")}</div>` : ""}<div class="ex-items"></div>`;
    secs.appendChild(sec);
    const list = sec.querySelector(".ex-items");
    s.items.forEach((it, ii) => {
      const b = document.createElement("div"); list.appendChild(b);
      const type = s.type === "match" ? "pick" : s.type;
      const spec = Object.assign({ type, box:s.box }, it);
      if (s.type === "match") spec.options = shuffle(s.items.map(x => x.a), k * 10 + ii);
      ms.push({ id:`k${k}-${si}-${ii}`, si, m:mountItem(b, spec, { num:ii + 1, live:false, seed:k * 100 + si * 10 + ii }) });
    });
  });
  if (c.speaking && c.speaking.length) secs.insertAdjacentHTML("beforeend", `<section class="panel"><p class="eyebrow">${L("Ogʻzaki qism (oʻqituvchi bilan)", "Speaking (with your teacher)")}</p><ol class="tips">${c.speaking.map(x => `<li>${esc(x)}</li>`).join("")}</ol></section>`);
  let timer = setInterval(tick, 500), submitted = false;
  function tick(){
    const left = Math.max(0, end - Date.now()), m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
    const el = document.getElementById("chkTimer"); if (!el){ clearInterval(timer); return; }
    el.textContent = m + ":" + String(s).padStart(2, "0"); el.classList.toggle("low", left < 60000);
    if (!left) submit(true);
  }
  cleanup = () => { clearInterval(timer); };
  function submit(auto){
    if (submitted) return;
    if (!auto && ms.some(x => !String(x.m.value || "").trim()) && !confirm(L("Baʼzi savollarga javob yozilmagan. Topshirasizmi?", "Some answers are empty. Submit anyway?"))) return;
    submitted = true; clearInterval(timer);
    let right = 0; const per = c.sections.map(() => ({ c:0, t:0 }));
    ms.forEach(x => { const ok = x.m.grade() === true; per[x.si].t++; if (ok){ right++; per[x.si].c++; } else if (!isStaff()) srsWrong(x.id); x.m.reveal(ok); });
    const total = ms.length, ratio = total ? right / total : 0, p = ensure(), prev = p.chk[k] || {};
    const rec = { c:right, t:total, at:Date.now(), sec:Math.round((Date.now() - t0) / 1000), best:Math.max(prev.best || 0, ratio), tries:(prev.tries || 0) + 1 };
    p.chk[k] = rec; mark("chk/" + k, rec);
    const gain = Math.max(0, right - (prev.c && prev.best ? Math.round(prev.best * total) : 0)) * 5;
    if (gain) addXp(gain); else checkBadges();
    document.getElementById("chkTop").innerHTML = `<b>${esc(c.titleUz)}</b><span class="chk-score">${right}/${total} · ${Math.round(ratio * 100)}%</span><a class="btn btn-ghost btn-sm" href="#/check/${k}">${L("Yopish", "Close")}</a>`;
    document.getElementById("chkSubmit2").outerHTML = `<div class="ex-score ${right === total ? "full" : ""}"><b>${right}/${total}</b> · ${Math.round(ratio * 100)}%${gain ? ` · +${gain} XP` : ""}${auto ? ` · ${L("vaqt tugadi", "time's up")}` : ""}</div>
      <p class="panel-sub">${per.map((x, i) => `${"ABCD"[i]}: ${x.c}/${x.t}`).join(" · ")} · ${L("Xatolar takrorlashga qoʻshildi.", "Mistakes were added to your review.")}</p>`;
    window.scrollTo({ top:0, behavior:"smooth" });
  }
  document.getElementById("chkSubmit").onclick = () => submit(false);
  document.getElementById("chkSubmit2").onclick = () => submit(false);
}

/* ---------------- my progress: XP, streak, badges, leaderboard ---------------- */
let meta = { lb:{}, game:null };   // sp1/open/_lb and sp1/open/_game
function onOpen(raw){
  const v = raw || {};
  const lb = v._lb || {}, game = v._game || null;
  const gameChanged = JSON.stringify(game) !== JSON.stringify(meta.game);
  meta = { lb, game };
  if (gameChanged){
    gameBanner();
    if (/^#\/play/.test(location.hash)) drawPlay();
    if (/^#\/game\//.test(location.hash) && hostRedraw) hostRedraw();
  }
}
function myBoard(){
  const me = C().uid, tid = C().profile && C().profile.teacherId;
  if (tid && meta.lb[tid]) return meta.lb[tid];
  return Object.values(meta.lb).find(b => b && (b.rows || []).some(r => r.u === me)) || null;
}
function boardHtml(b, me){
  if (!b || b.on === false || !(b.rows || []).length) return "";
  const rows = b.rows.slice(0, 10), mine = b.rows.findIndex(r => r.u === me);
  return `<section class="panel"><div class="panel-head-row"><div><h2>${L("Sinf reytingi", "Class leaderboard")}</h2><p class="panel-sub">${L("Haftalik XP", "XP this week")} · ${A().fmtAgo(b.at)}</p></div></div>
    <ol class="lb">${rows.map((r, i) => `<li class="${r.u === me ? "me" : ""}"><span class="lb-rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span><span class="lb-name">${esc(r.n)}</span><span class="lb-streak">🔥${r.s || 0}</span><b>${r.w || 0} XP</b></li>`).join("")}</ol>
    ${mine >= 10 ? `<p class="panel-sub">${L("Sizning oʻrningiz", "Your place")}: <b>${mine + 1}</b> · ${b.rows[mine].w || 0} XP</p>` : ""}</section>`;
}
function viewMe(){
  if (!course()) return A().notFound();
  const p = ensure(), st = streakOf(p), wk = weekXp(p);
  const days = []; for (let i = 6; i >= 0; i--) days.push({ d:today() - i, v:(p.days || {})[dayKey(today() - i)] || 0 });
  const mx = Math.max(10, ...days.map(x => x.v));
  const wd = L("Ya,Du,Se,Ch,Pa,Ju,Sh", "Su,Mo,Tu,We,Th,Fr,Sa").split(",");
  const open = A().D.units.filter(u => u.type === "lesson" && A().hasAccess(A().keyOf(u)));
  $app().innerHTML = `
    <div class="section-title"><div><h1>${L("Yutuqlarim", "My progress")}</h1><p>${esc((C().profile || {}).name || "")}</p></div></div>
    <section class="me-stats">
      <div class="me-tile xp"><span>⭐</span><b>${p.xp || 0}</b><small>XP</small></div>
      <div class="me-tile fire"><span>🔥</span><b>${st}</b><small>${L("kun ketma-ket", "day streak")}</small></div>
      <div class="me-tile"><span>🧠</span><b>${wordsLearned(p)}</b><small>${L("soʻz oʻrganildi", "words learned")}</small></div>
      <div class="me-tile"><span>📘</span><b>${lessonsDone(p)}</b><small>${L("dars yakunlandi", "lessons done")}</small></div>
    </section>
    <section class="panel"><div class="panel-head-row"><h2>${L("Bu hafta", "This week")}: ${wk} XP</h2><a class="btn btn-accent btn-sm" href="#/review">${L("Bugungi takrorlash", "Today's review")} (${dueCount()})</a></div>
      <div class="week">${days.map(x => `<div class="wk-col"><span class="wk-bar${x.v ? " on" : ""}" style="height:${Math.max(4, x.v / mx * 90)}px" title="${x.v} XP"></span><small>${wd[new Date(x.d * 86400000).getUTCDay()]}</small></div>`).join("")}</div></section>
    ${boardHtml(myBoard(), C().uid)}
    <section class="panel"><h2>${L("Nishonlar", "Badges")} (${Object.keys(p.badges).length}/${BADGES.length})</h2>
      <div class="badges">${BADGES.map(([id, ic, uz, en]) => `<div class="badge${p.badges[id] ? " got" : ""}"><span>${ic}</span><b>${L(uz, en)}</b>${p.badges[id] ? `<small>${new Date(p.badges[id]).toLocaleDateString()}</small>` : `<small>${icon("lock", 12)}</small>`}</div>`).join("")}</div></section>
    <section class="panel"><h2>${L("Darslar boʻyicha", "By lesson")}</h2><div class="unit-list">${open.length ? open.map(u => { const s = practiceStats(u.num, p); return `<a class="unit-row" href="#/practice/${u.num}" style="text-decoration:none"><span class="unit-badge"><small>DARS</small><b>${u.num}</b></span>
      <span class="unit-main"><h3>${esc(u.title)}</h3><span class="progressbar" style="display:block;margin:8px 0 0;height:6px"><span class="progressbar-fill" style="display:block;width:${s.exN / 8 * 100}%"></span></span></span>
      <span class="unit-side"><span class="chip">${s.exN}/8</span>${s.exit ? `<span class="chip ok">🎟 ${s.exit.c}/${s.exit.t}</span>` : ""}</span></a>`; }).join("") : `<p class="panel-sub">${A().t("noOpenLessons")}</p>`}</div></section>`;
}

/* staff: keep the class leaderboard published (sp1/open/_lb/{me}) */
let lbT = null, lbLast = "";
function publishBoard(force){
  if (!isStaff() || !course()) return;
  clearTimeout(lbT);
  lbT = setTimeout(() => {
    const me = C().uid, cur = meta.lb[me] || {}, on = cur.on !== false;
    const rows = A().members().filter(s => s.sp1 && (s.sp1.xp || 0) > 0).map(s => {
      const nm = String(s.name || s.email || "").trim().split(/\s+/);
      return { u:s.uid, n:nm[0] + (nm[1] ? " " + nm[1][0] + "." : ""), xp:s.sp1.xp || 0, w:weekXp(s.sp1), s:streakOf(s.sp1) };
    }).sort((a, b) => b.w - a.w || b.xp - a.xp).slice(0, 60);
    const sig = JSON.stringify([on, rows]);
    if (!force && (sig === lbLast || sig === JSON.stringify([on, cur.rows || []]))) return;
    lbLast = sig;
    C().setOpenNode("_lb/" + me, { on, rows, at:Date.now() }).catch(e => console.warn("lb", e));
  }, force ? 50 : 4000);
}
function setBoardOn(on){
  const me = C().uid, cur = meta.lb[me] || {};
  return C().setOpenNode("_lb/" + me, Object.assign({ rows:[] }, cur, { on, at:Date.now() }));
}

/* ---------------- home strip, lesson card, banner ---------------- */
function homeStrip(){
  if (!course() || isStaff()) return "";
  const p = ensure(), due = dueCount();
  return `<section class="learn-strip">
    <a class="ls-tile primary" href="#/review"><span class="ls-ico">🔁</span><span><b>${L("Bugungi takrorlash", "Today's review")}</b><small>${due ? `${due} ${L("ta savol", "items")}` : L("Hammasi takrorlangan ✓", "All caught up ✓")}</small></span></a>
    <a class="ls-tile" href="#/me"><span class="ls-ico">🔥</span><span><b>${streakOf(p)} ${L("kun", "days")}</b><small>${L("ketma-ket", "streak")}</small></span></a>
    <a class="ls-tile" href="#/me"><span class="ls-ico">⭐</span><span><b>${p.xp || 0} XP</b><small>${Object.keys(p.badges).length} ${L("nishon", "badges")}</small></span></a>
  </section>`;
}
function lessonCard(u){
  if (!course()) return "";
  if (u.type === "lesson"){
    const s = practiceStats(u.num);
    return `<section class="practice-card">
      <div class="pc-main"><p class="eyebrow">${L("MUSTAQIL MASHQ", "PRACTICE ON YOUR OWN")}</p><h2>${L("Mashq, soʻzlar va chiqish chiptasi", "Exercises, words and exit ticket")}</h2>
        <p class="panel-sub">${L("8 ta mashq (A–H) avtomatik tekshiriladi, 16 ta soʻz kartochkada, qoidalar ovozi bilan.", "8 self-checking exercises (A–H), 16 flashcards, the rules with audio.")}</p>
        <span class="progressbar" style="display:block;margin:10px 0 0;height:6px"><span class="progressbar-fill" style="display:block;width:${s.exN / 8 * 100}%"></span></span></div>
      <div class="pc-acts"><a class="btn btn-accent" href="#/practice/${u.num}">${icon("pencil", 16)}${s.exN ? L("Davom ettirish", "Continue") + ` · ${s.exN}/8` : L("Mashqni boshlash", "Start practice")}</a>
        <a class="btn btn-ghost btn-sm" href="#/practice/${u.num}/words">🃏 ${L("Soʻzlar", "Words")}</a><a class="btn btn-ghost btn-sm" href="#/practice/${u.num}/rules">📖 ${L("Qoidalar", "Rules")}</a><a class="btn btn-ghost btn-sm" href="#/practice/${u.num}/exit">🎟 ${L("Chipta", "Ticket")}${s.exit ? " " + s.exit.c + "/" + s.exit.t : ""}</a></div>
    </section>`;
  }
  if (u.type === "quiz"){
    const r = ensure().chk[u.num];
    return `<section class="practice-card"><div class="pc-main"><p class="eyebrow">${L("ONLAYN TEST", "ONLINE TEST")}</p><h2>${L("Nazorat ishini telefonda topshiring", "Take this check on your phone")}</h2>
      <p class="panel-sub">${L("Vaqtli test, natija darhol chiqadi.", "A timed test with an instant score.")}${r ? ` ${L("Eng yaxshi natija", "Best")}: <b>${Math.round((r.best || 0) * 100)}%</b>` : ""}</p></div>
      <div class="pc-acts"><a class="btn btn-accent" href="#/check/${u.num}">${icon("clock", 16)}${L("Testni boshlash", "Start the test")}</a></div></section>`;
  }
  if (u.type === "outro" && isStaff()){
    return `<section class="practice-card"><div class="pc-main"><p class="eyebrow">${L("JONLI OʻYIN", "LIVE GAME")}</p><h2>${L("“Savol-ball” — oʻquvchilar telefonda javob beradi", "“Savol-ball” — pupils answer on their phones")}</h2>
      <p class="panel-sub">${L("Ekranda doska, oʻquvchilar telefonda javob beradi, ballar avtomatik hisoblanadi.", "The board on your screen, pupils answer on phones, points are counted for you.")}</p></div>
      <div class="pc-acts"><a class="btn btn-accent" href="#/game/${u.part}">${icon("play", 16)}${L("Oʻyinni boshlash", "Start the game")}</a></div></section>`;
  }
  return "";
}
function gameLive(){ const g = meta.game; return !!(g && !g.ended && g.at && Date.now() - g.at < 4 * 3600000); }
function gameBanner(){
  let el = document.getElementById("gameBanner");
  const show = gameLive() && !isStaff() && !/^#\/play/.test(location.hash);
  if (!show){ if (el) el.remove(); return; }
  if (!el){ el = document.createElement("a"); el.id = "gameBanner"; el.className = "game-banner"; el.href = "#/play"; document.body.appendChild(el); }
  el.innerHTML = `🎮 <b>${L("Jonli oʻyin boshlandi!", "A live game has started!")}</b> <span>${L("Qoʻshilish", "Join")} →</span>`;
}

/* ---------------- live game: teacher host ---------------- */
let hostRedraw = null;
function gameQuestion(lessonN, val){
  const l = lessonData(lessonN), r = Math.random;
  const pick = a => a[Math.floor(r() * a.length)];
  if (!l) return null;
  if (val === 100){
    const w = pick(l.vocab), others = shuffle(l.vocab.filter(x => x !== w), Date.now() % 997).slice(0, 3).map(x => x[0]);
    return { text:`“${w[1]}” — ${L("inglizcha?", "in English?")}`, uz:"", options:shuffle([w[0]].concat(others), Date.now() % 991), a:w[0] };
  }
  const items = t => l.exercises.filter(e => t.includes(e.type)).flatMap(e => e.items.map(it => Object.assign({ box:e.box, type:e.type }, it)));
  if (val === 200){ const it = pick(items(["choose"]).length ? items(["choose"]) : l.exit.map(x => Object.assign({ type:"gap" }, x))); return { text:it.q, uz:it.uz || "", options:it.options || null, a:it.a }; }
  if (val === 300){ const pool = items(["gap"]).concat(l.exit.map(x => Object.assign({ type:"gap" }, x))); const it = pick(pool); return { text:it.q, uz:it.uz || "", options:it.box && it.box.length ? it.box : null, a:it.a }; }
  const it = pick(items(["fix", "transform", "translate"]).length ? items(["fix", "transform", "translate"]) : items(["gap"]));
  return { text:it.q, uz:it.uz || "", options:null, a:it.a, kind:it.type };
}
function viewGameHost(part){
  if (!isStaff()) return A().notFound();
  const pm = (course().parts || [])[part - 1]; if (!pm) return A().notFound();
  const cats = course().lessons.filter(l => l.n >= pm.from && l.n <= pm.to);
  let answer = null;       // the open question's answer stays on this screen only
  const g0 = meta.game && !meta.game.ended && meta.game.part === part ? meta.game : null;
  const start = () => C().setOpenNode("_game", { id:Date.now(), part, by:C().uid, title:pm.name + " · " + L("Katta takrorlash", "Big review"), at:Date.now(), used:{}, scores:{} });
  const set = patch => C().setOpenNode("_game", Object.assign({}, meta.game, patch, { at:Date.now() }));
  const answersFor = qid => A().members().filter(s => s.sp1 && s.sp1.game && s.sp1.game.q === qid);
  function draw(){
    const g = meta.game && !meta.game.ended && meta.game.part === part ? meta.game : null;
    if (!g){
      $app().innerHTML = `<section class="panel game-start"><p class="eyebrow">${L("JONLI OʻYIN", "LIVE GAME")}</p><h1>“Savol-ball” · ${esc(pm.name)}</h1>
        <p class="panel-sub">${esc(pm.sub)}. ${L("Oʻquvchilar saytga kirib, «Jonli oʻyin» tugmasini bosadi va savollarga telefonda javob beradi.", "Pupils open the site, tap “Live game” and answer on their phones.")}</p>
        <button class="btn btn-accent btn-lg" id="gStart">${icon("play", 18)}${L("Oʻyinni boshlash", "Start the game")}</button></section>`;
      document.getElementById("gStart").onclick = () => start().catch(e => alert(e.message));
      return;
    }
    const scores = Object.entries(g.scores || {}).map(([u, s]) => Object.assign({ u }, s)).sort((a, b) => b.p - a.p);
    const q = g.q && g.q.open ? g.q : null, rev = g.reveal && g.q && g.reveal.qid === g.q.qid ? g.reveal : null;
    const ans = q || (g.q && rev) ? answersFor(g.q.qid) : [];
    $app().innerHTML = `
      <div class="section-title"><div><h1>“Savol-ball” · ${esc(pm.name)}</h1><p>${A().members().length} ${L("oʻquvchi", "pupils")} · ${L("oʻquvchilar", "pupils join at")} <b>#/play</b></p></div>
        <div class="toolbar"><button class="btn btn-ghost btn-sm" id="gEnd">${L("Oʻyinni tugatish", "End game")}</button></div></div>
      <div class="game-wrap">
        <div class="jeo" style="--cols:${cats.length}">${cats.map(l => `<div class="jeo-cat">${l.n}. ${esc(l.title)}</div>`).join("")}
          ${[100, 200, 300, 400].map(v => cats.map(l => { const key = l.n + "-" + v, used = (g.used || {})[key]; return `<button class="jeo-cell${used ? " used" : ""}" data-cell="${key}" ${used || q ? "disabled" : ""}>${used ? "✓" : v}</button>`; }).join("")).join("")}</div>
        <aside class="jeo-side"><h2>${L("Ballar", "Scores")}</h2><ol class="lb">${scores.length ? scores.slice(0, 12).map((s, i) => `<li><span class="lb-rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span><span class="lb-name">${esc(s.n)}</span><b>${s.p}</b></li>`).join("") : `<li class="panel-sub">${L("Hali ball yoʻq", "No points yet")}</li>`}</ol></aside>
      </div>
      ${q || rev ? `<div class="modal-backdrop jeo-modal"><div class="modal-card"><p class="eyebrow">${esc(g.q.cat)} · ${g.q.val}</p><h2 class="jeo-q">${gapHtml(g.q.text)}</h2>${g.q.uz ? `<p class="panel-sub">${esc(g.q.uz)}</p>` : ""}
        ${g.q.options ? `<div class="opt-row">${g.q.options.map(o => `<span class="opt${rev && check(answer || rev.a, o) ? " right" : ""}">${esc(o)}</span>`).join("")}</div>` : ""}
        ${rev ? `<p class="jeo-ans">✓ ${esc(rev.a)}</p><p class="panel-sub">${(rev.right || []).length} ${L("ta toʻgʻri javob", "correct")}: ${esc((rev.right || []).map(u => ((g.scores || {})[u] || {}).n || "").join(", "))}</p>`
          : `<p class="jeo-count"><b>${ans.length}</b> ${L("ta javob keldi", "answers in")}</p><p class="panel-sub">${esc(ans.map(s => String(s.name || s.email || "").split(" ")[0]).join(", "))}</p>`}
        <div class="modal-actions">${rev ? `<button class="btn btn-accent" id="gClose">${L("Doskaga qaytish", "Back to the board")}</button>` : `<button class="btn btn-ghost" id="gSkip">${L("Bekor qilish", "Cancel")}</button><button class="btn btn-accent" id="gReveal">${L("Javobni koʻrsatish", "Show the answer")}</button>`}</div></div></div>` : ""}`;
    document.getElementById("gEnd").onclick = () => { if (confirm(L("Oʻyin tugatilsinmi?", "End the game?"))) set({ ended:true, q:null }); };
    $app().querySelectorAll("[data-cell]").forEach(b => b.onclick = () => {
      const [ln, v] = b.dataset.cell.split("-").map(Number), qq = gameQuestion(ln, v); if (!qq) return;
      answer = qq.a;
      const lsn = lessonData(ln);
      set({ q:{ qid:Date.now(), key:b.dataset.cell, cat:ln + ". " + lsn.title, val:v, text:qq.text, uz:qq.uz, options:qq.options || null, open:true }, reveal:null });
    });
    const rv = document.getElementById("gReveal");
    if (rv) rv.onclick = () => {
      const a = answer || ""; const right = [], scores2 = Object.assign({}, g.scores || {});
      answersFor(g.q.qid).forEach(s => {
        const ok = g.q.options ? norm(s.sp1.game.a) === norm(a) || check(a, s.sp1.game.a) === true : check(a, s.sp1.game.a) === true;
        const nm = String(s.name || s.email || "").split(" ")[0];
        scores2[s.uid] = { n:nm, p:((scores2[s.uid] || {}).p || 0) + (ok ? g.q.val : 0) };
        if (ok) right.push(s.uid);
      });
      const used = Object.assign({}, g.used || {}); used[g.q.key] = 1;
      set({ q:Object.assign({}, g.q, { open:false }), reveal:{ qid:g.q.qid, a:firstAlt(a), right }, scores:scores2, used });
    };
    const sk = document.getElementById("gSkip"); if (sk) sk.onclick = () => set({ q:null, reveal:null });
    const cl = document.getElementById("gClose"); if (cl) cl.onclick = () => set({ q:null });
  }
  hostRedraw = draw;
  cleanup = () => { hostRedraw = null; };
  void g0;
  draw();
}
/* answers arrive through the student list: redraw the open question's counter */
function onPeople(){
  publishBoard();
  if (hostRedraw && /^#\/game\//.test(location.hash) && meta.game && meta.game.q && meta.game.q.open && !document.querySelector(".jeo-modal input:focus")) hostRedraw();
  if (/^#\/dashboard/.test(location.hash) && dashRedraw && !(document.activeElement && document.activeElement.closest && document.activeElement.closest(".dash-filters, input, select, textarea"))) dashRedraw();
}

/* ---------------- live game: pupil ---------------- */
function viewPlay(){ drawPlay(); }
function drawPlay(){
  if (!/^#\/play/.test(location.hash)) return;
  const g = meta.game, p = ensure(), me = C().uid;
  gameBanner();
  if (!g || g.ended || !gameLive()){
    const sc = g && g.scores ? Object.entries(g.scores).map(([u, s]) => Object.assign({ u }, s)).sort((a, b) => b.p - a.p) : [];
    $app().innerHTML = `<section class="panel empty-big"><div class="big-emoji">🎮</div><h2>${L("Hozir jonli oʻyin yoʻq", "No live game right now")}</h2><p class="panel-sub">${L("Oʻqituvchi oʻyinni boshlaganda bu yerda savollar chiqadi.", "Questions appear here when your teacher starts a game.")}</p>
      ${sc.length ? `<h3>${L("Oxirgi oʻyin natijalari", "Last game")}</h3><ol class="lb">${sc.slice(0, 10).map((s, i) => `<li class="${s.u === me ? "me" : ""}"><span class="lb-rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span><span class="lb-name">${esc(s.n)}</span><b>${s.p}</b></li>`).join("")}</ol>` : ""}</section>`;
    return;
  }
  const q = g.q, sent = q && p.game && p.game.q === q.qid ? p.game.a : null;
  const rev = g.reveal && q && g.reveal.qid === q.qid ? g.reveal : null;
  const myScore = ((g.scores || {})[me] || {}).p || 0;
  const head = `<div class="play-head"><b>🎮 ${esc(g.title || "")}</b><span class="chip accent">${myScore} ${L("ball", "pts")}</span></div>`;
  if (!q){ $app().innerHTML = `${head}<section class="panel empty-big"><div class="big-emoji">⏳</div><h2>${L("Keyingi savolni kuting…", "Wait for the next question…")}</h2><p class="panel-sub">${L("Oʻqituvchi doskadan savol tanlayapti.", "Your teacher is picking a question.")}</p></section>`; return; }
  if (rev){
    const ok = (rev.right || []).includes(me);
    if (ok && !(p.gameXp || {})[q.qid]){ p.gameXp = Object.assign({}, p.gameXp || {}); Object.keys(p.gameXp).slice(0, -20).forEach(k => delete p.gameXp[k]); p.gameXp[q.qid] = 1; A().saveProgress(); addXp(Math.round(q.val / 10)); }
    $app().innerHTML = `${head}<section class="panel empty-big play-rev ${ok ? "ok" : sent ? "bad" : ""}"><div class="big-emoji">${ok ? "🎉" : sent ? "😕" : "⌛"}</div>
      <h2>${ok ? L("Toʻgʻri!", "Correct!") + ` +${q.val}` : sent ? L("Afsus, notoʻgʻri", "Not this time") : L("Javob yubormadingiz", "You didn't answer")}</h2>
      <p class="jeo-ans">✓ ${esc(rev.a)} ${say(fillBlank(q.text, rev.a))}</p>${sent ? `<p class="panel-sub">${L("Sizning javobingiz", "Your answer")}: ${esc(sent)}</p>` : ""}</section>`;
    return;
  }
  if (sent != null){ $app().innerHTML = `${head}<section class="panel empty-big"><div class="big-emoji">✅</div><h2>${L("Javob yuborildi!", "Answer sent!")}</h2><p class="panel-sub">${esc(sent)} · ${L("natijani kuting…", "wait for the result…")}</p></section>`; return; }
  $app().innerHTML = `${head}<section class="panel play-q"><p class="eyebrow">${esc(q.cat)} · ${q.val}</p><h2 class="jeo-q">${gapHtml(q.text)}</h2>${q.uz ? `<p class="panel-sub">${esc(q.uz)}</p>` : ""}
    ${q.options ? `<div class="opt-row play-opts">${q.options.map(o => `<button class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>`
      : `<div class="in-row"><input class="it-in" id="playIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${L("Javobingiz…", "Your answer…")}"><button class="btn btn-accent" id="playGo">${L("Yuborish", "Send")}</button></div>`}</section>`;
  const send = v => { if (!String(v || "").trim()) return; p.game = { q:q.qid, a:String(v).trim().slice(0, 200), at:Date.now() }; A().saveProgress(); C().savePractice({ game:p.game }); drawPlay(); };
  $app().querySelectorAll(".play-opts .opt").forEach(b => b.onclick = () => send(b.dataset.v));
  const go = document.getElementById("playGo"), inp = document.getElementById("playIn");
  if (go){ go.onclick = () => send(inp.value); inp.onkeydown = e => { if (e.key === "Enter") send(inp.value); }; }
}

/* ---------------- teacher dashboard ---------------- */
let dashRedraw = null;
const dashState = { part:0, cls:"all", wrongSrc:"all" };
function hwAuto(h, inputs){
  let c = 0, t = 0, filled = 0;
  (h.keys || []).forEach((k, i) => {
    if (!k || k.open) return; t++;
    const v = (inputs || [])[i]; if (v && String(v).trim()){ filled++; if (check(k.a.join(" / "), v) === true || k.a.some(a => check(a, v) === true)) c++; }
  });
  return { c, t, filled };
}
function viewDashboard(){
  if (!isStaff()) return A().notFound();
  const D = A().D;
  const revs = {}, offs = [];
  const watched = new Set();
  const watchRevs = list => list.forEach(s => { if (watched.has(s.uid)) return; watched.add(s.uid); offs.push(C().watchReviewsOf(s.uid, v => { revs[s.uid] = v || {}; if (dashRedraw) dashRedraw(); })); });
  cleanup = () => { offs.forEach(f => f()); dashRedraw = null; };
  function draw(){
    const all = A().members(), mineIds = new Set(A().myClass().map(s => s.uid));
    const kids = dashState.cls === "mine" ? all.filter(s => mineIds.has(s.uid)) : all;
    watchRevs(kids);
    const lessons = D.units.filter(u => u.type === "lesson" && (!dashState.part || u.part === dashState.part));
    const checks = course().checks.filter(c => !dashState.part || D.units.some(u => u.type === "quiz" && u.num === c.k && u.part === dashState.part));
    const cell = (s, u) => {
      const h = A().hwOfLesson(u.num), p = s.sp1, rv = (revs[s.uid] || {})[h ? h.num : -1];
      const filled = h ? (p.hwInputs[h.num] || []).filter(x => x).length : 0;
      const hs = !h ? "" : rv && rv.checked ? "✔" : p.hwDone[h.num] ? "✓" : filled ? "✎" : "·";
      const ps = practiceStats(u.num, p);
      const au = h && filled ? hwAuto(h, p.hwInputs[h.num]) : null;
      const cls = rv && rv.checked ? "c-ok" : p.hwDone[h ? h.num : -1] ? "c-done" : filled ? "c-prog" : "";
      return `<td class="dc ${cls}"><a href="${h ? `#/hw/${h.num}?s=${encodeURIComponent(s.uid)}` : "#"}" title="${esc(L("Uy vazifasi", "Homework"))}${au ? ` · ${L("avto", "auto")} ${au.c}/${au.t}` : ""}${ps.t ? ` · ${L("mashq", "practice")} ${Math.round(ps.pct * 100)}%` : ""}${ps.exit ? ` · ${L("chipta", "ticket")} ${ps.exit.c}/${ps.exit.t}` : ""}">
        <b>${hs}</b>${au ? `<small>${Math.round(au.c / Math.max(1, au.t) * 100)}%</small>` : ""}<i>${ps.t ? Math.round(ps.pct * 100) + "%" : ""}${ps.exit ? " 🎟" + ps.exit.c : ""}</i></a></td>`;
    };
    // most common wrong items across the class
    const agg = {};
    kids.forEach(s => {
      if (dashState.wrongSrc !== "hw") Object.keys(s.sp1.wrong || {}).forEach(id => { const r = resolve(id); if (!r || (dashState.part && !lessons.some(u => u.num === r.lesson))) return; const a = agg[id] = agg[id] || { id, n:0, kids:0, r }; a.n += s.sp1.wrong[id]; a.kids++; });
      if (dashState.wrongSrc !== "px") lessons.forEach(u => { const h = A().hwOfLesson(u.num); if (!h) return; const inp = s.sp1.hwInputs[h.num] || [];
        (h.keys || []).forEach((k, i) => { if (!k || k.open || !inp[i] || !String(inp[i]).trim() || k.a.some(a => check(a, inp[i]) === true)) return;
          const id = "h" + h.num + "-" + i, a = agg[id] = agg[id] || { id, n:0, kids:0, r:{ lesson:u.num, src:`${L("UV", "HW")} ${u.num} · ${k.ex}-${L("mashq", "ex")}, ${k.i}`, q:k.q || "", a:k.a.join(" / ") }, given:{} };
          a.n++; a.kids++; const g = norm(inp[i]); a.given[g] = (a.given[g] || 0) + 1; }); });
    });
    const top = Object.values(agg).sort((a, b) => b.kids - a.kids || b.n - a.n).slice(0, 15);
    $app().innerHTML = `
      <div class="section-title"><div><h1>${L("Oʻqituvchi paneli", "Teacher dashboard")}</h1><p>${kids.length} ${L("oʻquvchi", "pupils")} · ${L("uy vazifasi, mashq, chiqish chiptasi va nazorat natijalari", "homework, practice, exit tickets and checks")}</p></div>
        <div class="toolbar"><button class="btn btn-sm" id="csvBtn">${icon("download", 16)}CSV</button></div></div>
      <section class="panel dash-filters">
        <div class="seg">${[0, 1, 2, 3].map(p => `<button class="seg-b${dashState.part === p ? " on" : ""}" data-part="${p}">${p ? A().partName(p) : L("Hammasi", "All")}</button>`).join("")}</div>
        <div class="seg"><button class="seg-b${dashState.cls === "all" ? " on" : ""}" data-cls="all">${L("Hamma oʻquvchilar", "All pupils")}</button><button class="seg-b${dashState.cls === "mine" ? " on" : ""}" data-cls="mine">${A().t("myClassLbl")}</button></div>
        <label class="lb-toggle"><input type="checkbox" id="lbOn" ${(meta.lb[C().uid] || {}).on !== false ? "checked" : ""}> ${L("Sinf reytingi oʻquvchilarga koʻrinsin", "Show the class leaderboard to pupils")}</label>
      </section>
      ${!kids.length ? `<section class="panel"><p class="panel-sub">${A().t("noMembers")}</p></section>` : `
      <section class="panel"><div class="panel-head-row"><div><h2>${L("Darslar boʻyicha", "By lesson")}</h2>
        <p class="panel-sub">${L("Har bir katak: uy vazifasi holati (✔ tekshirildi · ✓ bajarildi · ✎ jarayonda), avto-tekshiruv %, mashq % va chiqish chiptasi. Katakni bossangiz uy vazifasi ochiladi.", "Each cell: homework (✔ checked · ✓ done · ✎ in progress), auto-check %, practice % and exit ticket. Tap a cell to open the homework.")}</p></div></div>
        <div class="dash-wrap"><table class="dash"><thead><tr><th class="dn">${L("Oʻquvchi", "Pupil")}</th><th>XP</th>${lessons.map(u => `<th title="${esc(u.title)}">${u.num}</th>`).join("")}</tr></thead>
          <tbody>${kids.map(s => `<tr><th class="dn"><a href="#/student/${encodeURIComponent(s.uid)}">${esc(s.name || s.email)}</a><small>🔥${streakOf(s.sp1)} · ${A().fmtAgo(s.sp1.updatedAt || s.lastActive)}</small></th><td class="dxp">${s.sp1.xp || 0}</td>${lessons.map(u => cell(s, u)).join("")}</tr>`).join("")}</tbody></table></div></section>
      <section class="panel"><h2>${L("Nazorat ishlari (onlayn test)", "Progress checks (online)")}</h2>
        <div class="dash-wrap"><table class="dash"><thead><tr><th class="dn">${L("Oʻquvchi", "Pupil")}</th>${checks.map(c => `<th>K${c.k}</th>`).join("")}</tr></thead>
          <tbody>${kids.map(s => `<tr><th class="dn">${esc(s.name || s.email)}</th>${checks.map(c => { const r = (s.sp1.chk || {})[c.k]; return `<td class="dc ${r ? (r.c / r.t >= 0.8 ? "c-ok" : r.c / r.t >= 0.5 ? "c-done" : "c-prog") : ""}">${r ? `<b>${Math.round(r.c / r.t * 100)}%</b><small>${r.c}/${r.t}</small>` : "·"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div></section>
      <section class="panel"><div class="panel-head-row"><div><h2>${L("Eng koʻp xato qilingan savollar", "Most common wrong answers")}</h2><p class="panel-sub">${L("Nimani qayta tushuntirish kerakligini koʻrsatadi.", "Shows what to re-teach.")}</p></div>
        <div class="seg">${[["all", L("Hammasi", "All")], ["px", L("Mashq", "Practice")], ["hw", L("Uy vazifasi", "Homework")]].map(([k, lab]) => `<button class="seg-b${dashState.wrongSrc === k ? " on" : ""}" data-wsrc="${k}">${lab}</button>`).join("")}</div></div>
        ${top.length ? `<ol class="wrong-list">${top.map(w => `<li><div class="wl-q"><span class="chip">${w.r.lesson}-${L("dars", "lesson")} · ${esc(w.r.src || (w.r.kind === "word" ? L("soʻz", "word") : ""))}</span>
          <b>${w.r.kind === "word" ? esc(w.r.en + " — " + w.r.uz) : esc(w.r.q || "")}</b>${w.r.uz && w.r.kind !== "word" ? `<small>${esc(w.r.uz)}</small>` : ""}</div>
          <div class="wl-a">✓ ${esc(w.r.kind === "word" ? w.r.en : String(w.r.a || ""))}${w.given ? `<small>${L("Koʻp yozilgan", "Often written")}: ${esc(Object.entries(w.given).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0] + (x[1] > 1 ? " ×" + x[1] : "")).join(" · "))}</small>` : ""}</div>
          <div class="wl-n"><b>${w.kids}</b><small>${L("oʻquvchi", "pupils")}</small></div></li>`).join("")}</ol>` : `<p class="panel-sub">${L("Hozircha xato yoʻq.", "No mistakes yet.")}</p>`}</section>`}
      <section class="panel"><h2>${L("Jonli oʻyin", "Live game")}</h2><p class="panel-sub">${L("“Katta takrorlash” Savol-ball oʻyini: doska ekranda, oʻquvchilar telefonda.", "The big-review Jeopardy: board on screen, pupils on phones.")}</p>
        <div class="toolbar">${[1, 2, 3].map(p => `<a class="btn btn-sm" href="#/game/${p}">${icon("play", 14)}${A().partName(p)}</a>`).join("")}<a class="btn btn-sm btn-ghost" href="#/materials">${icon("folder", 14)}${A().t("materials")}</a></div></section>`;
    $app().querySelectorAll("[data-part]").forEach(b => b.onclick = () => { dashState.part = +b.dataset.part; draw(); });
    $app().querySelectorAll("[data-cls]").forEach(b => b.onclick = () => { dashState.cls = b.dataset.cls; draw(); });
    $app().querySelectorAll("[data-wsrc]").forEach(b => b.onclick = () => { dashState.wrongSrc = b.dataset.wsrc; draw(); });
    const lo = document.getElementById("lbOn"); if (lo) lo.onchange = () => setBoardOn(lo.checked).then(() => { toast(lo.checked ? L("Reyting yoqildi", "Leaderboard on") : L("Reyting oʻchirildi", "Leaderboard off")); publishBoard(true); }).catch(e => alert(e.message));
    document.getElementById("csvBtn").onclick = () => csv(kids, revs);
  }
  dashRedraw = draw;
  draw();
}
function csv(kids, revs){
  const D = A().D, q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const rows = [["Oʻquvchi", "Email", "Dars", "Mavzu", "Uy vazifasi", "UV toʻldirilgan", "UV avto-tekshiruv", "UV oʻqituvchi bahosi", "Mashqlar bajarildi", "Mashq %", "Chiqish chiptasi", "XP", "Streak"]];
  kids.forEach(s => {
    const p = s.sp1;
    D.units.filter(u => u.type === "lesson").forEach(u => {
      const h = A().hwOfLesson(u.num), rv = h ? (revs[s.uid] || {})[h.num] : null, inp = h ? p.hwInputs[h.num] || [] : [];
      const au = h ? hwAuto(h, inp) : { c:0, t:0 }, st = practiceStats(u.num, p), m = Object.values((rv && rv.marks) || {});
      const status = rv && rv.checked ? "tekshirildi" : h && p.hwDone[h.num] ? "bajarildi" : inp.some(x => x) ? "jarayonda" : "";
      rows.push([s.name || "", s.email || "", u.num, u.title, status, inp.filter(x => x).length, inp.some(x => x) ? au.c + "/" + au.t : "", m.length ? m.filter(x => x === 1).length + "/" + m.length : "",
        st.exN + "/8", st.t ? Math.round(st.pct * 100) + "%" : "", st.exit ? st.exit.c + "/" + st.exit.t : "", p.xp || 0, streakOf(p)]);
    });
    course().checks.forEach(c => { const r = (p.chk || {})[c.k]; if (r) rows.push([s.name || "", s.email || "", "K" + c.k, c.titleUz, "nazorat", "", "", "", "", Math.round(r.c / r.t * 100) + "%", r.c + "/" + r.t, p.xp || 0, streakOf(p)]); });
  });
  const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "speakup1-natijalar-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------------- merge a cloud copy into this device ---------------- */
function merge(remote){
  if (!remote) return;
  const p = ensure(), u = {};
  if ((remote.xp || 0) > (p.xp || 0)) p.xp = remote.xp; else if ((p.xp || 0) > (remote.xp || 0)) u.xp = p.xp;
  Object.keys(remote.days || {}).forEach(k => { if ((remote.days[k] || 0) > (p.days[k] || 0)) p.days[k] = remote.days[k]; });
  Object.keys(p.days).forEach(k => { if ((p.days[k] || 0) > ((remote.days || {})[k] || 0)) u["days/" + k] = p.days[k]; });
  Object.keys(remote.badges || {}).forEach(k => { if (!p.badges[k]) p.badges[k] = remote.badges[k]; });
  Object.keys(p.badges).forEach(k => { if (!(remote.badges || {})[k]) u["badges/" + k] = p.badges[k]; });
  Object.keys(remote.px || {}).forEach(n => { p.px[n] = p.px[n] || {}; Object.keys(remote.px[n] || {}).forEach(k => { const r = remote.px[n][k], l = p.px[n][k]; if (r && (!l || (r.at || 0) > (l.at || 0))) p.px[n][k] = r; }); });
  Object.keys(p.px).forEach(n => Object.keys(p.px[n] || {}).forEach(k => { const r = ((remote.px || {})[n] || {})[k], l = p.px[n][k]; if (l && (!r || (l.at || 0) > (r.at || 0))) u["px/" + n + "/" + k] = l; }));
  Object.keys(remote.srs || {}).forEach(id => { const r = remote.srs[id], l = p.srs[id]; if (Array.isArray(r) && (!l || (r[1] || 0) > (l[1] || 0))) p.srs[id] = r; });
  Object.keys(p.srs).forEach(id => { const r = (remote.srs || {})[id], l = p.srs[id]; if (!r || (l[1] || 0) > (r[1] || 0)) u["srs/" + id] = l; });
  Object.keys(remote.wrong || {}).forEach(id => { if ((remote.wrong[id] || 0) > (p.wrong[id] || 0)) p.wrong[id] = remote.wrong[id]; });
  Object.keys(p.wrong).forEach(id => { if ((p.wrong[id] || 0) > ((remote.wrong || {})[id] || 0)) u["wrong/" + id] = p.wrong[id]; });
  Object.keys(remote.chk || {}).forEach(k => { const r = remote.chk[k], l = p.chk[k]; if (r && (!l || (r.at || 0) > (l.at || 0))) p.chk[k] = r; });
  Object.keys(p.chk).forEach(k => { const r = (remote.chk || {})[k], l = p.chk[k]; if (l && (!r || (l.at || 0) > (r.at || 0))) u["chk/" + k] = l; });
  if (remote.game && (!p.game || (remote.game.at || 0) > (p.game.at || 0))) p.game = remote.game;
  A().saveProgress();
  if (Object.keys(u).length) Object.assign(dirty, u), clearTimeout(syncT), syncT = setTimeout(flush, 1500);
}

/* ---------------- router ---------------- */
function route(parts){
  leave();
  const r = parts[0];
  if (!course()) return false;
  if (r === "practice"){ viewPractice(+parts[1], parts[2] || ""); return true; }
  if (r === "review"){ viewReview(); return true; }
  if (r === "check"){ viewCheck(+parts[1]); return true; }
  if (r === "me"){ viewMe(); return true; }
  if (r === "dashboard"){ viewDashboard(); return true; }
  if (r === "game"){ viewGameHost(+parts[1] || 1); return true; }
  if (r === "play"){ viewPlay(); return true; }
  return false;
}

window.SP1Learn = {
  route, leave, onOpen, onPeople, merge, homeStrip, lessonCard, dueCount, refreshNavBadge, gameBanner,
  check, norm, hwAuto, speak, say, get enabled(){ return !!course(); },
  /* the homework sheet: listen buttons next to English example lines, and the student's own self-check */
  checkHomework(h, inputs){
    return (h.keys || []).map((k, i) => (!k || k.open || !inputs[i] || !String(inputs[i]).trim()) ? null : k.a.some(a => check(a, inputs[i]) === true) ? true : check(k.a.join(" / "), inputs[i]) === null ? null : false);
  },
};
})();
