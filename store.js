/* SpeakWell storage: validated localStorage state, migration from v1 (speakwellProgress), stats, profile, achievements.
   Everything here is defensive: corrupted or blocked storage never throws into the UI. */
(function (root) {
'use strict';
var SW = root.SW = root.SW || {}, C = SW.content;
var KEY = 'speakwell.v2', LEGACY = 'speakwellProgress', MAX_ATTEMPTS = 400, MAX_LOG = 300;
var KINDS = ['conversation', 'interview', 'writing'], CONF = ['', 'low', 'building', 'moderate', 'confident', 'very-confident'];
var status = {memoryOnly:false, saveFailed:false, recovered:false, dropped:0, migrated:false, note:''};
var state = null;

function fresh() {
  return {version:2, createdAt:Date.now(), profile:{name:'', interests:'', roles:[], goals:'', confidence:''}, attempts:[],
    vocab:{learned:{}, active:[], recent:[], focusCat:'all', log:[]}, recent:{conversation:[], writing:[], interview:[]}, achievements:{},
    ui:{interview:{role:'', level:'entry', type:'general'}}, legacy:{sessions:0, scores:[]}};
}
function str(x, n) { return typeof x === 'string' ? x.slice(0, n || 5000) : ''; }
function num(x, d) { return typeof x === 'number' && isFinite(x) ? x : (d == null ? 0 : d); }
function strList(x, n, m) { return Array.isArray(x) ? x.filter(function (s) { return typeof s === 'string'; }).map(function (s) { return s.slice(0, m || 600); }).slice(0, n || 20) : []; }
function sanitizeAttempt(a) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || KINDS.indexOf(a.kind) < 0 || typeof a.response !== 'string' || typeof a.overall !== 'number' || !isFinite(a.overall)) return null;
  var skills = {}; if (!a.skills || typeof a.skills !== 'object') return null;
  for (var i = 0; i < C.SKILLS.length; i++) { var v = a.skills[C.SKILLS[i].id]; if (typeof v !== 'number' || !isFinite(v)) return null; skills[C.SKILLS[i].id] = Math.max(0, Math.min(100, Math.round(v))); }
  var f = a.feedback && typeof a.feedback === 'object' ? a.feedback : {}, m = a.meta && typeof a.meta === 'object' ? a.meta : {};
  return {id:a.id.slice(0, 60), runId:str(a.runId, 60) || a.id.slice(0, 60), kind:a.kind, exerciseId:str(a.exerciseId, 60), title:str(a.title, 400), subtitle:str(a.subtitle, 400), prompt:str(a.prompt, 2000), response:a.response.slice(0, 8000),
    overall:Math.max(0, Math.min(100, Math.round(a.overall))), skills:skills, attemptNumber:Math.max(1, num(a.attemptNumber, 1) | 0), ts:num(a.ts, Date.now()),
    feedback:{strengths:strList(f.strengths, 6), weaknesses:strList(f.weaknesses, 6), biggest:f.biggest && typeof f.biggest === 'object' ? {skill:str(f.biggest.skill, 30), label:str(f.biggest.label, 40), advice:str(f.biggest.advice, 400)} : null, advice:strList(f.advice, 6),
      issues:Array.isArray(f.issues) ? f.issues.filter(function (x) { return x && typeof x.why === 'string'; }).slice(0, 14).map(function (x) { return {type:str(x.type, 20), sev:Math.max(1, Math.min(3, num(x.sev, 1) | 0)), excerpt:str(x.excerpt, 120), why:str(x.why, 400), fix:str(x.fix, 300)}; }) : [],
      moves:f.moves && typeof f.moves === 'object' ? {hit:strList(f.moves.hit, 12, 30), missed:strList(f.moves.missed, 12, 30)} : {hit:[], missed:[]}, compare:str(f.compare, 400), engine:str(f.engine, 40)},
    example:str(a.example, 3000), why:strList(a.why, 8, 400),
    meta:{role:str(m.role, 120), level:str(m.level, 20), type:str(m.type, 20), qkind:str(m.qkind, 20), qid:str(m.qid, 40), sessionId:str(m.sessionId, 60), hints:Math.max(0, num(m.hints, 0) | 0), voice:!!m.voice, name:str(m.name, 40), cat:str(m.cat, 40), followUp:!!m.followUp}};
}
function sanitize(raw) {
  var s = fresh(); status.dropped = 0; if (!raw || typeof raw !== 'object') return s;
  if (typeof raw.createdAt === 'number') s.createdAt = raw.createdAt;
  var p = raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
  s.profile = {name:str(p.name, 60), interests:str(p.interests, 400), roles:strList(p.roles, 8, 80), goals:str(p.goals, 500), confidence:CONF.indexOf(p.confidence) >= 0 ? p.confidence : ''};
  if (Array.isArray(raw.attempts)) raw.attempts.forEach(function (a) { var c = sanitizeAttempt(a); if (c) s.attempts.push(c); else status.dropped++; });
  s.attempts.sort(function (x, y) { return x.ts - y.ts; }); if (s.attempts.length > MAX_ATTEMPTS) s.attempts = s.attempts.slice(-MAX_ATTEMPTS);
  var v = raw.vocab && typeof raw.vocab === 'object' ? raw.vocab : {}, ids = {}; C.VOCAB.forEach(function (x) { ids[x.id] = 1; });
  if (v.learned && typeof v.learned === 'object') Object.keys(v.learned).forEach(function (k) { if (ids[k]) s.vocab.learned[k] = num(v.learned[k], Date.now()); });
  s.vocab.active = strList(v.active, 12, 12).filter(function (k) { return ids[k] && !s.vocab.learned[k]; }).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
  s.vocab.recent = strList(v.recent, 60, 12).filter(function (k) { return ids[k]; });
  s.vocab.focusCat = (v.focusCat === 'all' || C.VOCAB_CATS.indexOf(v.focusCat) >= 0) ? v.focusCat : 'all';
  if (Array.isArray(v.log)) s.vocab.log = v.log.filter(function (e) { return e && typeof e === 'object' && ids[e.phraseId] && (e.action === 'learned' || e.action === 'practised'); }).slice(-MAX_LOG).map(function (e) { return {id:str(e.id, 40) || ('vl' + num(e.ts)), ts:num(e.ts, Date.now()), action:e.action, phraseId:e.phraseId, text:str(e.text, 1000), ok:!!e.ok}; });
  var r = raw.recent && typeof raw.recent === 'object' ? raw.recent : {}; KINDS.forEach(function (k) { s.recent[k] = strList(r[k], 40, 60); });
  if (raw.achievements && typeof raw.achievements === 'object') Object.keys(raw.achievements).forEach(function (k) { if (typeof raw.achievements[k] === 'number') s.achievements[k] = raw.achievements[k]; });
  var u = raw.ui && raw.ui.interview && typeof raw.ui.interview === 'object' ? raw.ui.interview : {};
  s.ui.interview = {role:str(u.role, 80), level:['noexp', 'entry', 'some', 'exp'].indexOf(u.level) >= 0 ? u.level : 'entry', type:C.ITYPES.some(function (t) { return t[0] === u.type; }) ? u.type : 'general'};
  var l = raw.legacy && typeof raw.legacy === 'object' ? raw.legacy : {}; s.legacy = {sessions:Math.max(0, num(l.sessions, 0) | 0), scores:Array.isArray(l.scores) ? l.scores.filter(function (x) { return typeof x === 'number' && isFinite(x); }).slice(-200) : []};
  return s;
}
function migrateLegacy(storage) {
  var s = fresh(); try { var raw = JSON.parse(storage.getItem(LEGACY) || 'null'); } catch (e) { return null; }
  if (!raw || typeof raw !== 'object') return null;
  var scores = Array.isArray(raw.scores) ? raw.scores.filter(function (x) { return typeof x === 'number' && isFinite(x); }) : [];
  var sessions = typeof raw.sessions === 'number' && isFinite(raw.sessions) ? raw.sessions : scores.length;
  s.legacy = {sessions:Math.max(0, sessions | 0), scores:scores.slice(-200)};
  if (Array.isArray(raw.words)) raw.words.forEach(function (i) { if (Number.isInteger(i) && i >= 0 && i < 8) s.vocab.learned['v' + i] = Date.now(); });
  if (!s.legacy.sessions && !Object.keys(s.vocab.learned).length) return null;
  status.migrated = true; return s;
}
function getStorage() { try { var t = root.localStorage; var k = '__sw_test__'; t.setItem(k, '1'); t.removeItem(k); return t; } catch (e) { return null; } }
var storage = null;
function load() {
  storage = getStorage(); status.memoryOnly = !storage; status.recovered = false; status.saveFailed = false; status.migrated = false; status.note = '';
  if (!storage) { state = fresh(); status.note = 'Your browser is blocking storage, so progress will not be saved after you close this page.'; return state; }
  var raw = null;
  try { raw = storage.getItem(KEY); } catch (e) { raw = null; }
  if (raw == null) { var m = migrateLegacy(storage); state = m || fresh(); if (m) { save(); status.note = 'Your earlier SpeakWell progress was carried over.'; } return ensureVocab(); }
  try { state = sanitize(JSON.parse(raw)); if (status.dropped) { status.recovered = true; status.note = status.dropped + ' damaged history item(s) could not be recovered and were skipped.'; } }
  catch (e) { try { storage.setItem(KEY + '.corrupt', raw); } catch (e2) { /* ignore */ } state = fresh(); status.recovered = true; status.note = 'Your saved data was damaged, so SpeakWell started fresh. A copy of the damaged data was kept in this browser.'; save(); }
  return ensureVocab();
}
function save() {
  if (!storage) return false;
  try { storage.setItem(KEY, JSON.stringify(state)); status.saveFailed = false; return true; }
  catch (e) {
    try { state.attempts = state.attempts.slice(-Math.floor(MAX_ATTEMPTS / 2)); storage.setItem(KEY, JSON.stringify(state)); status.saveFailed = false; return true; }
    catch (e2) { status.saveFailed = true; status.note = 'SpeakWell could not save your progress (browser storage is full or blocked).'; return false; }
  }
}
function reset() { state = fresh(); ensureVocab(); if (storage) { try { storage.removeItem(KEY); storage.removeItem(KEY + '.corrupt'); } catch (e) { /* ignore */ } } save(); return state; }
function exportJSON() { return JSON.stringify({exportedAt:new Date().toISOString(), app:'SpeakWell', data:state}, null, 1); }
function importJSON(text) {
  var j; try { j = JSON.parse(text); } catch (e) { return {ok:false, error:'That file is not valid JSON.'}; }
  var data = j && j.app === 'SpeakWell' && j.data ? j.data : j; if (!data || typeof data !== 'object' || !data.version) return {ok:false, error:'That file does not look like a SpeakWell export.'};
  state = sanitize(data); ensureVocab(); save(); return {ok:true, attempts:state.attempts.length};
}

/* ---------- vocabulary rotation ---------- */
var ACTIVE_N = 6;
function vocabPool(cat) { return C.VOCAB.filter(function (v) { return !state.vocab.learned[v.id] && (!cat || cat === 'all' || v.cat === cat); }); }
function nextPhrase(exclude) {
  var v = state.vocab, ex = {}; (exclude || []).concat(v.active).forEach(function (id) { ex[id] = 1; });
  function pick(cat, avoidRecent) { var p = vocabPool(cat).filter(function (x) { return !ex[x.id] && (!avoidRecent || v.recent.indexOf(x.id) < 0); }); return p.length ? p[Math.floor(SW.rand() * p.length)] : null; }
  if (v.focusCat !== 'all') return pick(v.focusCat, true) || pick(v.focusCat, false); // a chosen category never silently fills from others
  return pick('all', true) || pick('all', false);
}
function pushRecent(id) { var r = state.vocab.recent; var i = r.indexOf(id); if (i >= 0) r.splice(i, 1); r.unshift(id); if (r.length > 40) r.length = 40; }
function ensureVocab() {
  var v = state.vocab; v.active = v.active.filter(function (id) { return !v.learned[id]; });
  while (v.active.length < ACTIVE_N) { var p = nextPhrase(); if (!p) break; v.active.push(p.id); pushRecent(p.id); }
  return state;
}
function replaceActive(id) { // swap/learn: replace in place with a NEW phrase
  var v = state.vocab, i = v.active.indexOf(id); if (i < 0) return null;
  var p = nextPhrase([id]); if (p) { v.active[i] = p.id; pushRecent(p.id); } else v.active.splice(i, 1); pushRecent(id); return p;
}
function learn(id) {
  if (state.vocab.learned[id]) return null; state.vocab.learned[id] = Date.now();
  state.vocab.log.push({id:'vl' + Date.now() + Math.floor(Math.random() * 1000), ts:Date.now(), action:'learned', phraseId:id, text:'', ok:true}); if (state.vocab.log.length > MAX_LOG) state.vocab.log.shift();
  var p = replaceActive(id); save(); return p;
}
function unlearn(id) { delete state.vocab.learned[id]; state.vocab.log = state.vocab.log.filter(function (e) { return !(e.action === 'learned' && e.phraseId === id); }); ensureVocab(); save(); }
function swap(id) { var p = replaceActive(id); save(); return p; }
function setFocusCat(c) { state.vocab.focusCat = (c === 'all' || C.VOCAB_CATS.indexOf(c) >= 0) ? c : 'all'; // refill unlearned active not in category
  if (state.vocab.focusCat !== 'all') { state.vocab.active = state.vocab.active.filter(function (id) { var ph = C.VOCAB.filter(function (x) { return x.id === id; })[0]; return ph && ph.cat === state.vocab.focusCat; }); }
  ensureVocab(); save(); }
function logPractice(id, text, ok) { state.vocab.log.push({id:'vl' + Date.now() + Math.floor(Math.random() * 1000), ts:Date.now(), action:'practised', phraseId:id, text:String(text).slice(0, 1000), ok:!!ok}); if (state.vocab.log.length > MAX_LOG) state.vocab.log.shift(); save(); }
function normPhrase(t) { return String(t).toLowerCase().replace(/[\u2018\u2019]/g, '\'').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function usedPhrase(ph, text) {
  var segs = ph.phrase.split('…').map(normPhrase).filter(function (x) { return x.length > 0; }), t = ' ' + normPhrase(text) + ' ';
  return segs.every(function (sg) { return t.indexOf(' ' + sg + ' ') >= 0; });
}

/* ---------- attempts ---------- */
function uid(p) { return (p || 'a') + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
function addAttempt(a) {
  var c = sanitizeAttempt(a); if (!c) return null; state.attempts.push(c); if (state.attempts.length > MAX_ATTEMPTS) state.attempts.shift();
  var rec = state.recent[c.kind]; var key = c.kind === 'interview' ? (c.meta.qid || c.exerciseId) : c.exerciseId; if (key) { var i = rec.indexOf(key); if (i >= 0) rec.splice(i, 1); rec.unshift(key); if (rec.length > 40) rec.length = 40; }
  var unlocked = checkAchievements(); save(); return {attempt:c, unlocked:unlocked};
}
function noteShown(kind, key) {
  if (!key || !state.recent[kind]) return; var r = state.recent[kind], i = r.indexOf(key); if (i >= 0) r.splice(i, 1); r.unshift(key); if (r.length > 40) r.length = 40; save();
}
function runAttempts(runId) { return state.attempts.filter(function (a) { return a.runId === runId; }).sort(function (x, y) { return x.ts - y.ts || x.attemptNumber - y.attemptNumber; }); }

/* ---------- stats ---------- */
function weekStart(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); var day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.getTime(); }
function summary() {
  var A = state.attempts, n = A.length, sum = 0, best = 0; A.forEach(function (a) { sum += a.overall; if (a.overall > best) best = a.overall; });
  var recent = A.slice(-10), overall = null;
  if (n) { var w = 0, t = 0; recent.slice().reverse().forEach(function (a, i) { var k = Math.pow(0.88, i); t += a.overall * k; w += k; }); overall = Math.round(t / w); }
  var skills = {}; C.SKILLS.forEach(function (s) { var use = A.slice(-12).reverse(), w = 0, t = 0; use.forEach(function (a, i) { var k = Math.pow(0.85, i); t += a.skills[s.id] * k; w += k; }); skills[s.id] = n ? {pct:Math.round(t / w), n:Math.min(n, 12)} : null; });
  var focus = null; if (n >= 3) { var low = null; C.SKILLS.forEach(function (s) { if (low == null || skills[s.id].pct < skills[low].pct) low = s.id; }); focus = low; }
  var trend = null; if (n >= 6) { var a3 = A.slice(-3), p3 = A.slice(-6, -3), av = function (x) { return x.reduce(function (q, r) { return q + r.overall; }, 0) / x.length; }; var d = Math.round(av(a3) - av(p3)); trend = {delta:d, label:d >= 3 ? 'Up ' + d + ' points compared with your previous 3 practices' : (d <= -3 ? 'Down ' + Math.abs(d) + ' points compared with your previous 3 practices' : 'Steady compared with your previous 3 practices')}; }
  var wk = {}; A.forEach(function (a) { var k = weekStart(a.ts); (wk[k] = wk[k] || []).push(a.overall); });
  var weekly = Object.keys(wk).map(Number).sort(function (x, y) { return x - y; }).slice(-8).map(function (k) { var v = wk[k]; return {start:k, avg:Math.round(v.reduce(function (x, y) { return x + y; }, 0) / v.length), n:v.length}; });
  var byKind = {conversation:0, interview:0, writing:0}; A.forEach(function (a) { byKind[a.kind]++; });
  return {sessions:n + state.legacy.sessions, attempts:n, avg:n ? Math.round(sum / n) : null, best:n ? best : null, overall:overall, skills:skills, focus:focus, trend:trend, weekly:weekly, byKind:byKind, learned:Object.keys(state.vocab.learned).length, legacy:state.legacy};
}
function bestImprovement() {
  var runs = {}; state.attempts.forEach(function (a) { (runs[a.runId] = runs[a.runId] || []).push(a); }); var best = 0;
  Object.keys(runs).forEach(function (k) { var r = runs[k].sort(function (x, y) { return x.ts - y.ts; }); for (var i = 1; i < r.length; i++) best = Math.max(best, r[i].overall - r[0].overall); }); return best;
}
function maxRunAttempts() { var runs = {}; state.attempts.forEach(function (a) { runs[a.runId] = (runs[a.runId] || 0) + 1; }); return Object.keys(runs).reduce(function (m, k) { return Math.max(m, runs[k]); }, 0); }
var ACH = [
 {id:'first', label:'First Practice', desc:'Complete your first practice.', test:function (s, st) { return st.sessions >= 1; }},
 {id:'ten', label:'10 Practices', desc:'Complete 10 practices.', test:function (s, st) { return st.sessions >= 10; }},
 {id:'p80', label:'First 80+', desc:'Score 80 or more.', test:function (s, st) { return st.best != null && st.best >= 80; }},
 {id:'p90', label:'First 90+', desc:'Score 90 or more.', test:function (s, st) { return st.best != null && st.best >= 90; }},
 {id:'int5', label:'5 Interview Practices', desc:'Answer 5 interview questions.', test:function (s, st) { return st.byKind.interview >= 5; }},
 {id:'vocab10', label:'10 Phrases Learned', desc:'Mark 10 vocabulary phrases as learned.', test:function (s, st) { return st.learned >= 10; }},
 {id:'imp10', label:'Improved by 10 points', desc:'Improve by 10+ points between attempts at the same exercise.', test:function () { return bestImprovement() >= 10; }},
 {id:'write3', label:'Writing Challenge', desc:'Complete 3 writing exercises.', test:function (s, st) { return st.byKind.writing >= 3; }},
 {id:'persist', label:'Persistence', desc:'Make 3 attempts at one exercise.', test:function () { return maxRunAttempts() >= 3; }},
 {id:'allround', label:'All-rounder', desc:'Practise conversation, interview and writing.', test:function (s, st) { return st.byKind.conversation > 0 && st.byKind.interview > 0 && st.byKind.writing > 0; }}
];
function checkAchievements() {
  var st = summary(), out = []; ACH.forEach(function (a) { if (!state.achievements[a.id] && a.test(state, st)) { state.achievements[a.id] = Date.now(); out.push(a); } }); return out;
}
function setProfile(p) {
  var c = sanitize({profile:p}).profile; state.profile = c; save(); return c;
}
function interestCats() { return C.interestCats(state.profile.interests + ' ' + state.profile.roles.join(' ')); }

SW.store = {KEY:KEY, LEGACY:LEGACY, status:status, load:load, save:save, reset:reset, exportJSON:exportJSON, importJSON:importJSON, sanitize:sanitize, get state() { return state; },
  learn:learn, unlearn:unlearn, swap:swap, setFocusCat:setFocusCat, logPractice:logPractice, usedPhrase:usedPhrase, ensureVocab:ensureVocab, nextPhrase:nextPhrase, ACTIVE_N:ACTIVE_N,
  uid:uid, noteShown:noteShown, addAttempt:addAttempt, runAttempts:runAttempts, summary:summary, ACH:ACH, checkAchievements:checkAchievements, setProfile:setProfile, interestCats:interestCats, weekStart:weekStart, CONF:CONF};
})(typeof window !== 'undefined' ? window : globalThis);
