/* Natural voice for both courses (window.TTVoice). Plays the audio from /api/tts, which turns each course phrase
 * into a lifelike recording once and caches it. If anything goes wrong (offline, voice not set up, quota used up,
 * browser can't play it) play() answers "failed" and the course falls back to the phone's built-in voice, so a
 * student never hears silence. Classic script, no dependencies.
 *
 *   TTVoice.usable()                      -> false after the server said it isn't set up (retried every 10 minutes)
 *   TTVoice.play(text, { gender, lang, rate, stale, onstart }) -> Promise<"played" | "stale" | "failed">   (lang: "uz" = the teacher's Uzbek narration)
 *   TTVoice.prefetch(text, gender, lang)  -> warm the next phrase of a list
 *   TTVoice.stop()                        -> silence now (pending play() calls resolve "stale")
 */
(function () {
  "use strict";
  // see shared/tutor-ui.js: window.TT_API_BASE names the server for pages that are not served from www.trucktalk.courses
  var API_BASE = window.TT_API_BASE != null ? String(window.TT_API_BASE) : (/^https?:$/.test(location.protocol) ? "" : "https://www.trucktalk.courses");
  var ENDPOINT = API_BASE + "/api/tts";
  var CACHE_NAME = "tt-voice-v1";
  var UZ_VOICE_VERSION = "2";   // bump when the Uzbek voice/model changes: the audio is cached "forever" by URL
  var FETCH_TIMEOUT_MS = 12000;   // a long line that has never been played is made on the spot
  var RETRY_AFTER_MS = 10 * 60 * 1000;
  // 0.25 s of silence: played inside the first tap/click so iOS Safari lets later, asynchronous plays through
  var SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

  var audio = null, unlocked = false, disabledUntil = 0, current = null, generation = 0;
  var inflight = {};

  function ensureAudio() { if (!audio) { audio = new Audio(); audio.preload = "auto"; } return audio; }
  function unlock() {
    if (unlocked) return; unlocked = true;
    try { var a = ensureAudio(); a.src = SILENT; var p = a.play(); if (p && p.catch) p.catch(function () { unlocked = false; }); } catch (e) { unlocked = false; }
  }
  ["pointerdown", "touchend", "click", "keydown"].forEach(function (ev) { document.addEventListener(ev, unlock, { capture: true, passive: true }); });

  function urlFor(text, gender, lang) { return ENDPOINT + "?g=" + (gender === "male" ? "male" : "female") + (lang === "uz" ? "&l=uz&v=" + UZ_VOICE_VERSION : "") + "&t=" + encodeURIComponent(text); }
  function usable() { return typeof Audio !== "undefined" && typeof fetch === "function" && Date.now() >= disabledUntil; }

  function getBlob(text, gender, lang) {
    var url = urlFor(text, gender, lang);
    if (inflight[url]) return inflight[url];
    var p = (async function () {
      var cache = null;
      try { if (window.caches) cache = await caches.open(CACHE_NAME); } catch (e) {}
      if (cache) { try { var hit = await cache.match(url); if (hit) return await hit.blob(); } catch (e) {} }
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, FETCH_TIMEOUT_MS) : null;
      try {
        var res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
        var type = (res.headers.get("content-type") || "");
        if (!res.ok || type.indexOf("audio") !== 0) {
          // Stop asking for a while only when the server says the voice itself is out: not set up, a bad key, or the
          // plan's quota used up (upstream-401/402/429), or when there is no function at this address (404/405 without a
          // JSON body: local dev, old deploy). A one-off provider hiccup (upstream-5xx, empty audio) and the function's
          // own JSON 404 ("not in the course") only concern this one line: it uses the device voice, the next line tries again.
          var json = type.indexOf("json") !== -1, code = "";
          if (json) { try { code = String((await res.json()).error || ""); } catch (e) {} }
          var out = (res.status === 503 && (!json || code === "not-configured" || /^upstream-(401|402|429)$/.test(code)))
            || ((res.status === 404 || res.status === 405) && !json);
          if (out) disabledUntil = Date.now() + RETRY_AFTER_MS;
          throw new Error("tts " + res.status);
        }
        var copy = res.clone();
        var blob = await res.blob();
        if (cache) { try { await cache.put(url, copy); } catch (e) {} }
        return blob;
      } finally { if (timer) clearTimeout(timer); }
    })();
    inflight[url] = p;
    var done = function () { delete inflight[url]; };
    p.then(done, done);
    return p;
  }

  function stop() {
    generation++;
    var c = current; current = null;
    if (audio) { try { audio.pause(); } catch (e) {} }
    if (c) c("stale");
  }

  function play(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!usable()) return resolve("failed");
      stop();                                   // one voice at a time
      var myGen = generation;
      var finished = false;
      var objectUrl = null;
      var finish = function (result) {
        if (finished) return; finished = true;
        if (current === finish) current = null;
        if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (e) {} }
        resolve(result);
      };
      current = finish;
      getBlob(text, opts.gender, opts.lang).then(function (blob) {
        if (finished) return;
        if (myGen !== generation || (opts.stale && opts.stale())) return finish("stale");
        var a = ensureAudio();
        objectUrl = URL.createObjectURL(blob);
        a.onended = function () { finish("played"); };
        a.onerror = function () { finish("failed"); };
        a.onplaying = function () { if (opts.onstart) { try { opts.onstart(); } catch (e) {} } };
        a.src = objectUrl;
        a.defaultPlaybackRate = a.playbackRate = Math.min(1.25, Math.max(0.5, opts.rate || 1));
        a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = true;
        var p = a.play();
        if (p && p.catch) p.catch(function () { finish("failed"); });
      }).catch(function () { finish("failed"); });
    });
  }

  function prefetch(text, gender, lang) {
    if (!usable() || !text) return;
    getBlob(text, gender, lang).catch(function () {});
  }

  window.TTVoice = { usable: usable, play: play, prefetch: prefetch, stop: stop, _url: urlFor };
})();
