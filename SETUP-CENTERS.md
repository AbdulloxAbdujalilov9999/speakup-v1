# Selling SpeakUp-1 to learning centers: setup

This branch turns SpeakUp-1 into a product that many centers can use at once, each paying monthly.

## What it adds

- **Centers.** Each center has its own admin, teachers and pupils. A center admin sees only their own center.
- **Invite codes.** The owner gives a center its admin code; the admin makes teacher codes; each teacher gets a pupil code.
  Anyone who signs up with a code joins the center straight away (no approval queue). Links look like
  `https://<site>/?invite=K7PQ2M9X` and can be posted in a group's Telegram chat.
- **Plans and paid-until.** `centers/{id}/paidUntil` decides access. When it passes, every account of that center
  sees "Subscription ended" (results are kept), and the server stops serving its course files.
  The owner presses **Payment received** to add 1, 3, 6 or 12 months; each payment is logged.
- **Monthly report** per center: active pupils, homework written and checked, pupils per teacher, CSV.
  The owner's view also shows what to invoice and warns when the active pupils fit a different plan.
- **Private course files.** `server.js` serves `data/`, `slides*/` and `content*/` only after sign-in with a valid
  licence. Lesson PPTX decks and answer keys are served to staff only.
- **AI teacher off for center accounts** (`AI_FOR_CENTERS` in `shared/firebase-config.js`), because every call costs money.

Plans (same as speakup-centers.onrender.com): up to 50 pupils 300,000 so'm, up to 150 600,000, up to 300 900,000,
over 300 1,200,000 so'm a month.

## One-time setup

### 1. A Firebase project of its own

`database.rules.json` in this repo is written for a project used **only by SpeakUp-1**. Do not deploy it to the
shared `bucketlist-769b9` project: it would replace the rules SpeakUp and the other apps rely on.

1. https://console.firebase.google.com → Add project → name `speakup-centers` (Google Analytics off). Free Spark plan.
2. Build → Authentication → Get started → enable **Email/Password** and **Google**.
3. Build → Realtime Database → Create database → location **europe-west1 (Belgium)** → start in locked mode.
4. Realtime Database → Rules → paste `database.rules.json` → Publish.
   (or `npx firebase-tools deploy --only database --project <id>`)
5. Project settings → General → Your apps → Web app → copy the config into `shared/firebase-config.js`.
6. Authentication → Settings → Authorized domains → add the site's domain (e.g. `speakup-app.onrender.com`).
7. Sign in once with the owner email (`OWNER_EMAIL`): that account becomes the owner automatically.

Accounts from the old shared project don't move over by themselves: pupils of your own groups sign up again (or
you add them in Settings → Users). Their old homework stays in the old project.

### 2. Hosting: a Node web service instead of the static site

A static site cannot keep files private, so the site must run `server.js`:

- Render → New → Web Service → this repo, branch `main`, runtime Node, build `npm install`, start `npm start`.
- Environment: `SESSION_SECRET` = a long random string.
- Then remove (or suspend) the old static site `speakup-v1`, which still serves every file publicly.

The free plan sleeps after 15 minutes idle and takes about a minute to wake. Before showing it in a center, open
the site once; once a center pays, the Starter plan ($7 a month) keeps it awake.

### 3. Make the GitHub repo private

Every course file is also in the repo's history. Render keeps deploying from a private repo.

## Day to day

| Who | Where | What |
|---|---|---|
| You | Settings → Centers → New center | name, contact, phone, plan, free pilot days (30). The admin code is made at once. |
| You | the center's page | **Payment received** after the center pays; **Edit** to change plan or date. |
| Center admin | Settings → Center | teacher and pupil codes, monthly report, CSV. |
| Teacher | Settings → Invite code | the link for their class. |

## Developing

- `python3 tools/build_rules.py` regenerates `database.rules.json` (edit the script, not the JSON).
- Local preview with the emulators: `npx firebase-tools emulators:start --only auth,database --project <id>`, then
  `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 node server.js`
  and open `http://localhost:8761/?emu=1`.
- `python3 -m http.server` still works for a quick look (no file protection then).
