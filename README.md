# Exam Tracker

Track competitive exams, deadlines, and prep — personal, fast, no fluff.

## Stack

Vanilla HTML + CSS + JavaScript (no build step) · Firebase Auth & Firestore · Cloudflare Pages

## Structure

```
index.html   markup & modals
style.css    all styles (dark/light, responsive)
app.js       all logic — auth, Firestore, rendering, editor
sw.js        service worker (offline shell cache)
manifest.json  PWA manifest
```

## Features

- Email + Google auth
- Add / edit / delete exams with deadlines, exam dates, vacancies, pay scale
- Pinned exam countdown rings
- Eligibility, Syllabus, Info — markdown editor per exam
- Resources (links + PDFs) per exam
- Filter by status / tag / search · sort · custom drag order
- Import / export JSON
- Dark & light theme · PWA installable

## Local Dev

No build step. Serve the folder with any static server:

```bash
npx serve .
```

Firebase config lives in `app.js`. Replace with your own project credentials.
