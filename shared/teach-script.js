/* The teacher's presentation for a lesson, built from the lesson's own data (words + Uzbek meanings, dialogue +
 * translations, grammar rule in Uzbek). Pure data, no screen: shared/teach-ui.js plays it, and
 * scripts/build-voice-phrases.mjs lists every spoken Uzbek line so api/tts.js may speak exactly those (nothing
 * else), which also keeps the ElevenLabs cost bounded: each line is generated once and cached.
 *
 *   TTTeachScript.enabled(course, dayNum)    -> is there a presentation for this lesson yet?
 *   TTTeachScript.build(course, dayNum)      -> { title, sub, slides: [{ kind, ...visual, steps: [...] }] } | null
 *
 * A step is one of: { k:"uz", t } the teacher speaks Uzbek | { k:"en", t, gender, rate } an English word or sentence
 * | { k:"line", i, t, gender } a dialogue line (highlights line i) | { k:"pause", ms } time for the student to repeat
 * | { k:"reveal" } show the hidden answer.
 * Needs the page's CURRICULUM / ORIENTATION / GRAMMAR globals. */
(function (root) {
  "use strict";

  function range(n) { var a = []; for (var i = 1; i <= n; i++) a.push(i); return a; }

  // Lessons that have a presentation. Every lesson of both courses (the audio is made the first time a student plays a line, then kept).
  // "SpeakUp Classic" is the separate SpeakUp site (speak-upvercel.vercel.app, 90 lessons, its own lesson data): same teacher, its own course name.
  var ENABLED = { "Truck Talk": range(60), "SpeakUp": range(60), "SpeakUp Classic": range(90) };

  var ONES = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
  var TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];
  function uzNumber(n) {
    n = Math.floor(n);
    if (n < 1 || n > 99) return String(n);
    return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
  }
  function uzOrdinal(n) { var w = uzNumber(n); return /[aeiou]$/.test(w) ? w + "nchi" : w + "inchi"; }   // birinchi, ikkinchi, yigirmanchi

  // A hand-written Uzbek explanation for lessons whose grammar point has no unit in the Grammar Book yet.
  var GRAMMAR_UZ = {
    "Truck Talk:21": "Trucking atamalari ko'pincha ikki so'zdan iborat bo'ladi: duty status, sleeper berth, driving time. Ularni bitta so'z emas, butun ibora sifatida yodlang.",
    "Truck Talk:23": "Holatingizni 'I feel' bilan aytasiz: I feel drowsy, I feel tired, I feel alert. Bu xavfsizlik haqida gapirganda juda muhim.",
    "Truck Talk:38": "CB radio jargoni haydovchilarni bir-biriga yaqinlashtiradi. Bu norasmiy til: uni faqat boshqa haydovchilar bilan ishlating, ofitser yoki dispetcher bilan emas.",
    "Truck Talk:46": "Nosozlik belgisini 'feels like' yoki 'sounds like' bilan tasvirlaymiz: The engine feels like it's overheating. It sounds like a flat tire.",
    "Truck Talk:53": "'Get paid' ish haqi olish degani: I get paid every Friday. Pul to'g'ridan-to'g'ri hisobingizga o'tkaziladi.",
    "Truck Talk:57": "Fikr-mulohazaga 'Understood' yoki 'I'll work on that' deb javob bering. Bu tanqidda ham sizni kasbiy ko'rsatadi.",
    "Truck Talk:59": "Endi siz salomlashish, hujjatlar, ish soatlari va xushmuomala javoblarni bitta suhbatda birlashtira olasiz. Maqsad shu: tabiiy va ishonchli ingliz tili.",
    "Truck Talk:3": "Radioda harflarni aniq aytish uchun NATO alifbosi ishlatiladi. Har bir harfning o'z so'zi bor: A harfi uchun Alpha, B uchun Bravo, C uchun Charlie. Shunda shovqinli radioda ham sizni to'g'ri tushunishadi.",
  };

  // SpeakUp lessons do not name a Grammar Book unit themselves; these are the units its first lessons teach.
  var GRAMMAR_UNIT = {
    "SpeakUp:1": "alphabet-first-words", "SpeakUp:2": "to-be", "SpeakUp:3": "a-an", "SpeakUp:4": "plurals",
    "SpeakUp:6": "have-got", "SpeakUp:7": "can", "SpeakUp:8": "imperatives", "SpeakUp:9": "there-is-are",
    "SpeakUp:11": "present-simple", "SpeakUp:12": "present-continuous", "SpeakUp:14": "prepositions-place",
    "SpeakUp:16": "question-words", "SpeakUp:17": "some-any", "SpeakUp:18": "articles", "SpeakUp:19": "indefinite-pronouns",
    "SpeakUp:21": "adjectives-adverbs", "SpeakUp:22": "comparatives", "SpeakUp:23": "conjunctions", "SpeakUp:24": "past-regular",
    "SpeakUp:26": "past-irregular", "SpeakUp:27": "past-continuous", "SpeakUp:28": "modals", "SpeakUp:29": "future",
    "SpeakUp:31": "present-perfect", "SpeakUp:34": "conditionals", "SpeakUp:37": "passive-voice", "SpeakUp:38": "relative-clauses",
  };

  var tidy = function (s) { return String(s == null ? "" : s).replace(/\s*\.\.\.\s*$/, "").replace(/\s+/g, " ").trim(); };
  var meaning = function (s) { return tidy(s).replace(/\.+$/, ""); };
  // what is read aloud for a meaning: no bracketed hints ("bor (he/she/it)": the hint stays on screen) and no slashes
  var spoken = function (s) { return meaning(s).replace(/\s*\([^)]*\)/g, "").replace(/\s*\/\s*/g, ", ").replace(/\s+/g, " ").trim() || meaning(s).replace(/[()]/g, ""); };

  // One Uzbek line is at most 300 characters (api/tts.js), and "Endi grammatika. " comes first: keep whole sentences that fit.
  function fit(text, max) {
    text = tidy(text); if (text.length <= max) return text;
    var out = "", parts = text.split(/(?<=[.!?])\s+/);
    for (var i = 0; i < parts.length; i++) { var next = out ? out + " " + parts[i] : parts[i]; if (next.length > max) break; out = next; }
    return out || text.slice(0, max).replace(/\s+\S*$/, "");
  }

  function enabled(course, dayNum) { return (ENABLED[course] || []).indexOf(Number(dayNum)) !== -1; }

  function build(course, dayNum) {
    if (!enabled(course, dayNum)) return null;
    // the lesson data are top-level `const`s in curriculum.js / grammar.js: visible by name, but not as properties of window
    var C = typeof CURRICULUM !== "undefined" ? CURRICULUM : root.CURRICULUM || [];
    var G = typeof GRAMMAR !== "undefined" ? GRAMMAR : root.GRAMMAR || [];
    var O = typeof ORIENTATION !== "undefined" ? ORIENTATION : root.ORIENTATION || [];
    var d = C.concat(O).filter(function (x) { return x.d === Number(dayNum); })[0];
    if (!d) return null;
    var slides = [];

    // 1. welcome
    var words = (d.v || []).map(function (r) { return { en: tidy(r[0]), uz: meaning(r[1]), ex: tidy(r[2]) }; }).filter(function (w) { return w.en; });
    var hello = "Salom! ";
    slides.push({
      kind: "intro", title: d.tu || d.t, sub: d.t,
      steps: d.rev
        ? [{ k: "uz", t: hello + "Bugun " + uzOrdinal(d.w) + " hafta takrorlash kuni." }, { k: "uz", t: "Men inglizcha so'z aytaman, siz o'zbekcha ma'nosini o'ylab ko'ring. Keyin javobni eshitasiz. Boshladik!" }]
        : [{ k: "uz", t: hello + "Bugun " + uzOrdinal(d.d) + " dars. Mavzu: " + (d.tu || d.t) + ". " + uzNumber(words.length) + " ta yangi so'z o'rganamiz." }, { k: "uz", t: "Men so'zni inglizcha aytaman, siz takrorlang. Boshladik!" }],
    });

    // 2. the words, one at a time: say it, what it means, say it with me, an example
    words.forEach(function (w) {
      slides.push({
        kind: "word", word: w.en, meaning: w.uz, example: w.ex,
        steps: [
          { k: "en", t: w.en, gender: "female", rate: 0.85 },
          { k: "uz", t: "Bu — " + spoken(w.uz) + " degani." },
          { k: "uz", t: "Takrorlang." },
          { k: "pause", ms: 3500 },
        ].concat(w.ex ? [{ k: "uz", t: "Misol." }, { k: "en", t: w.ex, gender: "female", rate: 0.9 }] : []),
      });
    });

    // 3. the conversation, two voices, translation on screen
    if (d.dl && d.dl.length) {
      var lines = d.dl.map(function (r) { return { who: r[0], en: tidy(r[1]), uz: tidy(r[2]) }; });
      var first = lines[0].who;
      slides.push({
        kind: "dialogue", lines: lines,
        steps: [{ k: "uz", t: "Endi qisqa suhbatni tinglang. Tarjimasini ekranda ko'rasiz." }]
          .concat(lines.map(function (l, i) { return { k: "line", i: i, t: l.en, gender: l.who === first ? "female" : "male", rate: 0.95 }; }))
          .concat([{ k: "uz", t: "Endi siz ham shunday gapirib ko'ring." }]),
      });
    }

    // 4. the grammar point, in Uzbek
    var unitId = d.gu || GRAMMAR_UNIT[course + ":" + d.d];
    var unit = unitId ? G.filter(function (g) { return g.id === unitId; })[0] : null;
    var rule = unit ? tidy(unit.ruleUz) : GRAMMAR_UZ[course + ":" + d.d];
    var classicTip = !rule && course === "SpeakUp Classic" && d.g && d.g.length >= 4 && d.g[3];   // its grammar tip: [title, body, titleUz, bodyUz]
    if (classicTip) rule = fit(d.g[3], 270);
    if (rule) {
      var exs = unit && unit.examples ? unit.examples.slice(0, 2).map(function (e) { return { en: tidy(e[0]), uz: tidy(e[1]) }; }) : [];
      var gsteps = [{ k: "uz", t: "Endi grammatika. " + rule }];
      exs.forEach(function (e) { gsteps.push({ k: "uz", t: "Masalan." }, { k: "en", t: e.en, gender: "female", rate: 0.9 }, { k: "uz", t: "Ya'ni: " + e.uz }); });
      slides.push({ kind: "grammar", title: unit ? tidy(unit.titleUz) : tidy(classicTip ? d.g[2] : d.g && d.g[0]), rule: rule, examples: exs, steps: gsteps });
    }

    // 5. a review day has no words of its own: quick questions on the week's words
    if (d.rev) {
      var recap = [];
      C.filter(function (x) { return x.w === d.w && !x.rev && x.v; }).forEach(function (x) {
        x.v.slice(0, 4).forEach(function (r) { var en = tidy(r[0]); if (en) recap.push({ en: en, uz: meaning(r[1]) }); });
      });
      recap.forEach(function (w) {
        slides.push({
          kind: "recall", word: w.en, meaning: w.uz,
          steps: [{ k: "en", t: w.en, gender: "female", rate: 0.9 }, { k: "uz", t: "Bu nima degani?" }, { k: "pause", ms: 3500 }, { k: "reveal" }, { k: "uz", t: spoken(w.uz) + "." }],
        });
      });
    }

    // 6. goodbye + on to the quiz
    slides.push({
      kind: "outro",
      steps: [{ k: "uz", t: "Barakalla! Bugungi darsni tugatdingiz. Endi test bo'limiga o'tib, o'zingizni sinab ko'ring." }],
    });
    return { course: course, day: d.d, title: d.tu || d.t, sub: d.t, slides: slides };
  }

  // what the docked teacher says when a lesson with a presentation opens (once per lesson per visit)
  var DOCK_LINE = "Salom! Bu darsni men tushuntirib beraman. Boshlash uchun menga bosing.";

  root.TTTeachScript = { enabled: enabled, build: build, dockLine: DOCK_LINE, enabledDays: function (course) { return (ENABLED[course] || []).slice(); }, uzNumber: uzNumber, uzOrdinal: uzOrdinal };
})(typeof window !== "undefined" ? window : globalThis);
