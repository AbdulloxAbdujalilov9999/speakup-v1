/* SpeakUp-1 — English from Zero.
 * Course engine: lessons (presented from the original PDF exports of the
 * pptx decks), checkpoint tests, one homework per lesson, answer key and
 * the full materials library. Content comes from data/content.js, which
 * tools/extract.py generates from the Speakup-1 folder. */
(function(){
"use strict";

const D = window.SU1;
D.units.forEach(u => { u.objectives = (u.objectives || []).filter(o => !/^\d+$/.test(o.trim())); });
const $app = document.getElementById("app");
const $nav = document.getElementById("mainNav");
const $actions = document.getElementById("topActions");
const $presenterRoot = document.getElementById("presenterRoot");

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

/* ---------------- storage ---------------- */
function load(key, fallback){
  try{ const v = JSON.parse(localStorage.getItem(key) || "null"); return v && typeof v === "object" ? v : fallback; }
  catch(e){ return fallback; }
}
function save(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
const settings = Object.assign({ lang:"uz", teacher:true, skipAnswers:false }, load("sp1_settings", {}));
const progress = Object.assign({ taught:{}, hwDone:{}, hwInputs:{}, hwChecks:{}, lastSlide:{} }, load("sp1_progress", {}));
const saveSettings = () => save("sp1_settings", settings);
const saveProgress = () => save("sp1_progress", progress);

/* ---------------- i18n ---------------- */
const T = {
  home:["Bosh sahifa","Home"], lessons:["Darslar","Lessons"], homeworks:["Uy vazifalari","Homeworks"],
  answers:["Javoblar","Answer key"], materials:["Materiallar","Materials"],
  teacher:["Oʻqituvchi","Teacher"], student:["Oʻquvchi","Student"],
  lesson:["dars","Lesson"], quiz:["nazorat ishi","Checkpoint test"], part:["qism","Part"],
  intro:["Kirish","Introduction"], outro:["Yakun","Wrap-up"],
  slides:["slayd","slides"], startLesson:["Darsni boshlash","Start lesson"], continueFrom:["Davom ettirish","Continue"],
  present:["Taqdimot","Present"], markTaught:["Oʻtildi deb belgilash","Mark as taught"], taught:["Oʻtildi","Taught"],
  unmark:["Belgini olib tashlash","Unmark"], homework:["Uy vazifasi","Homework"],
  openHomework:["Uy vazifasini ochish","Open homework"], openLesson:["Darsni ochish","Open lesson"],
  downloadPptx:["PPTX yuklab olish","Download PPTX"], openPdf:["PDF ochish","Open PDF"], downloadDocx:["DOCX yuklab olish","Download DOCX"],
  print:["Chop etish","Print"], clear:["Tozalash","Clear"], done:["Bajarildi","Done"], markDone:["Bajarildi deb belgilash","Mark as done"],
  checked:["Tekshirildi","Checked"], upNext:["KEYINGI DARS","UP NEXT"], allTaught:["Barcha darslar oʻtildi!","All lessons taught!"],
  lessonsTaught:["Darslar","Lessons"], hwDone:["Uy vazifalari","Homeworks"], quizzesHeld:["Nazorat","Tests"],
  courseTitle:["Noldan ingliz tili","English from Zero"],
  courseSub:["3 qism · 30 dars · 15 nazorat ishi · 30 uy vazifasi. Darsni shu yerdan taqdimot qiling, uy vazifasini bering va tekshiring.","3 parts · 30 lessons · 15 checkpoint tests · 30 homeworks. Present lessons from here, assign and check homework."],
  whatWeLearn:["Bugun oʻrganamiz","Today we learn"], slidesOfLesson:["Dars slaydlari","Lesson slides"],
  pairedHw:["Shu darsning uy vazifasi","This lesson's homework"], noHw:["Nazorat ishida uy vazifasi yoʻq.","Checkpoint tests have no homework."],
  prev:["Oldingi","Previous"], next:["Keyingi","Next"], outline:["Mundarija","Outline"], fullscreen:["Toʻliq ekran","Fullscreen"],
  hideAnswers:["Javoblarni oʻtkazish","Skip answers"], close:["Yopish","Close"],
  endTitle:["Dars tugadi!","Lesson complete!"], endSub:["Darsni oʻtildi deb belgilang va oʻquvchilarga uy vazifasini bering.","Mark the lesson as taught and give the students their homework."],
  endTitleQuiz:["Nazorat ishi tugadi!","Test complete!"], backToLesson:["Darsga qaytish","Back to lesson"],
  nextUnit:["Keyingi mavzu","Next unit"], markAndHw:["Belgilash va uy vazifasi","Mark taught & open homework"],
  search:["Qidirish: dars raqami yoki mavzu…","Search: lesson number or topic…"],
  answerKeyFor:["Javoblar (faqat oʻqituvchi uchun)","Answers (teacher only)"],
  teacherOnly:["Javoblar faqat Oʻqituvchi rejimida koʻrinadi.","The answer key is visible in Teacher mode only."],
  switchTeacher:["Oʻqituvchi rejimiga oʻtish","Switch to Teacher mode"],
  hwNote:["Boʻsh joylarga javob yozing — ular shu qurilmada saqlanadi.","Type answers into the blanks — they are saved on this device."],
  allFiles:["Speakup-1 papkasidagi barcha fayllar","Every file from the Speakup-1 folder"],
  lessonDecks:["Dars taqdimotlari","Lesson decks"], hwFiles:["Uy vazifalari","Homeworks"], akFiles:["Javoblar kaliti","Answer key"],
  open:["Ochish","Open"], download:["Yuklab olish","Download"], loading:["Yuklanmoqda…","Loading…"],
  pdfError:["Slaydni yuklab boʻlmadi. Saytni oddiy server orqali oching (README ga qarang).","Could not load the slides. Open the site through a local server (see README)."],
  lessonsWord:["darslar","lessons"], coursePlan:["Kurs rejasi","Course plan"], cleared:["Tozalandi","Cleared"],
  saved:["Saqlandi","Saved"], theme:["Mavzu","Theme"]
};
const t = k => (T[k] ? T[k][settings.lang === "en" ? 1 : 0] : k);

/* ---------------- helpers ---------------- */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const href = p => encodeURI(p);
const keyOf = u => u.type + "-" + u.num;
const unitByKey = k => D.units.find(u => keyOf(u) === k);
const lessons = D.units.filter(u => u.type === "lesson");
const quizzes = D.units.filter(u => u.type === "quiz");
const hwByNum = n => D.homeworks.find(h => h.num === n);
const partOf = u => D.parts[u.part - 1];

function unitName(u){
  if (u.type === "lesson") return settings.lang === "en" ? "Lesson " + u.num : u.num + "-" + t("lesson");
  if (u.type === "quiz") return settings.lang === "en" ? "Checkpoint test " + u.num : u.num + "-" + t("quiz");
  if (u.type === "intro") return t("intro") + " · " + partName(u.part);
  return t("outro") + " · " + partName(u.part);
}
function partName(n){ return settings.lang === "en" ? "Part " + n : n + "-" + t("part"); }
function badgeTxt(u){
  if (u.type === "lesson") return ["DARS", u.num];
  if (u.type === "quiz") return ["TEST", u.num];
  return [u.type === "intro" ? "KIRISH" : "YAKUN", "★"];
}

const I = (name, size) => {
  const p = {
    home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    book:'<path d="M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4z"/><path d="M20 4h-6a3 3 0 00-3 3v13a2 2 0 012-2h7z"/>',
    pencil:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
    folder:'<path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    play:'<path d="M7 4l13 8-13 8z"/>', check:'<path d="M4 12l5 5L20 6"/>',
    left:'<path d="M15 5l-7 7 7 7"/>', right:'<path d="M9 5l7 7-7 7"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    max:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
    download:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', print:'<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    file:'<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>', board:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20l4-4 4 4"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', moon:'<path d="M20 15A8 8 0 019 4a8 8 0 1011 11z"/>',
    skip:'<path d="M5 5l8 7-8 7zM15 5v14"/>'
  }[name] || "";
  const s = size || 20;
  return `<svg class="icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
};

function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg; el.className = "show";
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.className = ""; }, 1800);
}

/* ---------------- header ---------------- */
const NAV = [["#/", "home", "home"], ["#/lessons", "lessons", "board"], ["#/homeworks", "homeworks", "pencil"], ["#/answers", "answers", "key"], ["#/materials", "materials", "folder"]];
function renderChrome(route){
  $nav.innerHTML = NAV.map(([h, k, ic]) => {
    const active = (h === "#/" ? route === "" : route.startsWith(h.slice(2))) ||
      (k === "lessons" && route.startsWith("u/")) || (k === "homeworks" && route.startsWith("hw/"));
    return `<a class="navbtn${active ? " active" : ""}" href="${h}" style="text-decoration:none"><span class="nav-icon">${I(ic)}</span><span>${t(k)}</span></a>`;
  }).join("");
  $actions.innerHTML = `
    <button class="mode-toggle${settings.teacher ? " on" : ""}" id="modeBtn" title="${t("teacher")} / ${t("student")}">${I(settings.teacher ? "board" : "user", 16)}${settings.teacher ? t("teacher") : t("student")}</button>
    <div class="lang-switch"><button data-lang="uz" class="${settings.lang === "uz" ? "active" : ""}">UZ</button><button data-lang="en" class="${settings.lang === "en" ? "active" : ""}">EN</button></div>
    <button class="mode-toggle" id="themeBtn" title="${t("theme")}" aria-label="${t("theme")}">${I("moon", 16)}</button>`;
  document.getElementById("modeBtn").onclick = () => { settings.teacher = !settings.teacher; saveSettings(); route_(); };
  $actions.querySelectorAll("[data-lang]").forEach(b => b.onclick = () => { settings.lang = b.dataset.lang; saveSettings(); document.documentElement.lang = settings.lang; route_(); });
  document.getElementById("themeBtn").onclick = () => {
    const cur = document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    settings.theme = cur === "dark" ? "light" : "dark"; saveSettings();
    document.documentElement.setAttribute("data-theme", settings.theme);
  };
}

/* ---------------- views ---------------- */
function ring(pct){
  const r = 38, c = 2 * Math.PI * r;
  return `<div class="ring"><svg width="88" height="88" viewBox="0 0 88 88"><circle cx="44" cy="44" r="${r}" fill="none" stroke="rgba(247,250,255,0.15)" stroke-width="8"/>
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="#FF6B4A" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 44 44)"/></svg>
    <div class="ring-num">${Math.round(pct * 100)}<small>%</small></div></div>`;
}

function viewHome(){
  const taughtN = lessons.filter(u => progress.taught[keyOf(u)]).length;
  const quizN = quizzes.filter(u => progress.taught[keyOf(u)]).length;
  const hwN = D.homeworks.filter(h => progress.hwDone[h.num]).length;
  const next = D.units.find(u => (u.type === "lesson" || u.type === "quiz") && !progress.taught[keyOf(u)]);
  const nb = next ? badgeTxt(next) : null;
  $app.innerHTML = `
  <section class="hero-strip">
    <div class="hero-top">
      <div class="hero-left">
        <p class="eyebrow">SPEAKUP-1</p>
        <h1 class="hwy-title">${t("courseTitle")}</h1>
        <p class="hero-sub">${t("courseSub")}</p>
      </div>
      ${ring(taughtN / lessons.length)}
    </div>
    ${next ? `<div class="upnext">
      <div class="upnext-badge"><small>${nb[0]}</small><b>${nb[1]}</b></div>
      <div class="upnext-text"><p class="upnext-label">${t("upNext")}</p><h2>${esc(next.title)}</h2>
        <p class="upnext-meta">${esc(unitName(next))} · ${partName(next.part)} · ${next.slides.length} ${t("slides")}</p></div>
      ${settings.teacher ? `<a class="btn btn-accent" href="#/present/${keyOf(next)}">${I("play", 18)}${t("startLesson")}</a>` : `<a class="btn btn-accent" href="#/u/${keyOf(next)}">${t("openLesson")}</a>`}
    </div>` : `<div class="upnext"><div class="upnext-text"><h2>${t("allTaught")}</h2></div></div>`}
    <div class="hero-stats">
      <div class="stat-tile"><span class="stat-ico">${I("board", 18)}</span><span class="stat-num">${taughtN}<span class="stat-den">/${lessons.length}</span></span><span class="stat-label">${t("lessonsTaught")}</span></div>
      <div class="stat-tile"><span class="stat-ico">${I("pencil", 18)}</span><span class="stat-num">${hwN}<span class="stat-den">/${D.homeworks.length}</span></span><span class="stat-label">${t("hwDone")}</span></div>
      <div class="stat-tile"><span class="stat-ico">${I("check", 18)}</span><span class="stat-num">${quizN}<span class="stat-den">/${quizzes.length}</span></span><span class="stat-label">${t("quizzesHeld")}</span></div>
    </div>
  </section>
  <section class="quick" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
    <a class="quick-tile" href="#/lessons" style="text-decoration:none"><span class="quick-ico">${I("board", 24)}</span><span class="quick-t">${t("lessons")}</span><span class="quick-s">30 · ${quizzes.length} ${t("quizzesHeld").toLowerCase()}</span></a>
    <a class="quick-tile" href="#/homeworks" style="text-decoration:none"><span class="quick-ico">${I("pencil", 24)}</span><span class="quick-t">${t("homeworks")}</span><span class="quick-s">${D.homeworks.length}</span></a>
    <a class="quick-tile" href="#/answers" style="text-decoration:none"><span class="quick-ico">${I("key", 24)}</span><span class="quick-t">${t("answers")}</span><span class="quick-s">1–30</span></a>
    <a class="quick-tile" href="#/materials" style="text-decoration:none"><span class="quick-ico">${I("folder", 24)}</span><span class="quick-t">${t("materials")}</span><span class="quick-s">PPTX · PDF · DOCX</span></a>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>${t("coursePlan")}</h2></div>
    <div class="unit-list">${D.parts.map(p => {
      const ls = lessons.filter(u => u.part === p.num), done = ls.filter(u => progress.taught[keyOf(u)]).length;
      return `<a class="unit-row" href="#/lessons?part=${p.num}" style="text-decoration:none">
        <span class="unit-badge"><small>QISM</small><b>${p.num}</b></span>
        <span class="unit-main"><h3>${esc(p.title)}</h3><p class="unit-meta">${ls[0].num}–${ls[ls.length - 1].num} ${t("lessonsWord")}: ${ls.map(u => esc(u.title)).join(" · ")}</p>
        <span class="progressbar" style="display:block;margin:8px 0 0;height:6px"><span class="progressbar-fill" style="display:block;width:${done / ls.length * 100}%"></span></span></span>
        <span class="unit-side"><span class="chip">${done}/${ls.length}</span></span></a>`;
    }).join("")}</div>
  </section>`;
}

function unitRow(u){
  const k = keyOf(u), b = badgeTxt(u), done = !!progress.taught[k];
  const cls = u.type === "quiz" ? "quiz" : (u.type === "lesson" ? "" : "extra");
  const hw = u.type === "lesson" && hwByNum(u.num);
  return `<a class="unit-row ${cls}${done ? " done" : ""}" href="#/u/${k}" style="text-decoration:none">
    <span class="unit-badge"><small>${b[0]}</small><b>${done ? I("check", 22) : b[1]}</b></span>
    <span class="unit-main"><h3>${esc(u.title)}</h3><p class="unit-meta">${esc(unitName(u))} · ${u.slides.length} ${t("slides")}${u.objectives && u.objectives.length ? " · " + esc(u.objectives.slice(0, 3).join(" · ")) : ""}</p></span>
    <span class="unit-side">${done ? `<span class="chip ok">${t("taught")}</span>` : ""}${u.type === "quiz" ? `<span class="chip quiz">${t("quizzesHeld")}</span>` : ""}${hw ? `<span class="chip${progress.hwDone[u.num] ? " ok" : " accent"}">${t("homework")} ${u.num}</span>` : ""}</span>
  </a>`;
}

function viewLessons(query){
  const only = +(new URLSearchParams(query).get("part") || 0);
  $app.innerHTML = `
  <div class="section-title"><div><h1>${t("lessons")}</h1><p>${lessons.length} ${t("lessonsWord")} · ${quizzes.length} ${t("quizzesHeld").toLowerCase()} · ${D.parts.length} ${t("part")}</p></div></div>
  ${D.parts.filter(p => !only || p.num === only).map(p => `
  <section class="part-panel" id="part-${p.num}">
    <div class="part-head">
      <div><p class="eyebrow">${partName(p.num).toUpperCase()}</p><h2>${esc(p.title)}</h2></div>
      <div class="part-actions">
        <a class="btn btn-sm" href="${href(p.pptx)}" download>${I("download", 16)}PPTX</a>
        <a class="btn btn-sm" href="${href(p.pdf)}" target="_blank" rel="noopener">${I("file", 16)}PDF</a>
      </div>
    </div>
    <div class="unit-list">${D.units.filter(u => u.part === p.num).map(unitRow).join("")}</div>
  </section>`).join("")}
  ${only ? `<a class="btn btn-ghost" href="#/lessons">${I("list", 18)}${t("lessons")}: 1–30</a>` : ""}`;
}

function viewUnit(k){
  const u = unitByKey(k);
  if (!u) return notFound();
  const idx = D.units.indexOf(u), prev = D.units[idx - 1], next = D.units[idx + 1];
  const p = partOf(u), done = !!progress.taught[k], last = progress.lastSlide[k] || 0;
  const hw = u.type === "lesson" ? hwByNum(u.num) : null;
  const objTitle = u.type === "lesson" ? t("whatWeLearn") : "";
  $app.innerHTML = `
  <nav class="crumbs"><a href="#/lessons">${t("lessons")}</a><span>›</span><a href="#/lessons?part=${u.part}">${partName(u.part)}</a><span>›</span><span>${esc(unitName(u))}</span></nav>
  <section class="lesson-hero">
    <p class="eyebrow">${partName(u.part).toUpperCase()} · ${esc(unitName(u)).toUpperCase()} · ${u.slides.length} ${t("slides").toUpperCase()}</p>
    <h1>${esc(u.title)}</h1>
    ${u.objectives && u.objectives.length ? `${objTitle ? `<strong>${objTitle}:</strong>` : ""}<ul class="objectives">${u.objectives.slice(0, 8).map(o => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}
    <div class="hero-actions">
      <a class="btn btn-accent btn-lg" href="#/present/${k}/0">${I("play", 18)}${u.type === "quiz" ? t("present") : t("startLesson")}</a>
      ${last > 0 ? `<a class="btn btn-ghost" href="#/present/${k}/${last}">${t("continueFrom")} · ${last + 1}/${u.slides.length}</a>` : ""}
      ${settings.teacher && (u.type === "lesson" || u.type === "quiz") ? `<button class="btn btn-ghost" id="taughtBtn">${I("check", 18)}${done ? t("taught") + " ✓" : t("markTaught")}</button>` : ""}
    </div>
  </section>
  ${hw ? `<a class="pair-card" href="#/hw/${hw.num}">
      <span class="quick-ico">${I("pencil", 24)}</span>
      <span class="grow"><p class="eyebrow">${t("pairedHw")}</p><h3>${esc(hw.title)}</h3><p>${esc(hw.subtitle)}</p></span>
      <span class="chip${progress.hwDone[hw.num] ? " ok" : " accent"}">${progress.hwDone[hw.num] ? t("done") : t("openHomework")}</span>
    </a>` : (u.type === "quiz" ? `<p class="panel-sub">${t("noHw")}</p>` : "")}
  <section class="panel">
    <div class="panel-head toolbar"><h2>${t("slidesOfLesson")}</h2><span class="spacer"></span>
      <a class="btn btn-sm" href="${href(p.pptx)}" download>${I("download", 16)}PPTX</a>
      <a class="btn btn-sm" href="${href(p.pdf)}#page=${u.start}" target="_blank" rel="noopener">${I("file", 16)}PDF</a></div>
    <div class="slide-grid">${u.slides.map((s, i) => `
      <a class="slide-thumb" href="#/present/${k}/${i}" style="text-decoration:none">
        <span class="thumb-canvas" data-part="${u.part}" data-page="${s.n}"></span>
        <span class="thumb-label">${i + 1}. ${esc(s.label)}</span>
        <span class="thumb-title">${esc(s.title || s.label)}</span>
      </a>`).join("")}</div>
  </section>
  <div class="toolbar">
    ${prev ? `<a class="btn" href="#/u/${keyOf(prev)}">${I("left", 18)}${esc(unitName(prev))}</a>` : ""}
    <span class="spacer"></span>
    ${next ? `<a class="btn" href="#/u/${keyOf(next)}">${esc(unitName(next))}${I("right", 18)}</a>` : ""}
  </div>`;
  const tb = document.getElementById("taughtBtn");
  if (tb) tb.onclick = () => { toggleTaught(k); viewUnit(k); };
  lazyThumbs();
}

function toggleTaught(k, force){
  const on = force === undefined ? !progress.taught[k] : force;
  if (on) progress.taught[k] = Date.now(); else delete progress.taught[k];
  saveProgress();
}

function viewHomeworks(){
  $app.innerHTML = `
  <div class="section-title"><div><h1>${t("homeworks")}</h1><p>${D.homeworks.length} · ${t("hwNote")}</p></div></div>
  <input class="search-input" id="hwSearch" type="search" placeholder="${t("search")}" autocomplete="off">
  ${D.parts.map(p => {
    const ls = lessons.filter(u => u.part === p.num);
    return `<section class="part-panel" data-part="${p.num}">
      <div class="part-head"><div><p class="eyebrow">${partName(p.num).toUpperCase()}</p><h2>${t("homework")} ${ls[0].num}–${ls[ls.length - 1].num}</h2></div></div>
      <div class="unit-list">${ls.map(u => hwByNum(u.num)).filter(Boolean).map(h => `
        <a class="unit-row hw-list-row${progress.hwDone[h.num] ? " done" : ""}" href="#/hw/${h.num}" style="text-decoration:none" data-search="${esc((h.num + " " + h.title + " " + h.subtitle).toLowerCase())}">
          <span class="unit-badge"><small>UY</small><b>${progress.hwDone[h.num] ? I("check", 22) : h.num}</b></span>
          <span class="unit-main"><h3>${esc(h.title)}</h3><p class="unit-meta">${esc(h.subtitle)}</p></span>
          <span class="unit-side">${progress.hwDone[h.num] ? `<span class="chip ok">${t("done")}</span>` : ""}${progress.taught["lesson-" + h.num] ? `<span class="chip">${t("taught")}</span>` : ""}</span>
        </a>`).join("")}</div></section>`;
  }).join("")}`;
  const s = document.getElementById("hwSearch");
  s.oninput = () => {
    const q = s.value.trim().toLowerCase();
    $app.querySelectorAll(".hw-list-row").forEach(r => { r.hidden = q && !r.dataset.search.includes(q); });
    $app.querySelectorAll(".part-panel").forEach(p => { p.hidden = !p.querySelector(".hw-list-row:not([hidden])"); });
  };
}

function viewHomework(n){
  const h = hwByNum(n);
  if (!h) return notFound();
  const u = unitByKey("lesson-" + n), ans = D.answerKey.lessons[n];
  const prevH = hwByNum(n - 1), nextH = hwByNum(n + 1);
  $app.innerHTML = `
  <nav class="crumbs"><a href="#/homeworks">${t("homeworks")}</a><span>›</span><span>${esc(h.title)}</span></nav>
  <div class="toolbar">
    ${u ? `<a class="btn btn-sm" href="#/u/${keyOf(u)}">${I("board", 16)}${t("openLesson")} ${n}</a>` : ""}
    <button class="btn btn-sm${progress.hwDone[n] ? " btn-accent" : ""}" id="hwDoneBtn">${I("check", 16)}${progress.hwDone[n] ? (settings.teacher ? t("checked") : t("done")) + " ✓" : t("markDone")}</button>
    <span class="spacer"></span>
    <button class="btn btn-sm" id="hwPrint">${I("print", 16)}${t("print")}</button>
    <a class="btn btn-sm" href="${href(h.docx)}" download>${I("download", 16)}DOCX</a>
    <a class="btn btn-sm" href="${href(h.pdf)}" target="_blank" rel="noopener">${I("file", 16)}PDF</a>
    <button class="btn btn-sm btn-ghost" id="hwClear">${t("clear")}</button>
  </div>
  <article class="hw-sheet" id="hwSheet">${h.html}</article>
  ${ans ? (settings.teacher ? `<section class="panel answer-panel">
      <div class="panel-head"><p class="eyebrow">${t("answerKeyFor")}</p><h2>${esc(ans.title)}</h2><p class="panel-sub">${esc(D.answerKey.intro)}</p></div>
      <ol>${ans.items.map(i => `<li>${esc(i)}</li>`).join("")}</ol></section>`
    : `<section class="panel locked-note no-print">${I("key", 22)}<span>${t("teacherOnly")}</span></section>`) : ""}
  <div class="toolbar no-print">
    ${prevH ? `<a class="btn" href="#/hw/${prevH.num}">${I("left", 18)}${t("homework")} ${prevH.num}</a>` : ""}
    <span class="spacer"></span>
    ${nextH ? `<a class="btn" href="#/hw/${nextH.num}">${t("homework")} ${nextH.num}${I("right", 18)}</a>` : ""}
  </div>`;
  const sheet = document.getElementById("hwSheet");
  const inputs = [...sheet.querySelectorAll("input.blank")], checks = [...sheet.querySelectorAll(".hw-check input")];
  const saved = progress.hwInputs[n] || [], savedC = progress.hwChecks[n] || [];
  inputs.forEach((el, i) => {
    el.value = saved[i] || "";
    el.addEventListener("input", () => { (progress.hwInputs[n] = progress.hwInputs[n] || [])[i] = el.value; saveProgress(); });
  });
  checks.forEach((el, i) => {
    el.checked = !!savedC[i];
    el.addEventListener("change", () => { (progress.hwChecks[n] = progress.hwChecks[n] || [])[i] = el.checked; saveProgress(); });
  });
  document.getElementById("hwDoneBtn").onclick = () => {
    if (progress.hwDone[n]) delete progress.hwDone[n]; else progress.hwDone[n] = Date.now();
    saveProgress(); viewHomework(n);
  };
  document.getElementById("hwPrint").onclick = () => window.print();
  document.getElementById("hwClear").onclick = () => {
    delete progress.hwInputs[n]; delete progress.hwChecks[n]; saveProgress();
    inputs.forEach(el => el.value = ""); checks.forEach(el => el.checked = false); toast(t("cleared"));
  };
}

function viewAnswers(){
  const ak = D.answerKey;
  if (!settings.teacher){
    $app.innerHTML = `<div class="section-title"><div><h1>${t("answers")}</h1></div></div>
      <section class="panel locked-note">${I("key", 22)}<span style="flex:1">${t("teacherOnly")}</span><button class="btn btn-accent btn-sm" id="toTeacher">${t("switchTeacher")}</button></section>`;
    document.getElementById("toTeacher").onclick = () => { settings.teacher = true; saveSettings(); route_(); };
    return;
  }
  $app.innerHTML = `
  <div class="section-title"><div><h1>${esc(ak.title)}</h1><p>${esc(ak.intro)}</p></div>
    <div class="toolbar"><a class="btn btn-sm" href="${href(ak.docx)}" download>${I("download", 16)}DOCX</a><a class="btn btn-sm" href="${href(ak.pdf)}" target="_blank" rel="noopener">${I("file", 16)}PDF</a></div></div>
  <input class="search-input" id="akSearch" type="search" placeholder="${t("search")}" autocomplete="off">
  ${Object.keys(ak.lessons).map(Number).sort((a, b) => a - b).map(n => {
    const a = ak.lessons[n];
    return `<section class="panel answer-panel" data-search="${esc((n + " " + a.title + " " + a.items.join(" ")).toLowerCase())}">
      <div class="panel-head toolbar"><h2>${esc(a.title)}</h2><span class="spacer"></span><a class="btn btn-sm" href="#/hw/${n}">${I("pencil", 16)}${t("homework")} ${n}</a></div>
      <ol>${a.items.map(i => `<li>${esc(i)}</li>`).join("")}</ol></section>`;
  }).join("")}`;
  const s = document.getElementById("akSearch");
  s.oninput = () => { const q = s.value.trim().toLowerCase(); $app.querySelectorAll("[data-search]").forEach(r => { r.hidden = q && !r.dataset.search.includes(q); }); };
}

function fileRow(path){
  const name = path.split("/").pop(), ext = name.split(".").pop().toLowerCase();
  return `<div class="file-row"><span class="file-ico ${ext}">${ext.toUpperCase()}</span>
    <span class="file-name">${esc(name)}<small>${esc(path.replace(/^content\//, "Speakup-1/"))}</small></span>
    ${ext === "pdf" ? `<a class="btn btn-sm" href="${href(path)}" target="_blank" rel="noopener">${t("open")}</a>` : ""}
    <a class="btn btn-sm" href="${href(path)}" download>${I("download", 16)}</a></div>`;
}
function viewMaterials(){
  const ak = D.answerKey;
  $app.innerHTML = `
  <div class="section-title"><div><h1>${t("materials")}</h1><p>${t("allFiles")}</p></div></div>
  <section class="panel"><div class="panel-head"><h2>1 · ${t("lessonDecks")}</h2></div>
    <div class="file-list">${D.parts.map(p => fileRow(p.pptx) + fileRow(p.pdf)).join("")}</div></section>
  <section class="panel"><div class="panel-head"><h2>2 · ${t("hwFiles")}</h2></div>
    <div class="file-list">${D.homeworks.map(h => fileRow(h.docx) + fileRow(h.pdf)).join("")}</div></section>
  <section class="panel"><div class="panel-head"><h2>3 · ${t("akFiles")}</h2></div>
    <div class="file-list">${fileRow(ak.docx)}${fileRow(ak.pdf)}</div></section>`;
}

function notFound(){ $app.innerHTML = `<section class="panel"><h2>404</h2><p><a href="#/">${t("home")}</a></p></section>`; }

/* ---------------- PDF rendering ---------------- */
const pdfDocs = {};
function getPdf(part){
  if (!window.pdfjsLib) return Promise.reject(new Error("pdf.js missing"));
  if (!pdfDocs[part]) pdfDocs[part] = pdfjsLib.getDocument({ url:href(D.parts[part - 1].pdf), disableRange:true, disableStream:true, disableAutoFetch:true }).promise.catch(e => { delete pdfDocs[part]; throw e; });
  return pdfDocs[part];
}
async function renderPage(part, pageNum, canvas, cssW, cssH){
  const pdf = await getPdf(part);
  const page = await pdf.getPage(pageNum);
  const vp1 = page.getViewport({ scale:1 });
  const scale = Math.min(cssW / vp1.width, cssH ? cssH / vp1.height : Infinity);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const vp = page.getViewport({ scale:scale * dpr });
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  canvas.style.width = Math.floor(vp.width / dpr) + "px"; canvas.style.height = Math.floor(vp.height / dpr) + "px";
  const task = page.render({ canvasContext:canvas.getContext("2d"), viewport:vp });
  return task;
}

let thumbObserver;
function lazyThumbs(){
  if (thumbObserver) thumbObserver.disconnect();
  thumbObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const box = e.target; thumbObserver.unobserve(box);
      const c = document.createElement("canvas"); box.appendChild(c);
      renderPage(+box.dataset.part, +box.dataset.page, c, box.clientWidth || 200)
        .then(task => task.promise).then(() => { c.style.width = "100%"; c.style.height = "100%"; })
        .catch(() => { box.textContent = ""; });
    });
  }, { rootMargin:"200px" });
  document.querySelectorAll(".thumb-canvas").forEach(el => thumbObserver.observe(el));
}

/* ---------------- Presenter (teacher holds the lesson) ---------------- */
let P = null;
function openPresenter(k, startIdx){
  const u = unitByKey(k);
  if (!u) return notFound();
  if (P && P.key === k){ P.go(startIdx, true); return; }
  closePresenter(true);
  const idx = D.units.indexOf(u), next = D.units[idx + 1];
  document.body.style.overflow = "hidden";
  $presenterRoot.innerHTML = `
  <div class="presenter" id="presenter" tabindex="-1">
    <div class="pr-top">
      <div class="pr-title"><small>${esc(unitName(u)).toUpperCase()}</small>${esc(u.title)}</div>
      <div class="pr-group"><span class="pr-timer" id="prTimer">00:00</span>
        <button class="pr-btn" id="prOutline" title="${t("outline")} (O)">${I("list", 18)}<span class="lbl">${t("outline")}</span></button>
        <button class="pr-btn" id="prFull" title="${t("fullscreen")} (F)">${I("max", 18)}<span class="lbl">${t("fullscreen")}</span></button>
        <button class="pr-btn" id="prClose" title="${t("close")} (Esc)">${I("x", 18)}</button></div>
    </div>
    <div class="pr-stage" id="prStage"><span class="pr-loading" id="prLoading">${t("loading")}</span><canvas id="prCanvas"></canvas><div class="pr-progress"><span id="prBar"></span></div></div>
    <aside class="pr-side" id="prSide" hidden>${u.slides.map((s, i) => `<button data-i="${i}"><small>${i + 1} · ${esc(s.label)}</small>${esc(s.title || s.label)}</button>`).join("")}</aside>
    <div class="pr-bottom">
      <div class="pr-group">
        <button class="pr-btn" id="prPrev">${I("left", 18)}<span class="lbl">${t("prev")}</span></button>
        <span class="pr-count" id="prCount"></span>
        <button class="pr-btn primary" id="prNext"><span class="lbl">${t("next")}</span>${I("right", 18)}</button>
      </div>
      <div class="pr-group">
        <button class="pr-btn${settings.skipAnswers ? " on" : ""}" id="prSkip" title="${t("hideAnswers")}">${I("skip", 18)}<span class="lbl">${t("hideAnswers")}</span></button>
      </div>
    </div>
  </div>`;
  const el = id => document.getElementById(id);
  const canvas = el("prCanvas"), stage = el("prStage");
  const isAnswer = i => /JAVOBLAR/i.test(u.slides[i].label);
  const visible = i => !(settings.skipAnswers && isAnswer(i));
  let cur = -1, task = null, ended = false;
  const t0 = Date.now();
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    el("prTimer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 1000);

  function draw(){
    if (task){ try{ task.cancel(); }catch(e){} task = null; }
    const s = u.slides[cur];
    const w = stage.clientWidth - 24, h = stage.clientHeight - 24;
    renderPage(u.part, s.n, canvas, w, h).then(tk => { task = tk; return tk.promise; }).then(() => { task = null; const l = document.getElementById("prLoading"); if (l) l.remove(); })
      .catch(e => { if (e && e.name === "RenderingCancelledException") return; showError(); });
  }
  function showError(){
    stage.querySelector(".pr-end")?.remove();
    stage.insertAdjacentHTML("beforeend", `<div class="pr-end"><h2>⚠</h2><p>${t("pdfError")}</p></div>`);
  }
  function update(){
    el("prCount").textContent = (cur + 1) + " / " + u.slides.length;
    el("prBar").style.width = ((cur + 1) / u.slides.length * 100) + "%";
    el("prPrev").disabled = cur === 0 && !ended;
    el("prSide").querySelectorAll("button").forEach(b => {
      const on = +b.dataset.i === cur; b.classList.toggle("cur", on);
      if (on && !el("prSide").hidden) b.scrollIntoView({ block:"nearest" });
    });
  }
  function showEnd(){
    ended = true;
    toggleTaught(k, true);
    const hw = u.type === "lesson" ? hwByNum(u.num) : null;
    stage.insertAdjacentHTML("beforeend", `<div class="pr-end">
      <p class="eyebrow" style="color:var(--brand-200)">${esc(unitName(u)).toUpperCase()}</p>
      <h2>${u.type === "quiz" ? t("endTitleQuiz") : t("endTitle")}</h2>
      <p>${esc(u.title)} · ${el("prTimer").textContent}${hw ? " · " + t("endSub") : ""}</p>
      <div class="pr-group" style="justify-content:center">
        ${hw ? `<button class="pr-btn primary" data-go="#/hw/${hw.num}">${I("pencil", 18)}${t("openHomework")} ${hw.num}</button>` : ""}
        <button class="pr-btn" data-go="#/u/${k}">${t("backToLesson")}</button>
        ${next ? `<button class="pr-btn" data-go="#/u/${keyOf(next)}">${t("nextUnit")}: ${esc(unitName(next))}</button>` : ""}
      </div></div>`);
    stage.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { closePresenter(true); location.hash = b.dataset.go; });
    update();
  }
  function go(i, absolute){
    if (ended){ ended = false; stage.querySelector(".pr-end")?.remove(); if (!absolute){ i = cur; } }
    i = Math.max(0, Math.min(u.slides.length - 1, i));
    if (i === cur && canvas.width) { update(); return; }
    cur = i; progress.lastSlide[k] = cur; saveProgress();
    history.replaceState(null, "", "#/present/" + k + "/" + cur);
    draw(); update();
  }
  function step(d){
    if (ended){ if (d < 0) go(cur, true); return; }
    let i = cur + d;
    while (i >= 0 && i < u.slides.length && !visible(i)) i += d;
    if (i >= u.slides.length) return showEnd();
    if (i < 0) return;
    go(i, true);
  }
  function fullscreen(){
    const pr = el("presenter");
    if (document.fullscreenElement) document.exitFullscreen?.(); else pr.requestFullscreen?.().catch(() => {});
  }
  function onKey(e){
    if (e.target.closest && e.target.closest("input,textarea")) return;
    if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)){ e.preventDefault(); step(1); }
    else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)){ e.preventDefault(); step(-1); }
    else if (e.key === "Home"){ go(0, true); }
    else if (e.key === "End"){ go(u.slides.length - 1, true); }
    else if (e.key === "f" || e.key === "F"){ fullscreen(); }
    else if (e.key === "o" || e.key === "O"){ el("prOutline").click(); }
    else if (e.key === "Escape" && !document.fullscreenElement){ closePresenter(); }
  }
  let tx = null;
  stage.addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, { passive:true });
  stage.addEventListener("touchend", e => {
    if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  });
  canvas.addEventListener("click", e => { const r = canvas.getBoundingClientRect(); step(e.clientX - r.left < r.width * 0.3 ? -1 : 1); });
  el("prPrev").onclick = () => step(-1);
  el("prNext").onclick = () => step(1);
  el("prClose").onclick = () => closePresenter();
  el("prFull").onclick = fullscreen;
  el("prOutline").onclick = () => { el("prSide").hidden = !el("prSide").hidden; el("prOutline").classList.toggle("on", !el("prSide").hidden); update(); requestAnimationFrame(draw); };
  el("prSkip").onclick = () => { settings.skipAnswers = !settings.skipAnswers; saveSettings(); el("prSkip").classList.toggle("on", settings.skipAnswers); };
  el("prSide").addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (b) go(+b.dataset.i, true); });
  let rz; const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (!ended) draw(); }, 120); };
  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", onKey);
  P = { key:k, go, cleanup(){ clearInterval(timer); window.removeEventListener("resize", onResize); document.removeEventListener("keydown", onKey); if (task) try{ task.cancel(); }catch(e){} } };
  el("presenter").focus();
  go(startIdx || 0, true);
}
function closePresenter(silent){
  if (!P) return;
  const k = P.key; P.cleanup(); P = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  $presenterRoot.innerHTML = ""; document.body.style.overflow = "";
  if (!silent) location.hash = "#/u/" + k;
}

/* ---------------- router ---------------- */
function route_(){
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query] = raw.split("?");
  const parts = path.split("/");
  if (parts[0] === "present"){
    renderChrome("u/");
    if (!$app.innerHTML || !P) viewUnit(parts[1]);
    openPresenter(parts[1], +(parts[2] || 0));
    return;
  }
  closePresenter(true);
  renderChrome(path);
  if (!path) viewHome();
  else if (parts[0] === "lessons") viewLessons(query || "");
  else if (parts[0] === "u") viewUnit(parts[1]);
  else if (parts[0] === "homeworks") viewHomeworks();
  else if (parts[0] === "hw") viewHomework(+parts[1]);
  else if (parts[0] === "answers") viewAnswers();
  else if (parts[0] === "materials") viewMaterials();
  else notFound();
  window.scrollTo(0, 0);
}
document.documentElement.lang = settings.lang;
window.addEventListener("hashchange", route_);
route_();
})();
