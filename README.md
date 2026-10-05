# SpeakWell

A personal communication-training website: daily conversation practice, interview coaching, a writing lab and a vocabulary builder. Static site (HTML, CSS, JavaScript) with no build step.

## Files

- `index.html` - page structure and the five sections (Overview, Daily Practice, Interview Coach, Writing Lab, Vocabulary)
- `style.css` - all styling, including the tablet and phone layouts and the mobile slide-in menu
- `app.js` - navigation, exercises, rule-based feedback, vocabulary and progress tracking
- `content.xml` - reference copy of the conversation scenarios (not loaded at runtime; keep in sync with `app.js`)

## Running it

Open `index.html` in a browser, or upload all files to GitHub Pages (or any static host).

## How it works

- Navigation: every sidebar button uses `data-page`, and every shortcut button uses `data-go`. Both must match a section `id` (`dashboard`, `conversation`, `interview`, `writing`, `vocabulary`). Sections can also be opened directly with a URL hash, e.g. `index.html#writing`.
- Mobile (700px and below): the sidebar becomes a slide-in menu opened by the hamburger button. It closes on selecting a page, tapping outside it, or pressing Escape.
- Progress (sessions, scores, learned phrases) is saved in the browser's `localStorage` under `speakwellProgress`. Clearing site data resets it.
- Feedback is transparent rule-based scoring, not an AI judge.

## Adding content

To add a nav page: add a `<section id="x" class="page">`, a `<button class="nav" data-page="x">`, and add `"x"` to `PAGE_IDS` in `app.js`.
