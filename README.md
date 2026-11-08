# SpeakUp-1 — English from Zero

Teacher platform built from everything in `~/Desktop/Speakup-1`, styled like SpeakUp (`~/speakup-webapp`).

- **Darslar / Lessons** — 3 parts, 30 lessons, 15 checkpoint tests (nazorat), plus each part's intro and wrap-up slides. Every lesson has a page with its goals, all slides as thumbnails, and **Darsni boshlash** (presenter): full screen, arrow keys / space / click / swipe, outline (O), fullscreen (F), timer, "skip answer slides". Slides are drawn from the original PDF exports of the pptx decks, so they look exactly like PowerPoint.
- **Uy vazifalari / Homeworks** — 30 homeworks, one per lesson, linked both ways. Fill-in blanks are typeable (saved on this device), printable, with DOCX/PDF downloads.
- **Javoblar / Answer key** — per lesson, shown only in Teacher mode (also under each homework).
- **Materiallar** — every original file (PPTX, PDF, DOCX) for open/download.
- Progress (lessons taught, homework done, last slide) is saved in the browser. UZ/EN switch, light/dark theme.

## Run
Double-click `Start SpeakUp-1.command`, or: `python3 -m http.server 8761` here and open http://localhost:8761

## Update content
Change files in `~/Desktop/Speakup-1` (keep the same names; re-export the PDFs too), then:
`python3 tools/extract.py ~/Desktop/Speakup-1 .`
