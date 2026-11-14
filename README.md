# SpeakUp-1 — English from Zero

**Default course: "English from Zero v2"** (30 lessons, 15 progress checks, 30 homeworks). The old course stays available as
"Eski versiya" (header switch) until 14 Dec 2026.

## v2 at a glance
- **Presenter** — the three v2 decks split by PowerPoint section: every lesson, progress check, part intro and "Katta takrorlash" opens on its own (`slides-v2/`). Typing boxes, text layer, highlighter/pen/laser and answer-slide skipping work as before.
- **Mashq (practice)** — `#/practice/N`: the 8 exercises A–H from `course_v2.json`, checked instantly (choose → buttons; gap/fix/transform/translate → typing; order → tap or drag the words, or type; match → tap or drag pairs; true/false → T/F). Alternatives in " / " are accepted; case, extra spaces, final punctuation and ’ vs ' are ignored. Uzbek translation under every item, a listen button on English.
- **Soʻzlar** — flashcards for the 16 words (EN→UZ and UZ→EN) with the memory hooks. **Qoidalar** — rules, table, mnemonic, mistakes, reading, dialogue with audio. **Chiqish chiptasi** — the 5-question exit ticket.
- **Bugungi takrorlash** — `#/review`: every word and every wrong answer goes into a personal Leitner queue (1, 2, 4, 7, 15 days); 10–15 items a day.
- **Nazorat (online)** — `#/check/K`: each progress check as a timed test with a score.
- **XP, streak, badges, class leaderboard** — `#/me`. The teacher can switch the leaderboard off on the dashboard.
- **Teacher dashboard** — `#/dashboard`: per pupil × lesson homework status, homework auto-check %, practice %, exit ticket; check scores; most common wrong answers (practice and homework); CSV export; live "Savol-ball" game (`#/game/P`, pupils join at `#/play`).
- **Homework** — filled in on the page as before; pupils can check the auto-checkable answers ("Javoblarimni tekshirish"); the teacher's "Kalit boʻyicha belgilash" marks ✓/✗ from the per-blank key; writing and reading are left to the teacher.
- Pupil practice is stored next to their homework in `sp1/progress/{uid}` (xp, days, badges, px, srs, wrong, chk, game) — no new database rules. The leaderboard and live game are published by staff under `sp1/open/_lb` and `sp1/open/_game`.

## Update the v2 content
`python tools/import_v2.py "<path>/English from Zero v2" .` (needs `pip install pypdf`). It writes `data/content-v2.js`, `data/course-v2.js`, `slides-v2/` and `content-v2/`.

---

## v1 (Eski versiya)

Teacher platform built from everything in `~/Desktop/Speakup-1`, styled like SpeakUp (`~/speakup-webapp`).

- **Darslar / Lessons** — 3 parts, 30 lessons, 15 checkpoint tests (nazorat), plus each part's intro and wrap-up slides. Every lesson has a page with its goals, all slides as thumbnails, and **Darsni boshlash** (presenter): full screen, arrow keys / space / click / swipe, outline (O), fullscreen (F), timer, "skip answer slides". Slides are drawn from the original PDF exports of the pptx decks, so they look exactly like PowerPoint.
- **Uy vazifalari / Homeworks** — 30 homeworks, one per lesson, linked both ways. Fill-in blanks are typeable (saved on this device), printable, with DOCX/PDF downloads.
- **Javoblar / Answer key** — per lesson, shown only in Teacher mode (also under each homework).
- **Materiallar** — every original file (PPTX, PDF, DOCX) for open/download.
- Progress (lessons taught, homework done, last slide) is saved in the browser. UZ/EN switch, light/dark theme.

## Learning centers (licensing)
Centers, invite codes, plans with a paid-until date, a monthly report per center, and course files served only to
signed-in, paid users. Setup and day-to-day use: [SETUP-CENTERS.md](SETUP-CENTERS.md).

## Run
Production: `npm start` (runs `server.js`, which keeps the course files private).
Quick local look: double-click `Start SpeakUp-1.command`, or `python3 -m http.server 8761` here and open http://localhost:8761

## Update content
Change files in `~/Desktop/Speakup-1` (keep the same names; re-export the PDFs too), then:
`python3 tools/extract.py ~/Desktop/Speakup-1 .`
