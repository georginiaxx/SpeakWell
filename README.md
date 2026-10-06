# SpeakWell

A personal communication-development site: everyday conversation practice, an adaptive interview coach, a writing lab with a proofreader, a renewable vocabulary bank, history, progress tracking and achievements. Static HTML/CSS/JS. No build step, no dependencies, no accounts. Works on GitHub Pages and when opened from disk.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell, navigation and static sections |
| `style.css` | All styling (desktop, iPad, phone, slide-in mobile menu) |
| `js/content.js` | Content banks: 52 conversation scenarios in 13 categories, 26 writing prompts in 13 task types, 80 vocabulary phrases in 10 categories, 70+ interview questions, role families, Help Me Think ladders, scenario/interview builders |
| `js/assess.js` | Text analysis, proofreader, the **rule-based assessment**, assessment-provider layer, attempt comparison |
| `js/store.js` | Validated localStorage, migration, vocabulary rotation, stats, achievements |
| `js/app.js` | UI: navigation, practice screens, history, dashboard, profile, voice |

`content.xml` from earlier versions was removed: the content now lives in JavaScript data (`js/content.js`), which is what the app actually used.

## The learning loop

1. You attempt the task (nothing is revealed first).
2. SpeakWell assesses **your actual text**: nine skills plus an overall effectiveness score. Nothing is cached, so rewriting an answer gives a new score.
3. It explains what worked, what weakened the answer, your biggest improvement area, and what to do next.
4. You can **Try again** (each attempt is scored independently and linked to the same exercise).
5. **Help Me Think** gives small prompts, one at a time. It never writes the answer for you.
6. A **stronger example** and why it is stronger appear after your attempt (or only on explicit request via "I'm stuck").
7. Progress is tracked from real attempts only.

## Assessment (rule-based, not AI)

Skills: clarity, structure, professionalism, vocabulary, specificity, conciseness, repetition, filler words, relevance. Each is 0 to 100 (higher is better). Overall effectiveness is a weighted combination (weights differ for conversation, interview and writing) adjusted for length. It is transparent heuristic scoring: regular expressions, word counts, and checks for expected "moves" (greeting, clarifying question, STAR parts, sign-off and so on). It does not understand meaning and it never judges accent. Voice transcripts are scored without punctuation penalties.

### Plugging in real AI later

`js/assess.js` exposes one interface:

```js
SW.assess.run({kind, text, prompt, ctx, voice, confidence}) // -> Promise<Assessment>
SW.assess.registerProvider('myProvider', async (submission) => assessment)
SW.assess.use('myProvider')   // falls back to rule-based if it fails or returns an invalid shape
```

`aiAssessment()` is included as an adapter: set `SW.config.aiEndpoint = 'https://your-server.example/assess'` and call `SW.assess.use('ai')`. It POSTs `{schemaVersion, kind, prompt, response, context, skills}` and expects JSON:

```json
{"overall": 74, "skills": {"clarity": 80, "structure": 70, "professionalism": 85, "vocabulary": 70, "specificity": 60, "conciseness": 78, "repetition": 90, "fillers": 95, "relevance": 72},
 "strengths": ["..."], "weaknesses": ["..."], "advice": ["..."], "biggest": {"skill": "specificity", "label": "Specificity", "advice": "..."},
 "issues": [{"type": "vague", "sev": 1, "excerpt": "...", "why": "...", "fix": "..."}], "example": "optional", "engine": "my-model"}
```

**Never put an API key in this repository.** Keep it on your own server and have the browser call that server. Nothing is sent anywhere unless you configure an endpoint.

## Data and privacy

Stored in `localStorage` under `speakwell.v2` (plus a copy of damaged data under `speakwell.v2.corrupt` if recovery was needed). Contains your profile, attempts (responses, scores, feedback), vocabulary progress and achievements. Data from the previous version (`speakwellProgress`) is migrated automatically and left untouched. Earlier sessions only counted towards your session total, because their responses were not saved. Export, import and reset are on the Profile page.

Voice practice uses the browser's own speech recognition where available. Depending on the browser, audio may be processed by the browser vendor's service. SpeakWell itself never receives or stores audio, only the text you submit.

## Adding content

Scenarios, writing prompts, vocabulary and interview questions are plain data in `js/content.js`. Append rather than reorder: scenario ids (`work-1`), vocabulary ids (`v0`...) and question ids (`q0`...) are stored in people's history.
