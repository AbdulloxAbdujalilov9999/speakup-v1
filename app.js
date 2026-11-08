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
const settings = Object.assign({ lang:"uz", skipAnswers:false }, load("sp1_settings", {}));
const blankProgress = () => ({ taught:{}, hwDone:{}, hwInputs:{}, hwChecks:{}, hwAt:{}, lastSlide:{}, boards:{} });
let progress = blankProgress();
let progressKey = "sp1_progress";
const saveSettings = () => save("sp1_settings", settings);
const saveProgress = () => save(progressKey, progress);
const Cloud = () => window.SP1Cloud;
const isStaff = () => !!(Cloud() && Cloud().isStaff);

/* ---------------- lesson access ----------------
 * A student only sees the lessons (and their homework) that a teacher has
 * opened for them: sp1/access/{uid}. Staff see everything and open lessons
 * from the lesson page ("Grant access to students") or by starting it. */
let access = {};          // this student's opened lessons {unitKey: {at, by}} (their own + the ones open for everyone)
let myAccess = {}, openAll = {};   // sp1/access/{uid} and sp1/open (lessons opened for every student, new ones too)
let people = null;        // staff: { users, progress, access } (live)
const hasAccess = k => isStaff() || !!access[k];
const hwOpen = n => hasAccess("lesson-" + n) || Object.values(assignments || {}).some(a => String(a.hw) === String(n));
const openedKeys = () => Object.keys(access).sort((a, b) => ((access[a] && access[a].at) || 0) - ((access[b] && access[b].at) || 0));
/* SpeakUp-1 students this staff account may see (owner/manager: everyone who has signed in here; teacher: their own) */
function members(){
  if (!people) return [];
  const me = Cloud().uid, mgr = Cloud().isManager;
  return Object.keys(people.users).filter(uid => {
    const u = people.users[uid];
    if (!u || uid === me || u.role !== "student" || u.status === "restricted") return false;
    return mgr ? !!(people.progress[uid] && people.progress[uid].joined) || u.teacherId === me : true;
  }).map(uid => Object.assign({ uid }, people.users[uid], { sp1: people.progress[uid] || Cloud().normProgress(null), access: people.access[uid] || {} }))
    .sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));
}
/* "my class": the students a lesson opens for when this teacher starts it */
function myClass(){
  const me = Cloud().uid, mgr = Cloud().isManager;
  return members().filter(s => s.teacherId === me || (mgr && !s.teacherId));
}
const hasFor = (s, k) => !!(s.access[k] || openAll[k]);
const openFor = k => members().filter(s => hasFor(s, k));

/* homework → cloud (debounced per homework) */
const hwTimers = {};
function syncHomework(n){
  progress.hwAt[n] = Date.now(); saveProgress();
  clearTimeout(hwTimers[n]);
  hwTimers[n] = setTimeout(() => {
    if (!Cloud()) return;
    Cloud().saveHomework(n, { inputs:progress.hwInputs[n] || [], checks:progress.hwChecks[n] || [], done:progress.hwDone[n] || null, at:progress.hwAt[n] });
  }, 700);
}
/* slide boards → cloud (debounced per lesson) */
const boardTimers = {};
function syncBoard(k){
  saveProgress();
  clearTimeout(boardTimers[k]);
  boardTimers[k] = setTimeout(() => { if (Cloud()) Cloud().saveBoard(k, progress.boards[k] || null); }, 900);
}

let accessOff = null, peopleOff = null, openOff = null, assignOff = null, resetOff = null;
let assignments = {};     // homework the teacher assigned to this student {id: {hw, note, dueDate, byName, at}}
/* a student's opened lessons changed while the site is open: redraw lists, and leave a page that was closed */
function onAccessChange(){
  const raw = location.hash.replace(/^#\/?/, ""), [path] = raw.split("?"), parts = path.split("/");
  const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if ((parts[0] === "u" || parts[0] === "present") && !hasAccess(parts[1])) return route_();
  if (parts[0] === "hw" && !hwOpen(+parts[1])) return route_();
  if (!typing && (!path || parts[0] === "lessons" || parts[0] === "homeworks" || parts[0] === "hw")) route_();
  else renderChrome(path);
}
/* staff: the student list changed (sign-ups, homework typed, access granted) */
function onPeople(){
  const raw = location.hash.replace(/^#\/?/, ""), [path] = raw.split("?"), parts = path.split("/");
  updateBadge();
  if (parts[0] === "settings" && window.SP1Settings) window.SP1Settings.refresh();
  else if (parts[0] === "u" && !P) refreshAccessBar(parts[1]);
  else if (parts[0] === "lessons") document.querySelectorAll("[data-open-chip]").forEach(el => { const k = el.dataset.openChip, n = openFor(k).length; el.textContent = openAll[k] ? t("openToAll") : n ? `${t("openFor")} ${n}` : ""; el.hidden = !n && !openAll[k]; });
}
function updateBadge(){
  const b = document.getElementById("setBadge"); if (!b || !people) return;
  const n = Cloud().isManager ? Object.values(people.users).filter(u => u && u.status === "pending").length : 0;
  b.textContent = n; b.hidden = !n;
}
async function initUser(){
  const C = Cloud();
  progressKey = "sp1_progress_" + C.uid;
  progress = Object.assign(blankProgress(), load(progressKey, {}));
  if (accessOff){ accessOff(); accessOff = null; }
  if (openOff){ openOff(); openOff = null; }
  if (assignOff){ assignOff(); assignOff = null; }
  if (resetOff){ resetOff(); resetOff = null; }
  if (peopleOff){ peopleOff(); peopleOff = null; }
  const merge = () => { const before = JSON.stringify(access); access = Object.assign({}, openAll, myAccess); return before !== JSON.stringify(access); };
  let openFirst = true;
  await new Promise(res => {
    openOff = C.watchOpenAll(v => {
      openAll = Object.assign({}, v || {});
      if (openFirst){ openFirst = false; return res(); }
      if (isStaff()) onPeople(); else if (merge()) onAccessChange();
    });
  });
  if (isStaff()){
    people = { users:{}, progress:{}, access:{} };
    peopleOff = C.watchPeople(st => { people = st; onPeople(); });
  } else {
    await new Promise(res => {
      let first = true;
      accessOff = C.watchMyAccess(v => {
        myAccess = Object.assign({}, v || {});
        const changed = merge();
        if (first){ first = false; return res(); }
        if (changed) onAccessChange();
      });
    });
    assignOff = C.watchAssignments(C.uid, v => {
      const changed = JSON.stringify(v) !== JSON.stringify(assignments);
      assignments = v || {};
      if (changed) onAccessChange();
    });
    // a teacher reset one of my homeworks: clear it here and in the cloud, then drop the request
    resetOff = C.watchResets(C.uid, v => {
      Object.keys(v || {}).forEach(id => {
        const n = v[id] && v[id].hw;
        if (n){ delete progress.hwInputs[n]; delete progress.hwChecks[n]; delete progress.hwDone[n]; progress.hwAt[n] = Date.now(); saveProgress();
          C.saveHomework(n, { inputs:[], checks:[], done:null, at:progress.hwAt[n] }); }
        C.doneReset(id).catch(() => {});
      });
      if (Object.keys(v || {}).length){
        const m = location.hash.match(/^#\/hw\/(\d+)/);
        if (m && v && Object.values(v).some(r => String(r.hw) === m[1])) route_();
      }
    });
  }
  try{
    const remote = await C.loadMyProgress();
    // newest copy of each homework wins (this device vs the cloud)
    const nums = new Set(Object.keys(remote.hwAt).concat(Object.keys(progress.hwAt)));
    nums.forEach(n => {
      const r = remote.hwAt[n] || 0, l = progress.hwAt[n] || 0;
      if (r > l){
        progress.hwInputs[n] = remote.hwInputs[n] || []; progress.hwChecks[n] = remote.hwChecks[n] || [];
        if (remote.hwDone[n]) progress.hwDone[n] = remote.hwDone[n]; else delete progress.hwDone[n];
        progress.hwAt[n] = r;
      } else if (l > r) syncHomework(n);
    });
    if (isStaff()){
      const boards = await C.loadBoards();
      Object.keys(boards).forEach(k => { if (!progress.boards[k] || (boards[k].at || 0) > (progress.boards[k].at || 0)) progress.boards[k] = boards[k]; });
    }
    saveProgress();
  }catch(e){ console.warn("cloud load", e); }
}

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
  hwNote:["Boʻsh joylarga javob yozing — ular saqlanadi va oʻqituvchingiz koʻradi.","Type answers into the blanks — they are saved and your teacher sees them."],
  allFiles:["Speakup-1 papkasidagi barcha fayllar","Every file from the Speakup-1 folder"],
  lessonDecks:["Dars taqdimotlari","Lesson decks"], hwFiles:["Uy vazifalari","Homeworks"], akFiles:["Javoblar kaliti","Answer key"],
  open:["Ochish","Open"], download:["Yuklab olish","Download"], loading:["Yuklanmoqda…","Loading…"],
  pdfError:["Slaydni yuklab boʻlmadi. Saytni oddiy server orqali oching (README ga qarang).","Could not load the slides. Open the site through a local server (see README)."],
  lessonsWord:["darslar","lessons"], coursePlan:["Kurs rejasi","Course plan"], cleared:["Tozalandi","Cleared"],
  saved:["Saqlandi","Saved"], theme:["Mavzu","Theme"],
  students:["Oʻquvchilar","Students"], signOut:["Chiqish","Sign out"], answersOf:["Kimning javoblari:","Answers of:"],
  mine:["Meniki (oʻqituvchi)","Mine (teacher)"], noStudents:["Hali oʻquvchilar yoʻq. Oʻquvchilar saytda roʻyxatdan oʻtgach, shu yerda paydo boʻladi.","No students yet. They appear here once they sign up on the site."],
  viewingStudent:["Oʻquvchi javoblari koʻrsatilmoqda (faqat koʻrish). Yangi javob yozsa, shu yerda darhol yangilanadi.","Showing this student's answers (read-only). It updates live as they type."],
  notStarted:["Boshlanmagan","Not started"], inProgress:["Bajarilmoqda","In progress"], filled:["toʻldirilgan","filled"],
  lastActive:["Oxirgi faollik","Last active"], hwOverview:["Uy vazifalari holati","Homework status"], pending:["Kutilmoqda","Pending"],
  textTool:["Matn qoʻshish","Add text"], clearSlide:["Slaydni tozalash","Clear slide"],
  editHint:["Boʻsh joylarga bosing va javob yozing. «Matn qoʻshish» bilan slaydning istalgan joyiga yozing.","Click a blank to type the answer. Use “Add text” to write anywhere on the slide."],
  clickToPlace:["Slaydda matn qoʻyiladigan joyni bosing","Click on the slide where the text should go"],
  studentAccount:["Oʻquvchi","Student"], refresh:["Yangilash","Refresh"],
  settings:["Sozlamalar","Settings"], aiTeacher:["AI oʻqituvchi","AI teacher"],
  grantAccess:["Oʻquvchilarga ruxsat berish","Grant access to students"], openFor:["Ochiq:","Open for"],
  openForN:["oʻquvchiga ochiq","students have access"], notOpenYet:["Hali hech kimga ochilmagan","Not open to any student yet"],
  viewSlides:["Slaydlarni koʻrish","View slides"], locked:["Bu dars hali ochilmagan","This lesson isn't open yet"],
  lockedSub:["Darsni oʻqituvchingiz boshlaganda u shu yerda ochiladi.","It opens here when your teacher starts it."],
  noOpenLessons:["Oʻqituvchingiz hali birorta darsni ochmagan.","Your teacher hasn't opened any lessons yet."],
  noOpenLessonsSub:["Dars boshlanganda u va uning uy vazifasi shu yerda paydo boʻladi.","When a lesson starts, it and its homework appear here."],
  myLessons:["Mening darslarim","My lessons"], latestLesson:["OXIRGI OCHILGAN DARS","LATEST LESSON"],
  openedLessons:["Ochilgan darslar","Open lessons"], grantTitle:["Kimlarga ochilsin?","Who gets access?"],
  grantSub:["Belgilangan oʻquvchilar shu darsni va uning uy vazifasini koʻradi.","Ticked students see this lesson and its homework."],
  selectAll:["Hammasi","All"], selectNone:["Hech kim","None"], myClassLbl:["Mening sinfim","My class"],
  save:["Saqlash","Save"], cancel:["Bekor qilish","Cancel"], noMembers:["Hali oʻquvchilar yoʻq. Ular saytga kirgach shu yerda paydo boʻladi.","No students yet. They appear here after they sign in."],
  autoOpened:["Dars oʻquvchilarga ochildi:","Lesson opened for students:"], closeAll:["Hammaga yopish","Close for all"],
  accessSaved:["Ruxsatlar saqlandi","Access saved"], everyone:["Hamma oʻquvchilar","Every student"],
  everyoneSub:["Keyin qoʻshiladigan yangi oʻquvchilar ham koʻradi","Students who join later get it too"], openToAll:["Hammaga ochiq","Open to everyone"],
  lockedChip:["Yopiq","Locked"], assigned:["Oʻqituvchi bergan uy vazifalari","Homework from your teacher"],
  due:["muddati","due"], fromTeacher:["Oʻqituvchidan","From your teacher"], noClass:["Bu darsni kimga ochishni «Oʻquvchilarga ruxsat berish» orqali tanlang.","Choose who gets this lesson with “Grant access to students”."]
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
    skip:'<path d="M5 5l8 7-8 7zM15 5v14"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    chat:'<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>', lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    unlock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017.5-2"/>'
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
const aiReady = () => !!(window.TTHelper && window.TTHelper.available());
function renderChrome(route){
  const nav = [["#/", "home", "home"], ["#/lessons", "lessons", "board"], ["#/homeworks", "homeworks", "pencil"]];
  if (isStaff()) nav.push(["#/materials", "materials", "folder"]);
  if (aiReady()) nav.push(["#ai", "aiTeacher", "chat"]);
  if (isStaff()) nav.push(["#/settings", "settings", "gear"]);
  $nav.innerHTML = nav.map(([h, k, ic]) => {
    const active = h !== "#ai" && ((h === "#/" ? route === "" : route.startsWith(h.slice(2))) ||
      (k === "lessons" && route.startsWith("u/")) || (k === "homeworks" && route.startsWith("hw/")) || (k === "settings" && route.startsWith("student/")));
    return `<a class="navbtn${active ? " active" : ""}" href="${h}" ${h === "#ai" ? 'data-ai="1"' : ""} style="text-decoration:none;position:relative"><span class="nav-icon">${I(ic)}</span><span>${t(k)}</span>${k === "settings" ? `<span class="nav-badge" id="setBadge" hidden></span>` : ""}</a>`;
  }).join("");
  const ai = $nav.querySelector("[data-ai]");
  if (ai) ai.onclick = e => { e.preventDefault(); window.TTHelper.openTalk(); };
  updateBadge();
  const me = Cloud() && Cloud().profile;
  $actions.innerHTML = `
    ${me ? `<button class="mode-toggle" id="signOutBtn" title="${t("signOut")}">${I("user", 16)}<span class="who">${esc((me.name || me.email || "").split(" ")[0])}</span><span>· ${t("signOut")}</span></button>` : ""}
    <div class="lang-switch"><button data-lang="uz" class="${settings.lang === "uz" ? "active" : ""}">UZ</button><button data-lang="en" class="${settings.lang === "en" ? "active" : ""}">EN</button></div>
    <button class="mode-toggle" id="themeBtn" title="${t("theme")}" aria-label="${t("theme")}">${I("moon", 16)}</button>`;
  const so = document.getElementById("signOutBtn");
  if (so) so.onclick = () => Cloud().signOut();
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

function lockedView(){
  $app.innerHTML = `<section class="panel locked-note" style="flex-direction:column;align-items:flex-start;gap:8px">
    <h2 style="display:flex;gap:10px;align-items:center">${I("lock", 22)}${t("locked")}</h2><p class="panel-sub">${t("lockedSub")}</p>
    <a class="btn btn-accent btn-sm" href="#/lessons">${t("myLessons")}</a></section>`;
}
function emptyLessons(){
  return `<section class="panel empty-open"><span class="quick-ico">${I("lock", 24)}</span><div><h2>${t("noOpenLessons")}</h2><p class="panel-sub">${t("noOpenLessonsSub")}</p></div></section>`;
}
function assignedList(){
  return Object.keys(assignments).map(id => Object.assign({ id }, assignments[id])).filter(a => hwByNum(a.hw))
    .sort((a, b) => (progress.hwDone[a.hw] ? 1 : 0) - (progress.hwDone[b.hw] ? 1 : 0) || (a.dueDate || "9").localeCompare(b.dueDate || "9") || (b.at || 0) - (a.at || 0));
}
function assignedPanel(){
  const list = assignedList();
  if (!list.length) return "";
  return `<section class="panel assigned-panel"><div class="panel-head"><h2>${t("assigned")}</h2></div><div class="unit-list">${list.map(a => {
    const h = hwByNum(a.hw), done = !!progress.hwDone[a.hw];
    return `<a class="unit-row${done ? " done" : ""}" href="#/hw/${a.hw}" style="text-decoration:none">
      <span class="unit-badge"><small>UY</small><b>${done ? I("check", 22) : a.hw}</b></span>
      <span class="unit-main"><h3>${esc(h.title)}</h3><p class="unit-meta">${a.dueDate ? `${t("due")}: ${esc(a.dueDate)}` : esc(h.subtitle)}${a.note ? ` · “${esc(a.note)}”` : ""}${a.byName ? ` · ${esc(a.byName)}` : ""}</p></span>
      <span class="unit-side"><span class="chip${done ? " ok" : " accent"}">${done ? t("done") : t("openHomework")}</span></span></a>`;
  }).join("")}</div></section>`;
}
/* a student's home: the lessons their teacher has opened, newest first */
function viewHomeStudent(){
  const keys = openedKeys().filter(k => unitByKey(k));
  const latest = keys.length ? unitByKey(keys[keys.length - 1]) : null;
  const hwList = keys.map(unitByKey).filter(u => u.type === "lesson" && hwByNum(u.num)).map(u => hwByNum(u.num));
  const hwN = hwList.filter(h => progress.hwDone[h.num]).length;
  const nb = latest ? badgeTxt(latest) : null;
  const me = Cloud().profile || {};
  $app.innerHTML = `
  <section class="hero-strip">
    <div class="hero-top">
      <div class="hero-left">
        <p class="eyebrow">SPEAKUP-1 · ${esc((me.name || "").toUpperCase())}</p>
        <h1 class="hwy-title">${t("courseTitle")}</h1>
        <p class="hero-sub">${t("noOpenLessonsSub")}</p>
      </div>
      ${ring(hwList.length ? hwN / hwList.length : 0)}
    </div>
    ${latest ? `<div class="upnext">
      <div class="upnext-badge"><small>${nb[0]}</small><b>${nb[1]}</b></div>
      <div class="upnext-text"><p class="upnext-label">${t("latestLesson")}</p><h2>${esc(latest.title)}</h2>
        <p class="upnext-meta">${esc(unitName(latest))} · ${latest.slides.length} ${t("slides")}</p></div>
      ${latest.type === "lesson" && hwByNum(latest.num) ? `<a class="btn btn-accent" href="#/hw/${latest.num}">${I("pencil", 18)}${t("openHomework")}</a>` : `<a class="btn btn-accent" href="#/u/${keyOf(latest)}">${t("openLesson")}</a>`}
    </div>` : ""}
    <div class="hero-stats">
      <div class="stat-tile"><span class="stat-ico">${I("board", 18)}</span><span class="stat-num">${keys.length}</span><span class="stat-label">${t("openedLessons")}</span></div>
      <div class="stat-tile"><span class="stat-ico">${I("pencil", 18)}</span><span class="stat-num">${hwN}<span class="stat-den">/${hwList.length}</span></span><span class="stat-label">${t("hwDone")}</span></div>
    </div>
  </section>
  ${assignedPanel()}
  ${keys.length ? "" : emptyLessons()}
  ${D.parts.map(p => `<section class="part-panel"><div class="part-head"><div><p class="eyebrow">${partName(p.num).toUpperCase()}</p><h2>${esc(p.title)}</h2></div></div>
    <div class="unit-list">${D.units.filter(u => u.part === p.num && (u.type === "lesson" || u.type === "quiz")).map(unitRow).join("")}</div></section>`).join("")}`;
}

function viewHome(){
  if (!isStaff()) return viewHomeStudent();
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
      ${isStaff() ? `<a class="btn btn-accent" href="#/present/${keyOf(next)}">${I("play", 18)}${t("startLesson")}</a>` : `<a class="btn btn-accent" href="#/u/${keyOf(next)}">${t("openLesson")}</a>`}
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
  if (!hasAccess(k)) return `<div class="unit-row locked ${cls}" title="${t("lockedSub")}">
    <span class="unit-badge"><small>${b[0]}</small><b>${I("lock", 20)}</b></span>
    <span class="unit-main"><h3>${esc(u.title)}</h3><p class="unit-meta">${esc(unitName(u))}${u.objectives && u.objectives.length ? " · " + esc(u.objectives.slice(0, 3).join(" · ")) : ""}</p></span>
    <span class="unit-side"><span class="chip">${I("lock", 12)} ${t("lockedChip")}</span></span></div>`;
  return `<a class="unit-row ${cls}${done ? " done" : ""}" href="#/u/${k}" style="text-decoration:none">
    <span class="unit-badge"><small>${b[0]}</small><b>${done ? I("check", 22) : b[1]}</b></span>
    <span class="unit-main"><h3>${esc(u.title)}</h3><p class="unit-meta">${esc(unitName(u))} · ${u.slides.length} ${t("slides")}${u.objectives && u.objectives.length ? " · " + esc(u.objectives.slice(0, 3).join(" · ")) : ""}</p></span>
    <span class="unit-side">${isStaff() && (u.type === "lesson" || u.type === "quiz") ? `<span class="chip accent" data-open-chip="${k}" ${openFor(k).length || openAll[k] ? "" : "hidden"}>${openAll[k] ? t("openToAll") : `${t("openFor")} ${openFor(k).length}`}</span>` : ""}${done && isStaff() ? `<span class="chip ok">${t("taught")}</span>` : ""}${u.type === "quiz" ? `<span class="chip quiz">${t("quizzesHeld")}</span>` : ""}${hw ? `<span class="chip${progress.hwDone[u.num] ? " ok" : ""}">${t("homework")} ${u.num}${progress.hwDone[u.num] && !isStaff() ? " ✓" : ""}</span>` : ""}</span>
  </a>`;
}

function viewLessons(query){
  const only = +(new URLSearchParams(query).get("part") || 0);
  if (!isStaff()){
    const all = D.units.filter(u => u.type === "lesson" || u.type === "quiz"), open = all.filter(u => hasAccess(keyOf(u)));
    $app.innerHTML = `<div class="section-title"><div><h1>${t("lessons")}</h1><p>${open.length}/${all.length} ${t("openedLessons").toLowerCase()}</p></div></div>
      ${open.length ? "" : emptyLessons()}
      ${D.parts.map(p => `
      <section class="part-panel"><div class="part-head"><div><p class="eyebrow">${partName(p.num).toUpperCase()}</p><h2>${esc(p.title)}</h2></div></div>
        <div class="unit-list">${all.filter(u => u.part === p.num).map(unitRow).join("")}</div></section>`).join("")}`;
    return;
  }
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

function accessBarHtml(k){
  const u = unitByKey(k);
  if (!isStaff() || !u || (u.type !== "lesson" && u.type !== "quiz")) return "";
  const all = members(), on = openFor(k), every = !!openAll[k];
  return `<section class="panel access-bar" id="accessBar">
    <span class="quick-ico">${I(on.length || every ? "unlock" : "lock", 22)}</span>
    <div class="grow"><b>${every ? `${t("openToAll")} · ${t("everyoneSub").toLowerCase()}` : on.length ? `${on.length}/${all.length} ${t("openForN")}` : t("notOpenYet")}</b>
      <p class="panel-sub">${on.length ? esc(on.slice(0, 6).map(s => (s.name || s.email || "").split(" ")[0]).join(", ")) + (on.length > 6 ? " …" : "") : t("grantSub")}</p></div>
    <button class="btn btn-accent btn-sm" id="grantBtn">${I("unlock", 16)}${t("grantAccess")}</button>
  </section>`;
}
function refreshAccessBar(k){
  const el = document.getElementById("accessBar");
  if (!el) return;
  el.outerHTML = accessBarHtml(k);
  const b = document.getElementById("grantBtn"); if (b) b.onclick = () => openGrantModal(k);
}
/* "Grant access to students": tick who sees this lesson (and its homework) */
function openGrantModal(keysIn){
  const keys = [].concat(keysIn).filter(k => unitByKey(k)), all = members();
  if (!keys.length) return;
  const first = unitByKey(keys[0]), last = unitByKey(keys[keys.length - 1]);
  const hasAll = s => keys.every(k => s.access[k]);
  const cls = new Set(myClass().map(s => s.uid)), anyOpen = all.some(s => keys.some(k => s.access[k])), every = keys.every(k => openAll[k]);
  const label = keys.length === 1 ? `${esc(unitName(first))} · ${esc(first.title)}` : `${keys.length} ${t("lessonsWord")}: ${esc(unitName(first))} – ${esc(unitName(last))}`;
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal-card">
    <h2>${t("grantTitle")}</h2><p class="panel-sub">${label}. ${t("grantSub")}</p>
    <label class="grant-row grant-all"><input type="checkbox" id="gAll" ${every ? "checked" : ""}><span class="grow"><b>${t("everyone")}</b><small>${t("everyoneSub")}</small></span></label>
    ${all.length ? `<div class="grant-tools"><button class="btn btn-ghost btn-sm" data-sel="all">${t("selectAll")}</button>
      <button class="btn btn-ghost btn-sm" data-sel="class">${t("myClassLbl")}</button><button class="btn btn-ghost btn-sm" data-sel="none">${t("selectNone")}</button></div>
    <div class="grant-list">${all.map(s => `<label class="grant-row"><input type="checkbox" value="${s.uid}" ${(anyOpen ? hasAll(s) : cls.has(s.uid)) ? "checked" : ""}>
      <span class="grow"><b>${esc(s.name || s.email)}</b><small>${esc(s.email || "")}</small></span>${hasAll(s) ? `<span class="chip ok">${I("unlock", 12)}</span>` : ""}</label>`).join("")}</div>`
    : `<p class="panel-sub" style="margin-top:10px">${t("noMembers")}</p>`}
    <div class="modal-actions"><button class="btn btn-ghost" id="gCancel">${t("cancel")}</button><button class="btn btn-accent" id="gSave">${t("save")}</button></div>
  </div></div>`;
  const boxes = [...root.querySelectorAll(".grant-list input")], gAll = root.querySelector("#gAll");
  const syncAll = () => boxes.forEach(x => { x.disabled = gAll.checked; if (gAll.checked) x.checked = true; });
  gAll.onchange = syncAll; syncAll();
  root.querySelectorAll("[data-sel]").forEach(b => b.onclick = () => {
    gAll.checked = b.dataset.sel === "all"; syncAll();
    if (b.dataset.sel !== "all") boxes.forEach(x => { x.checked = b.dataset.sel === "class" && cls.has(x.value); });
  });
  root.querySelector("#gCancel").onclick = () => { root.innerHTML = ""; };
  root.querySelector(".modal-backdrop").addEventListener("click", e => { if (e.target.classList.contains("modal-backdrop")) root.innerHTML = ""; });
  const sv = root.querySelector("#gSave");
  sv.onclick = async () => {
    sv.disabled = true;
    try{
      if (gAll.checked) await Cloud().setOpenAll(keys, true);
      else {
        const want = new Set(boxes.filter(x => x.checked).map(x => x.value)), changes = [];
        all.forEach(s => keys.forEach(k => {
          if (want.has(s.uid) && !s.access[k]) changes.push([s.uid, k, true]);
          if (!want.has(s.uid) && s.access[k]) changes.push([s.uid, k, false]);
        }));
        await Cloud().setAccessMany(changes);
        const wasAll = keys.filter(k => openAll[k]);
        if (wasAll.length) await Cloud().setOpenAll(wasAll, false);
      }
      root.innerHTML = ""; toast(t("accessSaved"));
    }
    catch(e){ sv.disabled = false; alert(e.message); }
  };
}
/* starting a lesson opens it (and its homework) for this teacher's class */
function autoGrant(k){
  const u = unitByKey(k);
  if (!isStaff() || !u || (u.type !== "lesson" && u.type !== "quiz")) return;
  if (openAll[k]) return;
  const todo = myClass().filter(s => !s.access[k]).map(s => s.uid);
  if (!todo.length){ if (!openFor(k).length) setTimeout(() => toast(t("noClass")), 600); return; }
  Cloud().setAccess(todo, k, true).then(() => toast(`${t("autoOpened")} ${todo.length}`)).catch(e => console.warn("grant", e));
}

function viewUnit(k){
  const u = unitByKey(k);
  if (!u) return notFound();
  if (!hasAccess(k)) return lockedView();
  const idx = D.units.indexOf(u), prev = D.units[idx - 1], next = D.units[idx + 1];
  const p = partOf(u), done = !!progress.taught[k], last = progress.lastSlide[k] || 0;
  const hw = u.type === "lesson" ? hwByNum(u.num) : null;
  const objTitle = u.type === "lesson" ? t("whatWeLearn") : "";
  $app.innerHTML = `
  <nav class="crumbs"><a href="#/lessons">${t("lessons")}</a><span>›</span><a href="#/lessons?part=${u.part}">${partName(u.part)}</a><span>›</span><span>${esc(unitName(u))}</span></nav>
  <section class="lesson-hero lesson-head">
    <p class="eyebrow">${partName(u.part).toUpperCase()} · ${esc(unitName(u)).toUpperCase()} · ${u.slides.length} ${t("slides").toUpperCase()}</p>
    <h1>${esc(u.title)}</h1>
    ${u.objectives && u.objectives.length ? `${objTitle ? `<strong>${objTitle}:</strong>` : ""}<ul class="objectives">${u.objectives.slice(0, 8).map(o => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}
    <div class="hero-actions">
      <a class="btn btn-accent btn-lg" href="#/present/${k}/0">${I("play", 18)}${!isStaff() ? t("viewSlides") : u.type === "quiz" ? t("present") : t("startLesson")}</a>
      ${last > 0 && isStaff() ? `<a class="btn btn-ghost" href="#/present/${k}/${last}">${t("continueFrom")} · ${last + 1}/${u.slides.length}</a>` : ""}
      ${isStaff() && (u.type === "lesson" || u.type === "quiz") ? `<button class="btn btn-ghost" id="taughtBtn">${I("check", 18)}${done ? t("taught") + " ✓" : t("markTaught")}</button>` : ""}
    </div>
  </section>
  ${accessBarHtml(k)}
  ${hw ? `<a class="pair-card" href="#/hw/${hw.num}">
      <span class="quick-ico">${I("pencil", 24)}</span>
      <span class="grow"><p class="eyebrow">${t("pairedHw")}</p><h3>${esc(hw.title)}</h3><p>${esc(hw.subtitle)}</p></span>
      <span class="chip${progress.hwDone[hw.num] ? " ok" : " accent"}">${progress.hwDone[hw.num] ? t("done") : t("openHomework")}</span>
    </a>` : (u.type === "quiz" ? `<p class="panel-sub">${t("noHw")}</p>` : "")}
  <section class="panel">
    <div class="panel-head toolbar"><h2>${t("slidesOfLesson")}</h2><span class="spacer"></span>
      ${isStaff() ? `<a class="btn btn-sm" href="${href(p.pptx)}" download>${I("download", 16)}PPTX</a>
      <a class="btn btn-sm" href="${href(p.pdf)}#page=${u.start}" target="_blank" rel="noopener">${I("file", 16)}PDF</a>` : ""}</div>
    <div class="slide-grid">${u.slides.map((s, i) => isStaff() || !/JAVOBLAR/i.test(s.label) ? `
      <a class="slide-thumb" href="#/present/${k}/${i}" style="text-decoration:none">
        <span class="thumb-canvas" data-src="${u.pdf}" data-page="${i + 1}"></span>
        <span class="thumb-label">${i + 1}. ${esc(s.label)}</span>
        <span class="thumb-title">${esc(s.title || s.label)}</span>
      </a>` : "").join("")}</div>
  </section>
  <div class="toolbar">
    ${prev && hasAccess(keyOf(prev)) ? `<a class="btn" href="#/u/${keyOf(prev)}">${I("left", 18)}${esc(unitName(prev))}</a>` : ""}
    <span class="spacer"></span>
    ${next && hasAccess(keyOf(next)) ? `<a class="btn" href="#/u/${keyOf(next)}">${esc(unitName(next))}${I("right", 18)}</a>` : ""}
  </div>`;
  const gb = document.getElementById("grantBtn");
  if (gb) gb.onclick = () => openGrantModal(k);
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
  const openN = D.homeworks.filter(h => hwOpen(h.num)).length;
  $app.innerHTML = `
  <div class="section-title"><div><h1>${t("homeworks")}</h1><p>${isStaff() ? D.homeworks.length : openN + "/" + D.homeworks.length} · ${t("hwNote")}</p></div></div>
  ${isStaff() ? "" : assignedPanel()}
  ${!openN ? emptyLessons() : ""}<input class="search-input" id="hwSearch" type="search" placeholder="${t("search")}" autocomplete="off">
  ${D.parts.map(p => {
    const ls = lessons.filter(u => u.part === p.num);
    if (!ls.length) return "";
    return `<section class="part-panel" data-part="${p.num}">
      <div class="part-head"><div><p class="eyebrow">${partName(p.num).toUpperCase()}</p><h2>${t("homework")} ${ls[0].num}–${ls[ls.length - 1].num}</h2></div></div>
      <div class="unit-list">${ls.map(u => hwByNum(u.num)).filter(Boolean).map(h => !hwOpen(h.num) ? `
        <div class="unit-row hw-list-row locked" data-search="${esc((h.num + " " + h.title + " " + h.subtitle).toLowerCase())}">
          <span class="unit-badge"><small>UY</small><b>${I("lock", 20)}</b></span>
          <span class="unit-main"><h3>${esc(h.title)}</h3><p class="unit-meta">${esc(h.subtitle)}</p></span>
          <span class="unit-side"><span class="chip">${I("lock", 12)} ${t("lockedChip")}</span></span></div>` : `
        <a class="unit-row hw-list-row${progress.hwDone[h.num] ? " done" : ""}" href="#/hw/${h.num}" style="text-decoration:none" data-search="${esc((h.num + " " + h.title + " " + h.subtitle).toLowerCase())}">
          <span class="unit-badge"><small>UY</small><b>${progress.hwDone[h.num] ? I("check", 22) : h.num}</b></span>
          <span class="unit-main"><h3>${esc(h.title)}</h3><p class="unit-meta">${esc(h.subtitle)}</p></span>
          <span class="unit-side">${progress.hwDone[h.num] ? `<span class="chip ok">${t("done")}</span>` : ""}${isStaff() && progress.taught["lesson-" + h.num] ? `<span class="chip">${t("taught")}</span>` : ""}${isStaff() && openAll["lesson-" + h.num] ? `<span class="chip accent">${t("openToAll")}</span>` : isStaff() && openFor("lesson-" + h.num).length ? `<span class="chip accent">${t("openFor")} ${openFor("lesson-" + h.num).length}</span>` : ""}</span>
        </a>`).join("")}</div></section>`;
  }).join("")}`;
  const s = document.getElementById("hwSearch");
  if (s) s.oninput = () => {
    const q = s.value.trim().toLowerCase();
    $app.querySelectorAll(".hw-list-row").forEach(r => { r.hidden = q && !r.dataset.search.includes(q); });
    $app.querySelectorAll(".part-panel").forEach(p => { p.hidden = !p.querySelector(".hw-list-row:not([hidden])"); });
  };
}

let hwWatch = null;
async function getStudents(){ return isStaff() ? members() : []; }
function stopHwWatch(){ if (hwWatch){ hwWatch(); hwWatch = null; } }

function viewHomework(n, query){
  const h = hwByNum(n);
  if (!h) return notFound();
  if (!hwOpen(n)) return lockedView();
  const sel = isStaff() ? (new URLSearchParams(query || "").get("s") || "") : "";
  const u = unitByKey("lesson-" + n), ans = D.answerKey.lessons[n];
  const prevH = hwByNum(n - 1), nextH = hwByNum(n + 1);
  const qs = sel ? "?s=" + encodeURIComponent(sel) : "";
  $app.innerHTML = `
  <nav class="crumbs"><a href="#/homeworks">${t("homeworks")}</a><span>›</span><span>${esc(h.title)}</span></nav>
  ${isStaff() ? `<section class="panel student-picker no-print">
      <label for="stuSel"><b>${t("answersOf")}</b></label>
      <select id="stuSel" class="search-input" style="margin:0"><option value="">${t("mine")}</option></select>
      <span class="chip" id="stuState" hidden></span>
    </section>` : ""}
  <div class="toolbar">
    ${u ? `<a class="btn btn-sm" href="#/u/${keyOf(u)}">${I("board", 16)}${t("openLesson")} ${n}</a>` : ""}
    ${sel ? "" : `<button class="btn btn-sm${progress.hwDone[n] ? " btn-accent" : ""}" id="hwDoneBtn">${I("check", 16)}${progress.hwDone[n] ? t("done") + " ✓" : t("markDone")}</button>`}
    <span class="spacer"></span>
    <button class="btn btn-sm" id="hwPrint">${I("print", 16)}${t("print")}</button>
    ${isStaff() ? `<a class="btn btn-sm" href="${href(h.docx)}" download>${I("download", 16)}DOCX</a>
    <a class="btn btn-sm" href="${href(h.pdf)}" target="_blank" rel="noopener">${I("file", 16)}PDF</a>` : ""}
    ${sel ? "" : `<button class="btn btn-sm btn-ghost" id="hwClear">${t("clear")}</button>`}
  </div>
  ${sel ? `<p class="panel-sub no-print">${t("viewingStudent")}</p>` : `<p class="panel-sub no-print">${t("hwNote")}</p>`}
  ${!isStaff() ? assignedList().filter(a => a.hw === n).map(a => `<section class="panel locked-note no-print">${I("clock", 20)}<span><b>${t("fromTeacher")}</b>${a.dueDate ? ` · ${t("due")}: ${esc(a.dueDate)}` : ""}${a.note ? ` · “${esc(a.note)}”` : ""}</span></section>`).join("") : ""}
  <article class="hw-sheet${sel ? " readonly" : ""}" id="hwSheet">${h.html}</article>
  ${ans && isStaff() ? (true ? `<section class="panel answer-panel">
      <div class="panel-head"><p class="eyebrow">${t("answerKeyFor")}</p><h2>${esc(ans.title)}</h2><p class="panel-sub">${esc(D.answerKey.intro)}</p></div>
      <ol>${ans.items.map(i => `<li>${esc(i)}</li>`).join("")}</ol></section>`
    : (isStaff() ? `<section class="panel locked-note no-print">${I("key", 22)}<span>${t("teacherOnly")}</span></section>` : "")) : ""}
  <div class="toolbar no-print">
    ${prevH && hwOpen(prevH.num) ? `<a class="btn" href="#/hw/${prevH.num}${qs}">${I("left", 18)}${t("homework")} ${prevH.num}</a>` : ""}
    <span class="spacer"></span>
    ${nextH && hwOpen(nextH.num) ? `<a class="btn" href="#/hw/${nextH.num}${qs}">${t("homework")} ${nextH.num}${I("right", 18)}</a>` : ""}
  </div>`;
  const sheet = document.getElementById("hwSheet");
  const inputs = [...sheet.querySelectorAll("input.blank")], checks = [...sheet.querySelectorAll(".hw-check input")];
  const fill = (vals, cvals) => {
    inputs.forEach((el, i) => { el.value = (vals || [])[i] || ""; });
    checks.forEach((el, i) => { el.checked = !!(cvals || [])[i]; });
  };
  document.getElementById("hwPrint").onclick = () => window.print();

  if (isStaff()){
    const ss = document.getElementById("stuSel");
    getStudents().then(list => {
      list.forEach(s => {
        const o = document.createElement("option"); o.value = s.uid;
        const f = (s.sp1.hwInputs[n] || []).filter(x => x).length;
        o.textContent = (s.name || s.email) + (s.sp1.hwDone[n] ? " ✓" : f ? ` (${f})` : "");
        ss.appendChild(o);
      });
      ss.value = sel;
    }).catch(e => console.warn(e));
    ss.onchange = () => { location.hash = "#/hw/" + n + (ss.value ? "?s=" + encodeURIComponent(ss.value) : ""); };
  }
  if (sel){
    inputs.forEach(el => el.readOnly = true); checks.forEach(el => el.disabled = true);
    const st = document.getElementById("stuState");
    hwWatch = Cloud().watchStudent(sel, p => {
      fill(p.hwInputs[n], p.hwChecks[n]);
      const f = (p.hwInputs[n] || []).filter(x => x).length;
      st.hidden = false;
      st.className = "chip" + (p.hwDone[n] ? " ok" : f ? " accent" : "");
      st.textContent = p.hwDone[n] ? t("done") : f ? `${t("inProgress")} · ${f}/${inputs.length} ${t("filled")}` : t("notStarted");
    });
    return;
  }
  fill(progress.hwInputs[n], progress.hwChecks[n]);
  inputs.forEach((el, i) => el.addEventListener("input", () => {
    const a = progress.hwInputs[n] = Array.from({ length:inputs.length }, (_, j) => (progress.hwInputs[n] || [])[j] || "");
    a[i] = el.value; syncHomework(n);
  }));
  checks.forEach((el, i) => el.addEventListener("change", () => {
    const a = progress.hwChecks[n] = Array.from({ length:checks.length }, (_, j) => !!(progress.hwChecks[n] || [])[j]);
    a[i] = el.checked; syncHomework(n);
  }));
  document.getElementById("hwDoneBtn").onclick = () => {
    if (progress.hwDone[n]) delete progress.hwDone[n]; else progress.hwDone[n] = Date.now();
    syncHomework(n); viewHomework(n, query);
  };
  document.getElementById("hwClear").onclick = () => {
    delete progress.hwInputs[n]; delete progress.hwChecks[n]; syncHomework(n);
    fill([], []); toast(t("cleared"));
  };
}

function fmtAgo(ts){
  if (!ts || typeof ts !== "number") return "—";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return settings.lang === "en" ? "just now" : "hozirgina";
  if (m < 60) return m + (settings.lang === "en" ? " min ago" : " daqiqa oldin");
  const h = Math.round(m / 60); if (h < 48) return h + (settings.lang === "en" ? " h ago" : " soat oldin");
  return new Date(ts).toLocaleDateString();
}
async function viewStudent(uid){
  if (!isStaff()) return notFound();
  $app.innerHTML = `<section class="panel"><p class="panel-sub">${t("loading")}</p></section>`;
  const s = members().find(x => x.uid === uid) || (people && people.users[uid] ? Object.assign({ uid }, people.users[uid]) : null);
  if (!s) return notFound();
  const draw = p => {
    if (!location.hash.startsWith("#/student/")) return;
    $app.innerHTML = `
    <nav class="crumbs"><a href="#/settings">${t("settings")}</a><span>›</span><a href="#/settings/students">${t("students")}</a><span>›</span><span>${esc(s.name || s.email)}</span></nav>
    <div class="section-title"><div><h1>${esc(s.name || s.email)}</h1><p>${esc(s.email || "")} · ${t("lastActive")}: ${fmtAgo(p.updatedAt || s.lastActive)}</p></div></div>
    ${D.parts.map(pt => `<section class="part-panel"><div class="part-head"><div><p class="eyebrow">${partName(pt.num).toUpperCase()}</p></div></div>
      <div class="unit-list">${lessons.filter(u => u.part === pt.num).map(u => {
        const h = hwByNum(u.num); if (!h) return "";
        const opened = !!(openAll["lesson-" + u.num] || (people && people.access[uid] && people.access[uid]["lesson-" + u.num]));
        const f = (p.hwInputs[h.num] || []).filter(x => x).length, done = !!p.hwDone[h.num];
        return `<a class="unit-row hw-list-row${done ? " done" : ""}" href="#/hw/${h.num}?s=${encodeURIComponent(uid)}" style="text-decoration:none">
          <span class="unit-badge"><small>UY</small><b>${done ? I("check", 22) : h.num}</b></span>
          <span class="unit-main"><h3>${esc(h.title)}</h3><p class="unit-meta">${esc(h.subtitle)}</p></span>
          <span class="unit-side">${opened ? `<span class="chip">${I("unlock", 12)}</span>` : ""}<span class="chip${done ? " ok" : f ? " accent" : ""}">${done ? t("done") : f ? f + " " + t("filled") : t("notStarted")}</span>${p.hwAt[h.num] ? `<span class="chip">${fmtAgo(p.hwAt[h.num])}</span>` : ""}</span></a>`;
      }).join("")}</div></section>`).join("")}`;
  };
  stopHwWatch();
  hwWatch = Cloud().watchStudent(uid, draw);
}

function viewAnswers(target){
  const ak = D.answerKey, $box = target || $app;
  if (!isStaff()) return notFound();
  $box.innerHTML = `
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
  s.oninput = () => { const q = s.value.trim().toLowerCase(); $box.querySelectorAll("[data-search]").forEach(r => { r.hidden = q && !r.dataset.search.includes(q); }); };
}

function fileRow(path){
  const name = path.split("/").pop(), ext = name.split(".").pop().toLowerCase();
  return `<div class="file-row"><span class="file-ico ${ext}">${ext.toUpperCase()}</span>
    <span class="file-name">${esc(name)}<small>${esc(path.replace(/^content\//, "Speakup-1/"))}</small></span>
    ${ext === "pdf" ? `<a class="btn btn-sm" href="${href(path)}" target="_blank" rel="noopener">${t("open")}</a>` : ""}
    <a class="btn btn-sm" href="${href(path)}" download>${I("download", 16)}</a></div>`;
}
function viewMaterials(){
  if (!isStaff()) return notFound();
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
function getPdf(src){
  if (!window.pdfjsLib) return Promise.reject(new Error("pdf.js missing"));
  if (!pdfDocs[src]) pdfDocs[src] = pdfjsLib.getDocument({ url:href(src), disableRange:true, disableStream:true, disableAutoFetch:true }).promise.catch(e => { delete pdfDocs[src]; throw e; });
  return pdfDocs[src];
}
async function renderPage(src, pageNum, canvas, cssW, cssH){
  const pdf = await getPdf(src);
  const page = await pdf.getPage(pageNum);
  const vp1 = page.getViewport({ scale:1 });
  const scale = Math.min(cssW / vp1.width, cssH ? cssH / vp1.height : Infinity);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const vp = page.getViewport({ scale:scale * dpr });
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  canvas.style.width = Math.floor(vp.width / dpr) + "px"; canvas.style.height = Math.floor(vp.height / dpr) + "px";
  const task = page.render({ canvasContext:canvas.getContext("2d"), viewport:vp });
  task.sp1 = { page, scale };
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
      renderPage(box.dataset.src, +box.dataset.page, c, box.clientWidth || 200)
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
  if (!hasAccess(k)) return;
  if (P && P.key === k){ P.go(startIdx, true); return; }
  closePresenter(true);
  autoGrant(k);
  const staff = isStaff();
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
    <div class="pr-stage" id="prStage"><span class="pr-loading" id="prLoading">${t("loading")}</span><canvas id="prCanvas"></canvas><div class="pr-layer" id="prLayer"></div><div class="pr-progress"><span id="prBar"></span></div></div>
    <aside class="pr-side" id="prSide" hidden>${u.slides.map((s, i) => isStaff() || !/JAVOBLAR/i.test(s.label) ? `<button data-i="${i}"><small>${i + 1} · ${esc(s.label)}</small>${esc(s.title || s.label)}</button>` : "").join("")}</aside>
    <div class="pr-bottom">
      <div class="pr-group">
        <button class="pr-btn" id="prPrev">${I("left", 18)}<span class="lbl">${t("prev")}</span></button>
        <span class="pr-count" id="prCount"></span>
        <button class="pr-btn primary" id="prNext"><span class="lbl">${t("next")}</span>${I("right", 18)}</button>
      </div>
      <div class="pr-group"${staff ? "" : " hidden"}>
        <button class="pr-btn" id="prText" title="${t("textTool")} (T)">${I("pencil", 18)}<span class="lbl">${t("textTool")}</span></button>
        <button class="pr-btn" id="prClear" title="${t("clearSlide")}">${I("x", 18)}<span class="lbl">${t("clearSlide")}</span></button>
        <button class="pr-btn${settings.skipAnswers ? " on" : ""}" id="prSkip" title="${t("hideAnswers")}">${I("skip", 18)}<span class="lbl">${t("hideAnswers")}</span></button>
      </div>
    </div>
  </div>`;
  const el = id => document.getElementById(id);
  const canvas = el("prCanvas"), stage = el("prStage"), layer = el("prLayer");
  let textMode = false;
  const board = () => (progress.boards[k] = progress.boards[k] || { s:{} });
  const slideBoard = (create) => { const b = board(); if (!b.s[cur] && create) b.s[cur] = { b:{}, t:[] }; return b.s[cur]; };
  const touch = () => { board().at = Date.now(); syncBoard(k); };
  function buildLayer(page, scale){
    if (!staff){ layer.innerHTML = ""; return; }
    const cw = parseFloat(canvas.style.width), ch = parseFloat(canvas.style.height);
    Object.assign(layer.style, { left:canvas.offsetLeft + "px", top:canvas.offsetTop + "px", width:cw + "px", height:ch + "px" });
    layer.innerHTML = "";
    layer.classList.toggle("texting", textMode);
    const sb = slideBoard(false) || { b:{}, t:[] };
    const vp = page.getViewport({ scale });
    const slideAt = cur;
    page.getTextContent().then(tc => {
      if (slideAt !== cur) return;
      let bi = 0;
      tc.items.forEach(it => {
        const str = it.str || ""; if (!/_{3,}/.test(str)) return;
        const pt = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const fh = Math.hypot(it.transform[2], it.transform[3]) * scale;
        const cwid = (it.width * scale) / Math.max(1, str.length);
        const re = /_{3,}/g; let m;
        while ((m = re.exec(str))){
          const i = bi++, inp = document.createElement("input");
          inp.className = "pr-blank"; inp.autocomplete = "off"; inp.spellcheck = false;
          const w = Math.max(m[0].length * cwid, fh * 2.2);
          Object.assign(inp.style, { left:(pt[0] + m.index * cwid) + "px", top:(pt[1] - fh * 1.05) + "px", width:w + "px", height:(fh * 1.3) + "px", fontSize:(fh * 0.92) + "px" });
          inp.value = (sb.b && sb.b[i]) || "";
          inp.classList.toggle("has", !!inp.value);
          inp.addEventListener("input", () => { const s2 = slideBoard(true); if (inp.value) s2.b[i] = inp.value; else delete s2.b[i]; inp.classList.toggle("has", !!inp.value); touch(); });
          inp.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === "Tab"){ e.preventDefault(); const all = [...layer.querySelectorAll(".pr-blank")]; const nx = all[all.indexOf(inp) + (e.shiftKey ? -1 : 1)]; if (nx) nx.focus(); else inp.blur(); } if (e.key === "Escape") inp.blur(); });
          layer.appendChild(inp);
        }
      });
    }).catch(() => {});
    (sb.t || []).forEach((n, i) => addNote(n, i));
  }
  function addNote(n, i){
    const d = document.createElement("div");
    d.className = "pr-note"; d.contentEditable = "true"; d.spellcheck = false; d.textContent = n.v || "";
    const ch = parseFloat(layer.style.height);
    Object.assign(d.style, { left:(n.x * 100) + "%", top:(n.y * 100) + "%", fontSize:(ch * 0.045) + "px" });
    d.addEventListener("input", () => { const s2 = slideBoard(true); s2.t[i] = { x:n.x, y:n.y, v:d.textContent }; touch(); });
    d.addEventListener("blur", () => { if (!d.textContent.trim()){ const s2 = slideBoard(true); s2.t[i] = null; s2.t = s2.t.filter(Boolean); touch(); rebuild(); } });
    d.addEventListener("keydown", e => { if (e.key === "Escape") d.blur(); });
    layer.appendChild(d);
    return d;
  }
  let lastLayer = null;
  const rebuild = () => { if (lastLayer) buildLayer(lastLayer.page, lastLayer.scale); };
  layer.addEventListener("click", e => {
    if (!textMode || e.target !== layer) return;
    const r = layer.getBoundingClientRect();
    const s2 = slideBoard(true);
    const n = { x:(e.clientX - r.left) / r.width, y:(e.clientY - r.top) / r.height - 0.02, v:"" };
    s2.t.push(n);
    const d = addNote(n, s2.t.length - 1); d.focus();
    textMode = false; el("prText").classList.remove("on"); layer.classList.remove("texting");
  });
  const isAnswer = i => /JAVOBLAR/i.test(u.slides[i].label);
  const visible = i => !((settings.skipAnswers || !staff) && isAnswer(i));
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
    layer.innerHTML = "";
    renderPage(u.pdf, cur + 1, canvas, w, h).then(tk => { task = tk; lastLayer = tk.sp1; return tk.promise; }).then(() => { task = null; const l = document.getElementById("prLoading"); if (l) l.remove(); rebuild(); })
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
    if (staff) toggleTaught(k, true);
    const hw = u.type === "lesson" ? hwByNum(u.num) : null;
    stage.insertAdjacentHTML("beforeend", `<div class="pr-end">
      <p class="eyebrow" style="color:var(--brand-200)">${esc(unitName(u)).toUpperCase()}</p>
      <h2>${u.type === "quiz" ? t("endTitleQuiz") : t("endTitle")}</h2>
      <p>${esc(u.title)} · ${el("prTimer").textContent}${hw && staff ? " · " + t("endSub") : ""}</p>
      <div class="pr-group" style="justify-content:center">
        ${hw ? `<button class="pr-btn primary" data-go="#/hw/${hw.num}">${I("pencil", 18)}${t("openHomework")} ${hw.num}</button>` : ""}
        <button class="pr-btn" data-go="#/u/${k}">${t("backToLesson")}</button>
        ${next && hasAccess(keyOf(next)) ? `<button class="pr-btn" data-go="#/u/${keyOf(next)}">${t("nextUnit")}: ${esc(unitName(next))}</button>` : ""}
      </div></div>`);
    stage.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { closePresenter(true); location.hash = b.dataset.go; });
    update();
  }
  function go(i, absolute){
    if (ended){ ended = false; stage.querySelector(".pr-end")?.remove(); if (!absolute){ i = cur; } }
    i = Math.max(0, Math.min(u.slides.length - 1, i));
    if (!staff) while (i < u.slides.length - 1 && !visible(i)) i++;
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
    if (e.target.closest && e.target.closest("input,textarea,[contenteditable]")) return;
    if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)){ e.preventDefault(); step(1); }
    else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)){ e.preventDefault(); step(-1); }
    else if (e.key === "Home"){ go(0, true); }
    else if (e.key === "End"){ go(u.slides.length - 1, true); }
    else if (e.key === "f" || e.key === "F"){ fullscreen(); }
    else if (e.key === "o" || e.key === "O"){ el("prOutline").click(); }
    else if ((e.key === "t" || e.key === "T") && staff){ el("prText").click(); }
    else if (e.key === "Escape" && !document.fullscreenElement){ closePresenter(); }
  }
  let tx = null;
  stage.addEventListener("touchstart", e => { tx = e.target.closest(".pr-blank,.pr-note") ? null : e.touches[0].clientX; }, { passive:true });
  stage.addEventListener("touchend", e => {
    if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  });
  el("prText").onclick = () => { textMode = !textMode; el("prText").classList.toggle("on", textMode); layer.classList.toggle("texting", textMode); if (textMode) toast(t("clickToPlace")); };
  el("prClear").onclick = () => { const b = board(); delete b.s[cur]; touch(); rebuild(); };
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
    if (!hasAccess(parts[1])){ closePresenter(true); return lockedView(); }
    if (!$app.innerHTML || !P) viewUnit(parts[1]);
    openPresenter(parts[1], +(parts[2] || 0));
    return;
  }
  closePresenter(true);
  stopHwWatch();
  renderChrome(path);
  if (!path) viewHome();
  else if (parts[0] === "lessons") viewLessons(query || "");
  else if (parts[0] === "u") viewUnit(parts[1]);
  else if (parts[0] === "homeworks") viewHomeworks();
  else if (parts[0] === "hw") viewHomework(+parts[1], query || "");
  else if (parts[0] === "students"){ location.replace("#/settings/students"); return; }
  else if (parts[0] === "answers"){ location.replace("#/settings/answers"); return; }
  else if (parts[0] === "student") viewStudent(parts[1]);
  else if (parts[0] === "settings"){ if (isStaff() && window.SP1Settings) window.SP1Settings.render(parts[1] || "", query || ""); else notFound(); }
  else if (parts[0] === "materials") viewMaterials();
  else notFound();
  if (parts[0] !== "settings" || !window.SP1Settings || window.SP1Settings.scrollTop) window.scrollTo(0, 0);
}
document.documentElement.lang = settings.lang;
let booted = false;
async function boot(){
  await initUser();
  if (!booted){ booted = true; window.addEventListener("hashchange", route_); }
  route_();
}
window.SP1_refresh = async () => { await initUser(); route_(); };

/* ---------------- the AI teacher (shared/tutor-ui.js, copied from SpeakUp) ----------------
 * What the teacher needs to teach the lesson on screen: its words come from the
 * vocabulary table of the lesson's homework, its grammar from the lesson goals. */
const vocabCache = {};
function vocabOf(n){
  if (vocabCache[n]) return vocabCache[n];
  const h = hwByNum(n), out = [];
  if (h){
    const doc = new DOMParser().parseFromString(h.html, "text/html");
    doc.querySelectorAll("table").forEach(tb => {
      const head = [...tb.querySelectorAll("tr:first-child th, tr:first-child td")].map(c => c.textContent.trim().toLowerCase());
      const en = head.map((x, i) => x === "english" ? i : -1).filter(i => i >= 0);
      if (!en.length) return;
      tb.querySelectorAll("tr").forEach((tr, ri) => {
        if (!ri) return;
        const c = [...tr.children].map(x => x.textContent.trim());
        en.forEach(i => { if (c[i]) out.push([c[i], c[i + 1] || ""]); });
      });
    });
  }
  return (vocabCache[n] = out.slice(0, 30));
}
window.TT_lessonContext = function(){
  const m = location.hash.match(/^#\/u\/([a-z]+-\d+)/);
  if (!m || !hasAccess(m[1])) return null;
  const u = unitByKey(m[1]);
  if (!u || u.type !== "lesson") return null;
  return { course: "SpeakUp-1", day: String(u.num), dayNum: u.num, title: u.title, review: false,
    words: vocabOf(u.num), dialogue: [], grammar: (u.objectives || []).slice(0, 4).join("; ") };
};
window.TT_progressContext = function(){
  const open = D.units.filter(u => u.type === "lesson" && (isStaff() ? progress.taught[keyOf(u)] : access[keyOf(u)]));
  const last = open[open.length - 1];
  return { course: "SpeakUp-1", done: open.length, next: last ? last.title : "", words: last ? vocabOf(last.num).slice(0, 12) : [] };
};
window.TT_lang = () => "uz";
window.addEventListener("tt-helper-ready", () => { try{ renderChrome(location.hash.replace(/^#\/?/, "").split("?")[0]); }catch(e){} });

/* used by shared/sp1-settings.js */
window.SP1App = { D, t, esc, I, toast, keyOf, unitByKey, unitName, partName, lessons, quizzes, hwByNum, fmtAgo,
  members, myClass, openFor, hasFor, openGrantModal, get openAll(){ return openAll; }, viewAnswers, isStaff, get people(){ return people; }, lang: () => settings.lang };
if (window.SP1Cloud && window.SP1Cloud.user) boot(); else window.addEventListener("sp1:auth", boot);
})();
