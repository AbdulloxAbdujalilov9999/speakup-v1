/* The lesson presentation: the teacher walks through a lesson slide by slide, speaking Uzbek for the explanations and
 * English for the words (see shared/teach-script.js for what is said; audio comes from /api/tts via TTVoice, and any
 * line that cannot be played falls back to the device voice or a reading pause, so the lesson always moves on).
 *
 *   TTTeach.available({ course, dayNum })  -> does this lesson have a presentation?
 *   TTTeach.open({ course, dayNum })       -> full-screen presentation; returns false if there is none
 * Classic script; all text from the lesson is inserted as plain text. */
(function () {
  "use strict";
  var T = window.TT_t || function (s) { return s; };
  var S = function () { return window.TTTeachScript; };
  var st = { el: null, deck: null, i: 0, playing: false, auto: true, gen: 0 };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  var css = [
    "#ttTeach{position:fixed;inset:0;z-index:66;display:flex;flex-direction:column;background:var(--surface-2,#EAF2F9);color:var(--ink,#0A1931)}",
    "#ttTeach .th-top{display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;background:var(--surface,#fff);border-bottom:1px solid var(--line,#D3E2EF)}",
    "#ttTeach .th-av{width:46px;height:46px;border-radius:50%;background:var(--accent,#1A3D63);color:var(--accent-ink,#fff);display:grid;place-items:center;font-size:24px;flex:none;transition:box-shadow .2s}",
    "#ttTeach .th-av.talk{box-shadow:0 0 0 6px var(--accent-soft,#DDEAF5),0 0 0 10px rgba(74,127,167,.25)}",
    "#ttTeach .th-who{flex:1;min-width:0}#ttTeach .th-who b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#ttTeach .th-who span{font-size:.85rem;color:var(--muted,#4D6684)}",
    "#ttTeach .th-x{border:0;background:transparent;color:var(--muted,#4D6684);font-size:30px;line-height:1;cursor:pointer;padding:4px 10px}",
    "#ttTeach .th-bar{height:5px;background:var(--line,#D3E2EF)}#ttTeach .th-bar i{display:block;height:100%;width:0;background:var(--accent-2,#1B7F57);transition:width .3s}",
    "#ttTeach .th-stage{flex:1;overflow:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:22px 18px;text-align:center}",
    "#ttTeach .th-kick{font-size:.85rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#4D6684)}",
    "#ttTeach .th-big{font-size:clamp(1.8rem,7vw,3rem);font-weight:800;line-height:1.15;max-width:900px;word-break:break-word}",
    "#ttTeach .th-uz{font-size:clamp(1.3rem,5vw,2rem);color:var(--accent,#1A3D63);font-weight:700;max-width:800px}",
    "#ttTeach .th-sub{font-size:1.05rem;color:var(--muted,#4D6684);max-width:720px}",
    "#ttTeach .th-ex{background:var(--surface,#fff);border:1px solid var(--line,#D3E2EF);border-radius:16px;padding:12px 16px;font-size:1.1rem;max-width:760px}",
    "#ttTeach .th-word{cursor:pointer;background:transparent;border:0;color:inherit;font-family:inherit;padding:0}",   /* no font shorthand: it would reset .th-big's size */
    "#ttTeach .th-hide{visibility:hidden}",
    "#ttTeach .th-lines{width:100%;max-width:760px;display:flex;flex-direction:column;gap:10px;text-align:left}",
    "#ttTeach .th-line{padding:10px 14px;border-radius:14px;background:var(--surface,#fff);border:2px solid transparent;opacity:.75}",
    "#ttTeach .th-line.on{border-color:var(--accent-mid,#4A7FA7);opacity:1}",
    "#ttTeach .th-line small{display:block;color:var(--muted,#4D6684);text-transform:uppercase;letter-spacing:.06em;font-size:.72rem}",
    "#ttTeach .th-line em{display:block;font-style:normal;color:var(--muted,#4D6684);margin-top:2px}",
    "#ttTeach .th-go{padding:14px 26px;border-radius:14px;border:0;background:var(--accent,#1A3D63);color:var(--accent-ink,#fff);font:inherit;font-weight:800;font-size:1.1rem;cursor:pointer;min-height:52px}",
    "#ttTeach .th-cap{min-height:3.2em;padding:8px 18px;text-align:center;font-size:1.02rem;line-height:1.4;color:var(--ink,#0A1931);background:var(--surface,#fff);border-top:1px solid var(--line,#D3E2EF)}",
    "#ttTeach .th-cap:empty{visibility:hidden}",
    "#ttTeach .th-ctl{background:var(--surface,#fff);border-top:1px solid var(--line,#D3E2EF);padding:10px 14px calc(10px + env(safe-area-inset-bottom))}",
    "#ttTeach .th-row{max-width:620px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:10px}",
    "#ttTeach .th-btn{min-width:56px;height:52px;padding:0 14px;border-radius:14px;border:1.5px solid var(--line,#D3E2EF);background:var(--surface-2,#EAF2F9);color:var(--ink,#0A1931);font:inherit;font-weight:700;cursor:pointer}",
    "#ttTeach .th-btn.main{background:var(--accent,#1A3D63);color:var(--accent-ink,#fff);border-color:var(--accent,#1A3D63);min-width:72px;font-size:1.3rem}",
    "#ttTeach .th-btn[disabled]{opacity:.4;cursor:default}",
    "#ttTeach .th-auto{max-width:620px;margin:8px auto 0;display:flex;justify-content:center;gap:8px;align-items:center;font-size:.88rem;color:var(--muted,#4D6684);cursor:pointer}",
  ].join("\n");

  // ---- speaking one step: the lesson audio first, then the device voice, then just a reading pause ----
  function deviceSpeak(text, lang, gen) {
    return new Promise(function (resolve) {
      var synth = window.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === "undefined") return resolve(false);
      var done = false, u = new SpeechSynthesisUtterance(text);
      var finish = function (ok) { if (!done) { done = true; clearTimeout(cap); resolve(ok); } };
      var cap = setTimeout(function () { try { synth.cancel(); } catch (e) {} finish(false); }, 9000);
      u.lang = lang; u.rate = 0.9;
      var vs = synth.getVoices() || [], v = vs.filter(function (x) { return x.lang && x.lang.toLowerCase().indexOf(lang.slice(0, 2)) === 0; })[0];
      if (!v && lang !== "en-US") return finish(false);
      if (v) u.voice = v;
      u.onend = function () { finish(true); }; u.onerror = function () { finish(false); };
      try { synth.cancel(); synth.speak(u); } catch (e) { finish(false); }
    });
  }
  function say(text, o) {
    var V = window.TTVoice, gen = o.gen, uz = o.lang === "uz";
    var av = st.el && st.el.querySelector(".th-av");
    if (av) av.classList.add("talk");
    var stopTalk = function () { if (av) av.classList.remove("talk"); };
    var readingPause = function () { return wait(Math.min(7000, 700 + text.length * 55)); };
    var viaDevice = function () { return uz ? readingPause() : deviceSpeak(text, "en-US", gen).then(function (ok) { return ok ? null : readingPause(); }); };
    var p = V && V.usable()
      ? V.play(text, { gender: o.gender, lang: o.lang, rate: o.rate || 1, stale: function () { return gen !== st.gen; } }).then(function (r) { return r === "failed" ? viaDevice() : null; })
      : viaDevice();
    return p.then(stopTalk, stopTalk);
  }

  // ---- the slides ----
  function showSlide(slide) {
    var stage = st.el.querySelector(".th-stage"); stage.textContent = "";
    st.el.querySelector(".th-bar i").style.width = Math.round(((st.i + 1) / st.deck.slides.length) * 100) + "%";
    st.el.querySelector(".th-count").textContent = (st.i + 1) + " / " + st.deck.slides.length;
    var back = st.el.querySelector(".th-back"), next = st.el.querySelector(".th-next");
    back.disabled = st.i === 0; next.disabled = st.i === st.deck.slides.length - 1;
    var add = function (cls, text) { var e = el("div", cls, text); stage.appendChild(e); return e; };
    var replay = function (text, gender) { return function () { st.gen++; if (window.TTVoice) window.TTVoice.stop(); say(text, { gender: gender, rate: 0.85, gen: st.gen }); }; };
    st.reveal = null; st.lines = null;
    if (slide.kind === "intro") {
      add("th-kick", T("Lesson")); add("th-big", slide.title); if (slide.sub) add("th-sub", slide.sub);
    } else if (slide.kind === "word" || slide.kind === "recall") {
      var w = el("button", "th-word th-big", slide.word); w.type = "button"; w.setAttribute("aria-label", slide.word); w.addEventListener("click", replay(slide.word, "female")); stage.appendChild(w);
      var m = add("th-uz" + (slide.kind === "recall" ? " th-hide" : ""), slide.meaning || "?"); if (slide.kind === "recall") st.reveal = m;
      if (slide.example) add("th-ex", slide.example);
    } else if (slide.kind === "dialogue") {
      var box = el("div", "th-lines"); st.lines = [];
      slide.lines.forEach(function (l) {
        var row = el("div", "th-line"); row.appendChild(el("small", null, l.who)); row.appendChild(el("div", null, l.en)); if (l.uz) row.appendChild(el("em", null, l.uz));
        box.appendChild(row); st.lines.push(row);
      });
      stage.appendChild(box);
    } else if (slide.kind === "grammar") {
      add("th-kick", T("Grammar")); add("th-big", slide.title);
      (slide.examples || []).forEach(function (e) { var b = add("th-ex", e.en); b.appendChild(el("div", "th-sub", e.uz)); });
    } else if (slide.kind === "outro") {
      add("th-big", T("Well done!"));
      var go = el("button", "th-go", T("Go to the quiz")); go.type = "button";
      go.addEventListener("click", function () { close(); try { if (window.TT_goQuiz) window.TT_goQuiz(); } catch (e) {} });
      stage.appendChild(go);
    }
    // warm the audio of the next two slides while this one plays
    var V = window.TTVoice;
    if (V) [1, 2].forEach(function (n) {
      var s2 = st.deck.slides[st.i + n]; if (!s2) return;
      s2.steps.forEach(function (x) { if (x.t && (x.k === "uz" || x.k === "en" || x.k === "line")) V.prefetch(x.t, x.gender, x.k === "uz" ? "uz" : undefined); });
    });
  }

  function highlight(i) { (st.lines || []).forEach(function (r, n) { r.classList.toggle("on", n === i); }); }

  // what the teacher is saying in Uzbek, in writing: helps in a noisy cab, and is all a student gets if the voice is unavailable
  function caption(text) { var c = st.el && st.el.querySelector(".th-cap"); if (c) c.textContent = text || ""; }

  // play slide i, then (if the student wants) the next one
  async function run(i) {
    var gen = ++st.gen; st.i = i; var slide = st.deck.slides[i]; showSlide(slide); setPlayIcon();
    for (var n = 0; n < slide.steps.length; n++) {
      if (gen !== st.gen) return;
      var s = slide.steps[n];
      if (s.k === "uz") { caption(s.t); await say(s.t, { lang: "uz", gen: gen }); }
      else if (s.k === "en") await say(s.t, { gender: s.gender, rate: s.rate, gen: gen });
      else if (s.k === "line") { highlight(s.i); await say(s.t, { gender: s.gender, rate: s.rate, gen: gen }); await wait(350); }
      else if (s.k === "pause") await wait(s.ms);
      else if (s.k === "reveal" && st.reveal) st.reveal.classList.remove("th-hide");
    }
    if (gen !== st.gen) return;
    caption(""); highlight(-1);
    if (st.playing && st.auto && i < st.deck.slides.length - 1) { await wait(900); if (gen === st.gen && st.playing) return run(i + 1); }
    if (i === st.deck.slides.length - 1) { st.playing = false; setPlayIcon(); }
  }
  function stopAudio() { caption(""); st.gen++; if (window.TTVoice) window.TTVoice.stop(); try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} var av = st.el && st.el.querySelector(".th-av"); if (av) av.classList.remove("talk"); }
  function setPlayIcon() { var b = st.el && st.el.querySelector(".th-play"); if (b) { b.textContent = st.playing ? "⏸" : "▶"; b.setAttribute("aria-label", st.playing ? T("Pause") : T("Play")); } }
  function go(i) {
    i = Math.max(0, Math.min(st.deck.slides.length - 1, i)); stopAudio(); st.i = i;
    if (st.playing) run(i); else { st.gen++; showSlide(st.deck.slides[i]); }
  }
  function close() { stopAudio(); st.playing = false; if (st.el) { st.el.remove(); st.el = null; } }

  // opts.autoplay: the student has just tapped "Start lesson" on the lesson screen, so begin speaking at once (no second Start button)
  function open(ctx, opts) {
    var sc = S(); if (!sc || !ctx) return false;
    var deck = sc.build(ctx.course, ctx.dayNum); if (!deck) return false;
    if (st.el && st.el.isConnected) return true;
    st.deck = deck; st.i = 0; st.playing = false; st.gen++;
    var root = el("div"); root.id = "ttTeach"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", T("Your English teacher")); st.el = root;
    var top = el("div", "th-top"), av = el("div", "th-av", "👩‍🏫"), who = el("div", "th-who");
    who.appendChild(el("b", null, deck.title)); who.appendChild(el("span", "th-count", ""));
    var x = el("button", "th-x", "×"); x.type = "button"; x.setAttribute("aria-label", T("Close")); x.addEventListener("click", close);
    top.appendChild(av); top.appendChild(who); top.appendChild(x);
    var bar = el("div", "th-bar"); bar.appendChild(el("i"));
    var stage = el("div", "th-stage"); stage.setAttribute("aria-live", "polite");
    var cap = el("div", "th-cap"); cap.setAttribute("aria-live", "polite");
    var ctl = el("div", "th-ctl"), row = el("div", "th-row");
    var back = el("button", "th-btn th-back", "⏮"), play = el("button", "th-btn main th-play", "▶"), next = el("button", "th-btn th-next", "⏭"), rep = el("button", "th-btn", "↻");
    [back, play, next, rep].forEach(function (b) { b.type = "button"; row.appendChild(b); });
    back.setAttribute("aria-label", T("Back")); next.setAttribute("aria-label", T("Next")); rep.setAttribute("aria-label", T("Repeat"));
    var auto = el("label", "th-auto"), cb = el("input"); cb.type = "checkbox"; cb.checked = st.auto; auto.appendChild(cb); auto.appendChild(document.createTextNode(T("Next slide automatically")));
    ctl.appendChild(row); ctl.appendChild(auto);
    root.appendChild(top); root.appendChild(bar); root.appendChild(stage); root.appendChild(cap); root.appendChild(ctl); document.body.appendChild(root);

    back.addEventListener("click", function () { go(st.i - 1); });
    next.addEventListener("click", function () { go(st.i + 1); });
    rep.addEventListener("click", function () { stopAudio(); st.playing = true; run(st.i); });
    play.addEventListener("click", function () { if (st.playing) { st.playing = false; stopAudio(); setPlayIcon(); } else { st.playing = true; run(st.i); } });
    cb.addEventListener("change", function () { st.auto = cb.checked; });
    root.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    // start screen: a tap is needed before any sound can play
    showSlide(deck.slides[0]);
    if (window.TTVoice) deck.slides[0].steps.forEach(function (x) { if (x.t && (x.k === "uz" || x.k === "en")) window.TTVoice.prefetch(x.t, x.gender, x.k === "uz" ? "uz" : undefined); });   // ready by the time they tap Start
    if (opts && opts.autoplay) {   // that tap was the gesture: TTVoice unlocked audio on it, so the teacher can talk straight away
      st.playing = true; run(0);
      return true;
    }
    var start = el("button", "th-go", T("Start lesson")); start.type = "button";
    stage.appendChild(start);
    start.addEventListener("click", function () { st.playing = true; run(0); });
    setTimeout(function () { start.focus(); }, 60);
    return true;
  }

  var style = el("style"); style.textContent = css; document.head.appendChild(style);
  // Get the first lines' audio ready while the student is still reading the lesson screen (each line is made the first time it is
  // played, which takes a few seconds), so the teacher can speak the moment "Start lesson" is tapped.
  var warmed = {};
  function warm(ctx) {
    var sc = S(), V = window.TTVoice; if (!sc || !V || !ctx || !V.usable()) return;
    var key = ctx.course + ":" + ctx.dayNum; if (warmed[key]) return; warmed[key] = true;
    var deck = sc.build(ctx.course, ctx.dayNum); if (!deck) return;
    deck.slides.slice(0, 2).forEach(function (sl) { sl.steps.forEach(function (x) { if (x.t && (x.k === "uz" || x.k === "en")) V.prefetch(x.t, x.gender, x.k === "uz" ? "uz" : undefined); }); });
  }
  window.TTTeach = {
    warm: warm,
    available: function (ctx) { var sc = S(); return !!(sc && ctx && sc.enabled(ctx.course, ctx.dayNum)); },
    open: open,
  };
})();
