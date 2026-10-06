/* SpeakWell UI. All content comes from SW.content, scoring from SW.assess, persistence from SW.store. */
(function () {
'use strict';
var SW = window.SW, C = SW.content, A = SW.assess, ST = SW.store, esc = A.esc;
var $ = function (id) { return document.getElementById(id); };
ST.load();

/* ---------- helpers ---------- */
function fmtDate(ts) { try { return new Date(ts).toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'}); } catch (e) { return ''; } }
function shortDate(ts) { try { return new Date(ts).toLocaleDateString('en-GB', {day:'numeric', month:'short'}); } catch (e) { return ''; } }
function wordCount(t) { return (String(t).match(/[A-Za-z0-9']+/g) || []).length; }
function skillLabel(id) { var s = C.SKILLS.filter(function (x) { return x.id === id; })[0]; return s ? s.label : id; }
var KIND_LABEL = {conversation:'Daily Conversation', interview:'Interview', writing:'Writing', vocabulary:'Vocabulary'};
var toastTimer = null;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 4200); }
function announceUnlocked(list) { if (list && list.length) toast('Achievement unlocked: ' + list.map(function (a) { return a.label; }).join(', ')); }
function scoreClass(n) { return n >= 80 ? 'b-high' : (n >= 60 ? 'b-mid' : 'b-low'); }
function currentFocus() { return ST.summary().focus; }
var SKILL_EX_NOTE = {clarity:'Notice how each sentence makes one clear point.', structure:'Notice the order: a clear opening, the main content, then a close.', professionalism:'Notice the polite, calm wording.', vocabulary:'Notice the precise word choices.', specificity:'Notice the concrete details (names, times, numbers, results).', conciseness:'Notice that nothing is padded.', repetition:'Notice how the wording varies.', fillers:'Notice that there are no filler words.', relevance:'Notice how every sentence serves the task.'};
var ISSUE_LABEL = {repetition:'Repetition', complex:'Complicated wording', unclear:'Unclear sentence', casual:'Too casual', vague:'Vague wording', punctuation:'Punctuation', grammar:'Grammar', filler:'Filler words', opening:'Opening', closing:'Closing', tone:'Tone', other:'Note'};

/* ---------- navigation ---------- */
var PAGE_IDS = ['dashboard', 'conversation', 'interview', 'writing', 'vocabulary', 'history', 'profile'];
var sidebar = $('sidebar'), backdrop = $('backdrop'), menuBtn = $('mobileMenu');
function setMenu(open) {
  sidebar.classList.toggle('open', open); backdrop.classList.toggle('show', open); document.body.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
}
function showPage(id, opts) {
  opts = opts || {}; if (PAGE_IDS.indexOf(id) < 0) id = 'dashboard';
  document.querySelectorAll('.page').forEach(function (p) { p.classList.toggle('active', p.id === id); });
  document.querySelectorAll('.nav').forEach(function (b) { var on = b.dataset.page === id; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  setMenu(false);
  if (!opts.fromHash && location.hash !== '#' + id) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// or sandboxed */ } }
  window.scrollTo(0, 0);
  if (id === 'dashboard') renderDashboard(); else if (id === 'history') renderHistory(true); else if (id === 'vocabulary') renderVocab(); else if (id === 'profile') fillProfile();
  else if (id === 'conversation') convPractice.enter(); else if (id === 'writing') wriPractice.enter(); else if (id === 'interview') interview.enter();
  if (!opts.fromHash && !opts.noFocus) { var h = document.querySelector('#' + id + ' h1'); if (h) { try { h.focus({preventScroll:true}); } catch (e) { /* ignore */ } } }
}
document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-page],[data-go]'); if (!t) return; e.preventDefault(); showPage(t.dataset.page || t.dataset.go);
});
menuBtn.addEventListener('click', function () { setMenu(!sidebar.classList.contains('open')); });
backdrop.addEventListener('click', function () { setMenu(false); });
$('closeMenu').addEventListener('click', function () { setMenu(false); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
window.addEventListener('resize', function () { if (window.innerWidth > 700) setMenu(false); });
window.addEventListener('hashchange', function () { showPage(location.hash.slice(1), {fromHash:true}); });

/* ---------- feedback rendering (shared by live feedback and History) ---------- */
function skillBarsHTML(skills) {
  return '<div class="skill-bars">' + C.SKILLS.map(function (s) { var v = skills[s.id]; return '<div class="skill-row"><span>' + s.label + '</span><div class="bar"><i class="' + scoreClass(v) + '" style="width:' + v + '%"></i></div><b>' + v + '/100</b></div>'; }).join('') + '</div>';
}
function listHTML(items, cls) { return '<ul class="' + (cls || '') + '">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }
function issuesHTML(issues, open) {
  if (!issues || !issues.length) return '<p class="tiny">No language issues detected. Nice work.</p>';
  return '<details class="lang"' + (open ? ' open' : '') + '><summary>Language check (' + issues.length + ')</summary><ul class="issues">' + issues.map(function (i) {
    return '<li class="sev' + i.sev + '"><b>' + esc(ISSUE_LABEL[i.type] || 'Note') + '</b>' + (i.excerpt ? ' <q>' + esc(i.excerpt) + '</q>' : '') + '<span class="why">Why: ' + esc(i.why) + '</span>' + (i.fix ? '<span class="fix">Try: ' + esc(i.fix) + '</span>' : '') + '</li>';
  }).join('') + '</ul></details>';
}
function feedbackHTML(att, o) {
  o = o || {}; var run = o.run || [att], idx = run.findIndex(function (x) { return x.id === att.id; }), prev = idx > 0 ? run[idx - 1] : null, f = att.feedback;
  var delta = prev ? att.overall - prev.overall : null;
  var chips = run.length > 1 ? '<div class="attempt-chips">' + run.map(function (x) { return '<span class="achip' + (x.id === att.id ? ' cur' : '') + '">Attempt ' + x.attemptNumber + ': ' + x.overall + '</span>'; }).join('<i>→</i>') + '</div>' : '';
  var h = '<div class="fb-head"><div><small>OVERALL EFFECTIVENESS · ATTEMPT ' + att.attemptNumber + '</small><div class="score">' + att.overall + '<span>/100</span></div></div>' +
    (delta != null ? '<div class="delta ' + (delta > 0 ? 'up' : (delta < 0 ? 'down' : 'flat')) + '">' + (delta > 0 ? '+' : '') + delta + ' vs attempt ' + prev.attemptNumber + '</div>' : '') + '</div>' + chips;
  if (f.compare) h += '<p class="cmp-note">' + esc(f.compare) + '</p>';
  h += '<h4>Skills</h4>' + skillBarsHTML(att.skills);
  h += '<h4>Your response</h4><blockquote class="quote">' + esc(att.response) + '</blockquote>';
  h += '<h4>What worked</h4>' + listHTML(f.strengths, 'good') + '<h4>What could improve</h4>' + listHTML(f.weaknesses, 'warn');
  if (f.biggest) h += '<div class="callout"><b>Biggest improvement area: ' + esc(f.biggest.label) + '</b><p>' + esc(f.biggest.advice) + '</p></div>';
  if (f.advice.length) h += '<h4>For your next attempt</h4>' + listHTML(f.advice, 'next');
  h += issuesHTML(f.issues, att.kind === 'writing');
  if (att.example) {
    h += '<h4>A stronger example</h4><div class="example"><small>ONE POSSIBLE VERSION · USE YOUR OWN WORDS AND REAL EXPERIENCE</small><p>' + esc(att.example).replace(/\n/g, '<br>') + '</p></div>';
    if (att.why && att.why.length) h += '<h5>Why it is stronger</h5>' + listHTML(att.why, 'why-list');
  }
  var meta = []; if (att.meta.hints) meta.push('Help Me Think prompts used: ' + att.meta.hints); if (att.meta.voice) meta.push('Dictated by voice (punctuation was not judged)'); meta.push(f.engine === 'rule-based' || !f.engine ? 'Scored by SpeakWell\'s rule-based assessment (no AI)' : 'Scored by ' + f.engine);
  h += '<p class="tiny meta-line">' + meta.map(esc).join(' · ') + '</p>';
  if (!o.history) {
    h += '<div class="fb-actions"><button type="button" class="cta" data-act="again">↻ Try again</button>';
    if (o.followUp) h += '<button type="button" class="ghost" data-act="followup">Interviewer follow-up →</button>';
    h += '<button type="button" class="ghost" data-act="next">' + esc(o.nextLabel || 'Next →') + '</button></div>';
  }
  return h;
}

/* ---------- practice controller (conversation / interview / writing) ---------- */
function shellHTML(p, o) {
  return '<div class="panel exercise">' + o.top + '<div id="' + p + 'Prompt" class="scenario" aria-live="polite"></div>' +
    '<div class="tools"><button type="button" class="ghost small" id="' + p + 'Help">💡 Help me think</button><button type="button" class="linkbtn" id="' + p + 'Stuck">I\'m stuck, show an example</button></div>' +
    '<div id="' + p + 'Hints" class="hints" aria-live="polite"></div><div id="' + p + 'StuckBox" class="stuckbox" hidden></div>' +
    '<label for="' + p + 'Answer">' + o.answerLabel + '</label><textarea id="' + p + 'Answer" placeholder="' + o.placeholder + '"></textarea>' +
    '<div class="meta-row"><span id="' + p + 'Count" class="tiny">0 words</span>' + (o.voice ? '<button type="button" class="ghost small" id="' + p + 'Voice" aria-pressed="false">🎤 Speak</button>' : '') + (o.proof ? '<button type="button" class="ghost small" id="' + p + 'Proof">Quick proofread</button>' : '') + '</div>' +
    (o.voice ? '<p id="' + p + 'VoiceStatus" class="voice-status" role="status"></p>' : '') +
    '<p id="' + p + 'Error" class="form-error" role="alert"></p><button type="button" class="cta full" id="' + p + 'Submit">' + o.submitLabel + '</button></div>' +
    '<div class="panel feedback" id="' + p + 'Feedback" aria-live="polite">' + o.empty + '</div>';
}
function Practice(cfg) { this.cfg = cfg; this.p = cfg.p; this.ex = null; this.runId = null; this.hintsUsed = 0; this.voiceUsed = false; this.busy = false; this.mounted = false; }
Practice.prototype.el = function (s) { return $(this.p + s); };
Practice.prototype.mount = function () {
  if (this.mounted) return; this.mounted = true; var self = this, p = this.p, cfg = this.cfg;
  $(cfg.mount).innerHTML = shellHTML(p, cfg.shell);
  if (cfg.afterMount) cfg.afterMount(this);
  this.el('Help').addEventListener('click', function () { self.help(); });
  this.el('Stuck').addEventListener('click', function () { self.stuck(); });
  this.el('StuckBox').addEventListener('click', function (e) { var b = e.target.closest('[data-s]'); if (b) self.stuckAction(b.dataset.s); });
  this.el('Answer').addEventListener('input', function () { var n = wordCount(this.value); self.el('Count').textContent = n + ' word' + (n === 1 ? '' : 's'); if (!this.value.trim()) self.voiceUsed = false; self.el('Error').textContent = ''; });
  this.el('Answer').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); self.submit(); } });
  this.el('Submit').addEventListener('click', function () { self.submit(); });
  var fb = this.el('Feedback'); fb.addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (b) self.action(b.dataset.act); });
  if (cfg.shell.proof) this.el('Proof').addEventListener('click', function () { self.quickProof(); });
  if (cfg.shell.voice) setupVoice(this);
};
Practice.prototype.enter = function () { this.mount(); if (!this.ex && this.cfg.autoLoad !== false) this.load(this.cfg.newExercise()); };
Practice.prototype.load = function (ex, runId) {
  this.mount(); this.ex = ex; this.runId = runId || ST.uid('r'); this.hintsUsed = 0; this.voiceUsed = false;
  this.el('Prompt').innerHTML = this.cfg.promptHTML(ex); this.el('Hints').innerHTML = ''; this.el('StuckBox').hidden = true; this.el('StuckBox').innerHTML = '';
  var h = this.el('Help'); h.disabled = false; h.textContent = '💡 Help me think';
  var a = this.el('Answer'); a.value = ''; this.el('Count').textContent = '0 words'; this.el('Error').textContent = '';
  this.el('Feedback').innerHTML = this.cfg.shell.empty; if (!runId && this.cfg.recentKey) { var rk = this.cfg.recentKey(ex); if (rk) ST.noteShown(ex.kind, rk); } if (this.cfg.onLoad) this.cfg.onLoad(ex, this);
};
Practice.prototype.runList = function () { return ST.runAttempts(this.runId); };
Practice.prototype.help = function () {
  var hs = this.ex ? this.ex.hints : []; if (!hs.length) return;
  if (this.hintsUsed >= hs.length) return; this.hintsUsed++;
  var box = this.el('Hints'), shown = hs.slice(0, this.hintsUsed);
  box.innerHTML = '<div class="hint-head">Help Me Think · prompt ' + this.hintsUsed + ' of ' + hs.length + '</div><ol>' + shown.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' + (this.hintsUsed >= hs.length ? '<p class="tiny">That is every prompt. Now write one sentence for each question in your own words.</p>' : '');
  var b = this.el('Help'); if (this.hintsUsed >= hs.length) { b.disabled = true; b.textContent = '💡 No more prompts'; } else b.textContent = '💡 Still stuck? Another prompt';
  this.el('Answer').focus();
};
Practice.prototype.stuck = function () {
  var box = this.el('StuckBox'); if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false; box.innerHTML = '<p>Examples help most <b>after</b> you have tried. “Help me think” gives small prompts so you find your own words first.</p><button type="button" class="ghost small" data-s="show">Show an example anyway</button> <button type="button" class="ghost small" data-s="cancel">Keep trying</button>';
};
Practice.prototype.stuckAction = function (a) {
  var box = this.el('StuckBox'); if (a === 'cancel') { box.hidden = true; this.el('Answer').focus(); return; }
  if (a === 'show') { box.innerHTML = '<div class="example"><small>EXAMPLE ONLY · WRITE YOUR OWN VERSION, DON\'T COPY IT</small><p>' + esc(this.ex.example).replace(/\n/g, '<br>') + '</p></div><button type="button" class="ghost small" data-s="cancel">Hide example</button>'; }
};
Practice.prototype.tone = function () { return this.ex && this.ex.ctx ? this.ex.ctx.tone : 'neutral'; };
Practice.prototype.quickProof = function () {
  var t = this.el('Answer').value.trim(), err = this.el('Error'); err.textContent = '';
  if (wordCount(t) < 3) { err.textContent = 'Write a few words first, then I can proofread them.'; return; }
  var issues = A.proofread(t, {kind:'writing', tone:this.tone(), noEnvelope:this.ex.ctx.noEnvelope, keywords:this.ex.ctx.keywords});
  this.el('Feedback').innerHTML = '<h3>Quick proofread</h3><p class="tiny">Not scored and not saved. Fix what you agree with, then press “' + esc(this.cfg.shell.submitLabel.replace(/ →$/, '')) + '”.</p>' + issuesHTML(issues, true);
};
Practice.prototype.submit = function () {
  var self = this; if (this.busy || !this.ex) return;
  var text = this.el('Answer').value.trim(), err = this.el('Error'); err.textContent = '';
  if (wordCount(text) < 3) { err.textContent = 'Write at least a few words first, then SpeakWell can assess it.'; this.el('Answer').focus(); return; }
  var prev = this.runList(), last = prev[prev.length - 1];
  if (last && last.response.trim() === text) { err.textContent = 'This is identical to your last attempt (' + last.overall + '/100), so it was not counted again. Change something from the advice and try again.'; return; }
  this.busy = true; var btn = this.el('Submit'), label = btn.textContent; btn.disabled = true; btn.textContent = 'Assessing…';
  var ex = this.ex, prof = ST.state.profile, ctx = JSON.parse(JSON.stringify(ex.ctx));
  var sub = {kind:ex.kind, text:text, prompt:ex.prompt, ctx:ctx, voice:this.voiceUsed, confidence:prof.confidence};
  A.run(sub).then(function (res) {
    var cmp = last ? A.compare(last, {overall:res.overall, skills:res.skills, response:text}) : null;
    var why = (res.exampleWhy || ex.why || []).slice(); if (res.biggest) why.push('Compared with your answer: your biggest gap was ' + res.biggest.label.toLowerCase() + '. ' + (SKILL_EX_NOTE[res.biggest.skill] || ''));
    var meta = self.cfg.meta(ex, self); meta.hints = self.hintsUsed; meta.voice = self.voiceUsed;
    var att = {id:ST.uid('a'), runId:self.runId, kind:ex.kind, exerciseId:ex.kind === 'interview' ? ex.qid : ex.id, title:self.cfg.title(ex), subtitle:self.cfg.subtitle(ex), prompt:ex.prompt, response:text, overall:res.overall, skills:res.skills, attemptNumber:prev.length + 1, ts:Date.now(),
      feedback:{strengths:res.strengths, weaknesses:res.weaknesses, biggest:res.biggest, advice:res.advice, issues:res.issues, moves:{hit:res.moves.hit, missed:res.moves.missed}, compare:cmp ? cmp.note : '', engine:res.engine}, example:res.example || ex.example, why:why, meta:meta};
    var out = ST.addAttempt(att);
    if (!out) { err.textContent = 'Something went wrong saving that attempt. Please try again.'; return; }
    self.lastRes = res; self.renderFeedback(out.attempt, res); announceUnlocked(out.unlocked); noteStorage(); renderDashboard();
  }).catch(function (e) { err.textContent = 'Sorry, the assessment failed (' + e.message + '). Please try again.'; })
    .then(function () { self.busy = false; btn.disabled = false; btn.textContent = label; });
};
Practice.prototype.renderFeedback = function (att, res) {
  var o = {run:this.runList(), nextLabel:this.cfg.nextLabel(this), followUp:this.cfg.canFollowUp ? this.cfg.canFollowUp(this.ex) : false};
  var fb = this.el('Feedback'); fb.innerHTML = feedbackHTML(att, o); fb.scrollTop = 0; this.lastAtt = att;
  if (window.innerWidth <= 900) { try { fb.scrollIntoView({behavior:'smooth', block:'start'}); } catch (e) { fb.scrollIntoView(); } }
};
Practice.prototype.tryAgain = function (att) {
  att = att || this.lastAtt || this.runList().slice(-1)[0]; if (!att) return; var run = this.runList(), n = run.length + 1;
  var f = att.feedback, h = '<div class="empty-icon">↻</div><h3>Attempt ' + n + ': rewrite your answer</h3><p>Your previous answer is in the box. Edit it, or start fresh. This attempt will be scored on its own.</p>';
  h += '<div class="attempt-chips">' + run.map(function (x) { return '<span class="achip">Attempt ' + x.attemptNumber + ': ' + x.overall + '</span>'; }).join('<i>→</i>') + '</div>';
  if (f.biggest) h += '<div class="callout"><b>Focus on: ' + esc(f.biggest.label) + '</b><p>' + esc(f.biggest.advice) + '</p></div>';
  if (f.advice.length) h += '<h4>Advice to apply</h4>' + listHTML(f.advice, 'next');
  h += '<button type="button" class="ghost" data-act="fresh">Start with a blank box</button>';
  this.el('Feedback').innerHTML = h; var a = this.el('Answer'); a.value = att.response; a.dispatchEvent(new Event('input')); this.el('StuckBox').hidden = true; a.focus();
};
Practice.prototype.action = function (a) {
  if (a === 'again') this.tryAgain(); else if (a === 'fresh') { var t = this.el('Answer'); t.value = ''; t.dispatchEvent(new Event('input')); t.focus(); }
  else if (a === 'next') this.cfg.onNext(this); else if (a === 'followup') this.cfg.onFollowUp(this);
};

/* ---------- voice (browser speech recognition, optional) ---------- */
function setupVoice(pr) {
  var btn = pr.el('Voice'), st = pr.el('VoiceStatus'), ta = pr.el('Answer'), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var note = 'Optional voice practice: dictate your answer, then edit and submit it. Only the text is saved. Some browsers send audio to their own speech service. Accent is never assessed.';
  st.textContent = note;
  if (!SR) { btn.disabled = true; btn.title = 'Not supported in this browser'; st.textContent = 'Voice practice is not supported in this browser (try Chrome, Edge or Safari). You can still type your answer.'; return; }
  var rec = null, listening = false, base = '', fin = '';
  function reset() { listening = false; btn.textContent = '🎤 Speak'; btn.setAttribute('aria-pressed', 'false'); }
  btn.addEventListener('click', function () {
    if (listening) { try { rec.stop(); } catch (e) { /* ignore */ } return; }
    try { rec = new SR(); } catch (e) { st.textContent = 'Voice input could not start in this browser.'; return; }
    rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = true; base = ta.value.trim(); fin = '';
    rec.onstart = function () { listening = true; btn.textContent = '⏹ Stop'; btn.setAttribute('aria-pressed', 'true'); st.textContent = 'Listening… speak naturally, then press Stop.'; };
    rec.onresult = function (e) { var interim = ''; for (var i = e.resultIndex; i < e.results.length; i++) { var r = e.results[i]; if (r.isFinal) fin += r[0].transcript + ' '; else interim += r[0].transcript; } ta.value = ((base ? base + ' ' : '') + fin + interim).trim(); pr.voiceUsed = true; ta.dispatchEvent(new Event('input')); pr.voiceUsed = true; };
    rec.onerror = function (e) { var m = {'not-allowed':'Microphone permission was blocked. Allow it in your browser settings, or type instead.', 'service-not-allowed':'Speech recognition is not allowed in this browser. Please type instead.', 'no-speech':'No speech was heard. Try again.', 'audio-capture':'No microphone was found.', 'network':'The browser\'s speech service could not be reached. Please type instead.'}; st.textContent = m[e.error] || 'Voice input stopped (' + (e.error || 'unknown') + '). You can type instead.'; reset(); };
    rec.onend = function () { if (listening) { reset(); if (!/blocked|heard|found|reached|allowed|stopped \(/.test(st.textContent)) st.textContent = 'Stopped. Edit the transcript if needed, then submit it for assessment. ' ; } };
    try { rec.start(); } catch (e) { st.textContent = 'Voice input could not start.'; reset(); }
  });
}

/* ---------- Daily Practice ---------- */
function lastCat(kind) { var A_ = ST.state.attempts.filter(function (a) { return a.kind === kind; }); return A_.length ? A_[A_.length - 1].meta.cat : undefined; }
var convPractice = new Practice({p:'conv', mount:'convMount', kind:'conversation', autoLoad:true,
  shell:{top:'<div class="row"><div class="grow"><label for="convCategory">CATEGORY</label><select id="convCategory"></select></div><button type="button" class="ghost small" id="convNew">↻ New scenario</button></div><p class="focus-tag" id="convFocus" hidden></p>', answerLabel:'YOUR RESPONSE', placeholder:'Write what you would naturally say...', submitLabel:'Assess my response →', voice:true,
    empty:'<div class="empty-icon">✦</div><h3>Your feedback will appear here</h3><p>Write your response first. SpeakWell will assess clarity, structure, professionalism, vocabulary, specificity, conciseness, repetition, fillers and relevance, then show a stronger example.</p>'},
  afterMount:function (pr) {
    var sel = $('convCategory'); sel.innerHTML = '<option value="all">Surprise me (all categories)</option>' + C.CATS.map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + '</option>'; }).join('');
    sel.addEventListener('change', function () { pr.load(pr.cfg.newExercise()); }); $('convNew').addEventListener('click', function () { pr.load(pr.cfg.newExercise()); });
  },
  newExercise:function () { var sel = $('convCategory'); return C.buildScenario({category:sel ? sel.value : 'all', recent:ST.state.recent.conversation, focus:currentFocus(), interests:ST.state.profile.interests + ' ' + ST.state.profile.roles.join(' '), lastCat:lastCat('conversation')}); },
  promptHTML:function (ex) { return '<span class="tag">' + esc(ex.catLabel) + '</span> <b>' + esc(ex.title) + '</b><br>' + esc(ex.prompt); },
  onLoad:function (ex) { var f = $('convFocus'); if (ex.focusMatch) { f.hidden = false; f.textContent = 'Chosen to help you practise ' + skillLabel(currentFocus()).toLowerCase() + '.'; } else f.hidden = true; },
  recentKey:function (ex) { return ex.id; }, meta:function (ex) { return {name:ex.name, cat:ex.cat}; }, title:function (ex) { return ex.title; }, subtitle:function (ex) { return ex.catLabel; },
  nextLabel:function () { return 'Next scenario →'; }, onNext:function (pr) { pr.load(pr.cfg.newExercise()); pr.el('Prompt').scrollIntoView({block:'nearest'}); }});

/* ---------- Writing Lab ---------- */
var wriPractice = new Practice({p:'wri', mount:'wriMount', kind:'writing', autoLoad:true,
  shell:{top:'<div class="row"><div class="grow"><label for="wriType">TASK</label><select id="wriType"></select></div><button type="button" class="ghost small" id="wriNew">↻ New prompt</button></div>', answerLabel:'YOUR WRITING', placeholder:'Write your message...', submitLabel:'Proofread & refine →', proof:true,
    empty:'<div class="empty-icon">✎</div><h3>Writing feedback</h3><p>Write your message first. You will get a score, a language check that explains each issue, and a stronger example after your attempt.</p>'},
  afterMount:function (pr) {
    var sel = $('wriType'); sel.innerHTML = '<option value="all">Surprise me (all tasks)</option>' + C.WRITING.map(function (t) { return '<option value="' + t.id + '">' + esc(t.label) + '</option>'; }).join('');
    sel.addEventListener('change', function () { pr.load(pr.cfg.newExercise()); }); $('wriNew').addEventListener('click', function () { pr.load(pr.cfg.newExercise()); });
  },
  newExercise:function () { var sel = $('wriType'); return C.buildWriting({type:sel ? sel.value : 'all', recent:ST.state.recent.writing, focus:currentFocus()}); },
  promptHTML:function (ex) { return '<span class="tag">' + esc(ex.title) + '</span><br>' + esc(ex.prompt); },
  recentKey:function (ex) { return ex.id; }, meta:function (ex) { return {name:ex.name, cat:ex.typeId}; }, title:function (ex) { return ex.title; }, subtitle:function (ex) { var p = ex.prompt; return p.length > 90 ? p.slice(0, 89) + '…' : p; },
  nextLabel:function () { return 'Next prompt →'; }, onNext:function (pr) { pr.load(pr.cfg.newExercise()); }});

/* ---------- Interview Coach ---------- */
var interview = {session:null, practice:null, followed:{}};
interview.practice = new Practice({p:'int', mount:'intMount', kind:'interview', autoLoad:false,
  shell:{top:'<div class="qmeta"><span class="tag" id="intKind"></span><span class="tag fu" id="intFollowTag" hidden>Follow-up</span><button type="button" class="ghost small" id="intNext">Skip to next question →</button></div><details class="star" id="intStar" hidden><summary>Using the STAR method</summary><ul><li><b>Situation</b>: where and when, briefly.</li><li><b>Task</b>: what you needed to do.</li><li><b>Action</b>: what YOU did.</li><li><b>Result</b>: what happened, and what you learned.</li></ul></details>', answerLabel:'YOUR ANSWER', placeholder:'Answer in your own words. Don\'t try to sound perfect.', submitLabel:'Assess my answer →', voice:true,
    empty:'<div class="empty-icon">◎</div><h3>Interview feedback</h3><p>Answer first. You will get feedback on relevance to your role, structure, evidence and professional language, plus a follow-up question and a stronger example.</p>'},
  afterMount:function () { $('intNext').addEventListener('click', function () { interview.next(); }); },
  promptHTML:function (ex) { return esc(ex.prompt); },
  onLoad:function (ex) { var k = {intro:'Opening', motivation:'Motivation', strengths:'Strengths', weakness:'Self-awareness', hire:'Closing', competency:'Competency', situational:'Situational', technical:'Technical', customer:'Customer service', leadership:'Leadership', creative:'Creative', role:'Role-specific', followup:'Follow-up'}; $('intKind').textContent = k[ex.qkind] || 'Question'; $('intFollowTag').hidden = ex.qkind !== 'followup'; $('intStar').hidden = !ex.star; $('intStar').open = false; },
  recentKey:function (ex) { return ex.qkind === 'followup' ? null : ex.qid; }, meta:function (ex) { var s = interview.session || {}; return {role:ex.role, level:ex.level, type:s.type || '', qkind:ex.qkind, qid:ex.qid, sessionId:s.id || '', followUp:ex.qkind === 'followup'}; },
  title:function (ex) { return ex.prompt; }, subtitle:function (ex) { return ex.role + ' interview'; },
  canFollowUp:function (ex) { return ex.qkind !== 'followup'; },
  nextLabel:function () { var s = interview.session; return s && s.i >= s.queue.length - 1 ? 'Finish interview →' : 'Next question →'; },
  onNext:function () { interview.next(); }, onFollowUp:function (pr) { interview.followUp(pr); }});
interview.fillSetup = function () {
  var u = ST.state.ui.interview, roles = ST.state.profile.roles;
  $('intLevel').innerHTML = C.LEVELS.map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join(''); $('intType').innerHTML = C.ITYPES.map(function (t) { return '<option value="' + t[0] + '">' + esc(t[1]) + '</option>'; }).join('');
  if (!$('intRole').value) $('intRole').value = u.role; $('intLevel').value = u.level; $('intType').value = u.type;
  var all = roles.concat(C.SUGGESTED_ROLES.filter(function (r) { return roles.indexOf(r) < 0; }));
  $('intRoleList').innerHTML = all.map(function (r) { return '<option value="' + esc(r) + '">'; }).join('');
  $('intChips').innerHTML = roles.map(function (r) { return '<button type="button" class="chip mine" data-role="' + esc(r) + '">★ ' + esc(r) + '</button>'; }).join('') + C.SUGGESTED_ROLES.filter(function (r) { return roles.indexOf(r) < 0; }).map(function (r) { return '<button type="button" class="chip" data-role="' + esc(r) + '">' + esc(r) + '</button>'; }).join('');
};
interview.enter = function () { this.practice.mount(); if (!$('intLevel').options.length) this.fillSetup(); else { var r = ST.state.profile.roles; if (!$('intChips').querySelector('.mine') && r.length) this.fillSetup(); } };
interview.start = function () {
  var role = $('intRole').value.replace(/\s+/g, ' ').trim(), err = $('intSetupError'); err.textContent = '';
  if (role.length < 2) { err.textContent = 'Please enter the role you are preparing for (for example “Barista” or “Software Engineer”).'; $('intRole').focus(); return; }
  var level = $('intLevel').value, type = $('intType').value;
  ST.state.ui.interview = {role:role, level:level, type:type}; ST.save();
  var queue = C.buildInterview({role:role, level:level, type:type, recent:ST.state.recent.interview, focus:currentFocus()});
  if (!queue.length) { err.textContent = 'Could not build questions for that role. Please try a different wording.'; return; }
  this.session = {id:ST.uid('s'), role:role, level:level, type:type, queue:queue, i:0};
  $('intSetup').hidden = true; $('intSession').hidden = false; $('intSummary').hidden = true; $('intMount').hidden = false; this.go(0);
};
interview.label = function () { var s = this.session; var lv = C.LEVELS.filter(function (l) { return l[0] === s.level; })[0], ty = C.ITYPES.filter(function (t) { return t[0] === s.type; })[0]; $('intRoleLabel').textContent = s.role + ' · ' + (lv ? lv[1] : '') + (ty ? ' · ' + ty[1] : ''); $('intProgress').textContent = 'Question ' + (s.i + 1) + ' of ' + s.queue.length; };
interview.go = function (i) { var s = this.session; s.i = i; this.label(); this.practice.load(s.queue[i]); $('intNext').textContent = i >= s.queue.length - 1 ? 'Finish interview →' : 'Skip to next question →'; };
interview.next = function () { var s = this.session; if (!s) return; if (s.i >= s.queue.length - 1) this.finish(); else this.go(s.i + 1); };
interview.followUp = function (pr) {
  var s = this.session, att = pr.lastAtt, res = pr.lastRes; if (!att) return;
  var info = {missing:((res && res.structure && res.structure.missed) || []).map(function (x) { return x.toLowerCase(); }), relevance:att.skills.relevance};
  var fu = C.makeFollowUp(pr.ex, att.response, info); s.queue.splice(s.i + 1, 0, fu); this.go(s.i + 1);
};
interview.finish = function () {
  var s = this.session, atts = ST.state.attempts.filter(function (a) { return a.meta.sessionId === s.id; }), box = $('intSummary');
  $('intMount').hidden = true; box.hidden = false;
  if (!atts.length) { box.innerHTML = '<h3>Interview finished</h3><p class="body-text">You did not answer any questions this time. Try again whenever you are ready.</p><div class="btn-row"><button type="button" class="cta" data-isum="again">Start a new interview</button><button type="button" class="ghost" data-isum="change">Change role or settings</button></div>'; return; }
  var best = {}; atts.forEach(function (a) { var k = a.meta.qid; if (!best[k] || a.overall > best[k].overall) best[k] = a; });
  var list = Object.keys(best).map(function (k) { return best[k]; }), avg = Math.round(list.reduce(function (t, a) { return t + a.overall; }, 0) / list.length);
  var sk = {}; C.SKILLS.forEach(function (x) { sk[x.id] = Math.round(atts.reduce(function (t, a) { return t + a.skills[x.id]; }, 0) / atts.length); });
  var weak = C.SKILLS.slice().sort(function (x, y) { return sk[x.id] - sk[y.id]; })[0];
  box.innerHTML = '<div class="panel-head"><div><small>INTERVIEW COMPLETE</small><h3>' + esc(s.role) + ' interview summary</h3></div><div class="score sm">' + avg + '<span>/100 average</span></div></div><ul class="sum-list">' + list.map(function (a) { return '<li><span>' + esc(a.title) + '</span><b>' + a.overall + '</b></li>'; }).join('') + '</ul><div class="callout"><b>Weakest skill this interview: ' + esc(weak.label) + ' (' + sk[weak.id] + ')</b><p>' + esc(C.SKILL_TIPS[weak.id]) + '</p></div><div class="btn-row"><button type="button" class="cta" data-isum="again">Start a new interview</button><button type="button" class="ghost" data-isum="change">Change role or settings</button></div>';
  renderDashboard();
};
interview.openSetup = function () { $('intSetup').hidden = false; $('intSession').hidden = true; this.fillSetup(); $('intRole').focus(); };
interview.retry = function (att) { // from History
  var inst = C.rebuildQuestion(att); if (!inst) { toast('That question is no longer available.'); return false; }
  var m = att.meta; this.session = {id:ST.uid('s'), role:inst.role, level:m.level || 'entry', type:m.type || 'general', queue:[inst], i:0};
  $('intSetup').hidden = true; $('intSession').hidden = false; $('intSummary').hidden = true; $('intMount').hidden = false; this.label(); $('intProgress').textContent = 'Retrying one question'; this.practice.load(inst, att.runId); $('intNext').textContent = 'Finish →'; return true;
};
$('intStart').addEventListener('click', function () { interview.start(); });
$('intRole').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); interview.start(); } });
$('intChange').addEventListener('click', function () { interview.openSetup(); });
$('intChips').addEventListener('click', function (e) { var b = e.target.closest('[data-role]'); if (b) { $('intRole').value = b.dataset.role; $('intSetupError').textContent = ''; } });
$('intSummary').addEventListener('click', function (e) { var b = e.target.closest('[data-isum]'); if (!b) return; if (b.dataset.isum === 'again') { $('intRole').value = interview.session.role; interview.start(); } else interview.openSetup(); });

/* ---------- Vocabulary ---------- */
function phraseById(id) { return C.VOCAB.filter(function (v) { return v.id === id; })[0]; }
function renderVocab() {
  var v = ST.state.vocab, sel = $('vocabCat');
  if (!sel.options.length) sel.innerHTML = '<option value="all">All categories</option>' + C.VOCAB_CATS.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
  sel.value = v.focusCat; ST.ensureVocab();
  var learnedN = Object.keys(v.learned).length, left = C.VOCAB.filter(function (x) { return !v.learned[x.id] && (v.focusCat === 'all' || x.cat === v.focusCat); }).length;
  $('vocabMeta').textContent = learnedN + ' of ' + C.VOCAB.length + ' phrases learned · ' + left + ' left ' + (v.focusCat === 'all' ? 'in the bank' : 'in ' + v.focusCat);
  var act = v.active.map(phraseById).filter(Boolean);
  $('vocabList').innerHTML = act.length ? act.map(function (p) {
    return '<article class="vocab-card" data-id="' + p.id + '"><span class="tag">' + esc(p.cat) + '</span><div class="phrase">' + esc(p.phrase) + '</div>' +
      '<p><b>Meaning:</b> ' + esc(p.meaning) + '</p><p class="vex"><b>Example:</b> “' + esc(p.example) + '”</p><p><b>When to use it:</b> ' + esc(p.when) + '</p><p><b>Practice:</b> ' + esc(p.practice) + '</p>' +
      '<details class="try"><summary>Try it in your own sentence</summary><textarea id="vt-' + p.id + '" aria-label="Your sentence using ' + esc(p.phrase) + '" placeholder="Write a sentence using this phrase..."></textarea><button type="button" class="ghost small" data-vact="check">Check my sentence</button><p class="vres" role="status"></p></details>' +
      '<div class="btn-row"><button type="button" class="learn-btn" data-vact="learn">Mark as learned</button><button type="button" class="learn-btn" data-vact="swap">Show a different phrase</button></div></article>';
  }).join('') : '<div class="panel"><b>You have learned every phrase in this category.</b><p class="body-text">Choose another category above, or move a learned phrase back to practice below.</p></div>';
  var ls = Object.keys(v.learned).sort(function (a, b) { return v.learned[b] - v.learned[a]; }).map(phraseById).filter(Boolean);
  $('learnedSummary').textContent = 'Learned phrases (' + ls.length + ')';
  $('learnedList').innerHTML = ls.length ? ls.map(function (p) { return '<div class="learned-row" data-id="' + p.id + '"><div><b>' + esc(p.phrase) + '</b><small>' + esc(p.meaning) + '</small></div><button type="button" class="learn-btn" data-vact="unlearn">Practise again</button></div>'; }).join('') : '<p class="body-text">Nothing yet. Phrases you mark as learned appear here.</p>';
}
$('vocabCat').addEventListener('change', function () { ST.setFocusCat(this.value); renderVocab(); });
$('vocabList').addEventListener('click', function (e) {
  var b = e.target.closest('[data-vact]'); if (!b) return; var card = b.closest('.vocab-card'), id = card.dataset.id, ph = phraseById(id);
  if (b.dataset.vact === 'learn') { var np = ST.learn(id); var u = ST.checkAchievements(); ST.save(); renderVocab(); renderDashboard(); toast(np ? 'Learned! A new phrase has replaced it: ' + np.phrase : 'Learned! No more phrases left to show.'); announceUnlocked(u); }
  else if (b.dataset.vact === 'swap') { ST.swap(id); renderVocab(); }
  else if (b.dataset.vact === 'check') {
    var ta = card.querySelector('textarea'), out = card.querySelector('.vres'), text = ta.value.trim();
    if (wordCount(text) < 5) { out.className = 'vres bad'; out.textContent = 'Write a full sentence (at least 5 words) using the phrase.'; return; }
    var ok = ST.usedPhrase(ph, text); ST.logPractice(id, text, ok);
    if (ok) { var tip = A.proofread(text, {kind:'conversation', tone:'friendly'})[0]; out.className = 'vres good'; out.textContent = '✓ You used the phrase in a full sentence. Nice work.' + (tip ? ' Language tip: ' + tip.why : ''); }
    else { out.className = 'vres bad'; out.textContent = '✗ I could not find “' + ph.phrase.replace(/…/g, '...') + '” in your sentence. Try using it exactly as written.'; }
    var u2 = ST.checkAchievements(); announceUnlocked(u2);
  }
});
$('learnedList').addEventListener('click', function (e) { var b = e.target.closest('[data-vact="unlearn"]'); if (!b) return; ST.unlearn(b.closest('.learned-row').dataset.id); renderVocab(); renderDashboard(); });

/* ---------- History ---------- */
var histFilter = 'all', histShown = 25;
function historyItems() {
  var out = [], runs = {}; ST.state.attempts.forEach(function (a) { (runs[a.runId] = runs[a.runId] || []).push(a); }); Object.keys(runs).forEach(function (k) { runs[k].sort(function (x, y) { return x.ts - y.ts; }); });
  ST.state.attempts.forEach(function (a) { var r = runs[a.runId], i = r.indexOf(a); out.push({type:a.kind, ts:a.ts, att:a, prev:i > 0 ? r[i - 1] : null, run:r.slice(0, i + 1), n:r.length}); });
  ST.state.vocab.log.forEach(function (e) { var p = phraseById(e.phraseId); if (p) out.push({type:'vocabulary', ts:e.ts, ev:e, ph:p}); });
  return out.sort(function (a, b) { return b.ts - a.ts; });
}
function itemHTML(it) {
  var h = '<article class="h-item" data-key="' + (it.att ? it.att.id : it.ev.id) + '"><div class="h-top"><span class="tag">' + KIND_LABEL[it.type] + '</span><span class="h-date">' + fmtDate(it.ts) + '</span></div>';
  if (it.att) {
    var a = it.att, d = it.prev ? a.overall - it.prev.overall : null;
    h += '<div class="h-title">“' + esc(a.title) + '”</div><div class="h-sub">' + esc(a.subtitle) + ' · Attempt ' + a.attemptNumber + (d != null ? ' (' + (d > 0 ? '+' : '') + d + ')' : '') + (a.meta.voice ? ' · voice' : '') + '</div><div class="h-score ' + scoreClass(a.overall) + '">' + a.overall + '<span>/100</span></div>';
    h += '<div class="h-actions"><button type="button" class="ghost small" data-hact="response">View response</button><button type="button" class="ghost small" data-hact="feedback">View feedback</button><button type="button" class="ghost small" data-hact="again">Try again</button></div>';
  } else {
    var e = it.ev; h += '<div class="h-title">“' + esc(it.ph.phrase) + '”</div><div class="h-sub">' + (e.action === 'learned' ? 'Marked as learned' : (e.ok ? 'Practised: used the phrase correctly' : 'Practised: phrase not used yet')) + ' · ' + esc(it.ph.cat) + '</div><div class="h-actions">' + (e.action === 'practised' ? '<button type="button" class="ghost small" data-hact="response">View response</button>' : '') + '<button type="button" class="ghost small" data-hact="phrase">View phrase</button></div>';
  }
  return h + '<div class="h-detail" hidden></div></article>';
}
function renderHistory(reset) {
  if (reset) histShown = 25;
  var items = historyItems().filter(function (i) { return histFilter === 'all' || i.type === histFilter; }), list = $('historyList');
  var legacy = ST.state.legacy; var showLegacy = legacy.sessions > 0 && (histFilter === 'all');
  if (!items.length && !showLegacy) list.innerHTML = '<div class="panel empty-hist"><div class="empty-icon">☰</div><h3>' + (histFilter === 'all' ? 'No practice yet' : 'Nothing here yet') + '</h3><p class="body-text">' + (histFilter === 'all' ? 'Complete a practice and it will appear here with your response, score and feedback.' : 'Complete a ' + (KIND_LABEL[histFilter] || '').toLowerCase() + ' practice and it will appear here.') + '</p></div>';
  else list.innerHTML = items.slice(0, histShown).map(itemHTML).join('') + (showLegacy && items.length <= histShown ? '<article class="h-item legacy"><div class="h-top"><span class="tag">Before the upgrade</span></div><div class="h-title">' + legacy.sessions + ' earlier practice' + (legacy.sessions === 1 ? '' : 's') + '</div><div class="h-sub">Recorded with the older, basic scoring' + (legacy.scores.length ? ' (average ' + Math.round(legacy.scores.reduce(function (a, b) { return a + b; }, 0) / legacy.scores.length) + ')' : '') + '. Responses were not saved, so these count towards your session total but not your skill profile.</div></article>' : '');
  $('historyMore').hidden = items.length <= histShown;
  document.querySelectorAll('#historyFilters .chip').forEach(function (c) { var on = c.dataset.filter === histFilter; c.classList.toggle('active', on); c.setAttribute('aria-pressed', String(on)); });
}
$('historyFilters').addEventListener('click', function (e) { var b = e.target.closest('[data-filter]'); if (!b) return; histFilter = b.dataset.filter; renderHistory(true); });
$('historyMore').addEventListener('click', function () { histShown += 25; renderHistory(false); });
$('historyList').addEventListener('click', function (e) {
  var b = e.target.closest('[data-hact]'); if (!b) return; var card = b.closest('.h-item'), key = card.dataset.key, det = card.querySelector('.h-detail'), kind = b.dataset.hact;
  var att = ST.state.attempts.filter(function (a) { return a.id === key; })[0], ev = ST.state.vocab.log.filter(function (x) { return x.id === key; })[0];
  if (kind === 'again') { restoreAttempt(att); return; }
  if (!det.hidden && det.dataset.mode === kind) { det.hidden = true; det.dataset.mode = ''; b.setAttribute('aria-expanded', 'false'); return; }
  det.hidden = false; det.dataset.mode = kind; card.querySelectorAll('[data-hact]').forEach(function (x) { x.setAttribute('aria-expanded', String(x === b)); });
  if (kind === 'response') det.innerHTML = '<h4>' + (att ? 'Question / prompt' : 'Your sentence') + '</h4>' + (att ? '<p class="body-text">' + esc(att.prompt) + '</p><h4>Your response</h4><blockquote class="quote">' + esc(att.response) + '</blockquote>' : '<blockquote class="quote">' + esc(ev.text) + '</blockquote>');
  else if (kind === 'feedback') { var run = ST.runAttempts(att.runId), upto = run.slice(0, run.findIndex(function (x) { return x.id === att.id; }) + 1); det.innerHTML = feedbackHTML(att, {history:true, run:upto}); }
  else if (kind === 'phrase') { var p = phraseById(ev.phraseId); det.innerHTML = '<p class="body-text"><b>Meaning:</b> ' + esc(p.meaning) + '</p><p class="body-text"><b>Example:</b> “' + esc(p.example) + '”</p><p class="body-text"><b>When to use it:</b> ' + esc(p.when) + '</p>'; }
});
function restoreAttempt(att) {
  if (!att) return; var m = att.meta;
  if (att.kind === 'conversation') { var ex = C.rebuildScenario(att.exerciseId, m.name); if (!ex) { toast('That scenario is no longer available.'); return; } showPage('conversation'); convPractice.mount(); $('convCategory').value = 'all'; convPractice.load(ex, att.runId); convPractice.tryAgain(ST.runAttempts(att.runId).slice(-1)[0]); }
  else if (att.kind === 'writing') { var wx = C.rebuildWriting(att.exerciseId, m.name); if (!wx) { toast('That writing task is no longer available.'); return; } showPage('writing'); wriPractice.mount(); $('wriType').value = 'all'; wriPractice.load(wx, att.runId); wriPractice.tryAgain(ST.runAttempts(att.runId).slice(-1)[0]); }
  else { showPage('interview'); interview.enter(); if (interview.retry(att)) interview.practice.tryAgain(ST.runAttempts(att.runId).slice(-1)[0]); }
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  var st = ST.summary(), s = ST.state, name = s.profile.name;
  $('overallScore').textContent = st.overall == null ? '–' : st.overall; $('sessions').textContent = st.sessions; $('averageScore').textContent = st.avg == null ? '–' : st.avg; $('bestScore').textContent = st.best == null ? '–' : st.best; $('wordsLearned').textContent = st.learned;
  var wl = $('welcomeLine'); wl.textContent = (name ? 'Welcome back, ' + name + '. ' : '') + (s.profile.goals ? 'Your goal: ' + s.profile.goals : 'Practise the conversations, interviews and professional writing situations you actually face.');
  var sb = $('skillBars');
  if (!st.attempts) { sb.innerHTML = ''; $('focusBox').innerHTML = 'Complete 3 practices and SpeakWell will identify your current focus. <b>' + 0 + ' of 3</b> done.'; $('profileBasis').textContent = 'No practice yet'; }
  else {
    sb.innerHTML = C.SKILLS.map(function (k) { var v = st.skills[k.id].pct; return '<div class="skill-row"><span>' + k.label + '</span><div class="bar"><i class="' + scoreClass(v) + '" style="width:' + v + '%"></i></div><b>' + v + '%</b></div>'; }).join('');
    $('profileBasis').textContent = st.attempts < 5 ? 'Early estimate · ' + st.attempts + ' practice' + (st.attempts === 1 ? '' : 's') : 'Based on your last ' + Math.min(12, st.attempts) + ' practices';
    $('focusBox').innerHTML = st.focus ? '<small class="fl">CURRENT FOCUS</small><div class="focus-name">' + esc(skillLabel(st.focus)) + '</div><p>' + esc(C.SKILL_TIPS[st.focus]) + '</p><button type="button" class="ghost small" data-go="conversation">Practise it now →</button>' : 'Complete ' + (3 - st.attempts) + ' more practice' + (3 - st.attempts === 1 ? '' : 's') + ' and SpeakWell will identify your current focus. <b>' + st.attempts + ' of 3</b> done.';
  }
  $('trendNote').textContent = st.trend ? st.trend.label : (st.attempts < 6 ? 'A trend appears after 6 practices' : '');
  var ch = $('progressChart');
  if (!st.weekly.length) { ch.innerHTML = '<p class="body-text">No practice recorded yet. Your weekly averages will appear here, based only on your real attempts.</p>'; ch.setAttribute('aria-label', 'No chart data yet'); }
  else { ch.innerHTML = '<div class="bars">' + st.weekly.map(function (w) { return '<div class="col" title="' + w.n + ' attempt' + (w.n === 1 ? '' : 's') + '"><b>' + w.avg + '</b><div class="colbar"><i class="' + scoreClass(w.avg) + '" style="height:' + w.avg + '%"></i></div><span>Wk of ' + shortDate(w.start) + '</span><em>' + w.n + ' ×</em></div>'; }).join('') + '</div>' + (st.weekly.length < 2 ? '<p class="tiny">One week recorded so far. Keep practising to see how your score changes over time.</p>' : ''); ch.setAttribute('aria-label', 'Weekly average scores: ' + st.weekly.map(function (w) { return 'week of ' + shortDate(w.start) + ', ' + w.avg + ' from ' + w.n + ' attempts'; }).join('; ')); }
  var recent = historyItems().slice(0, 5);
  $('recentList').innerHTML = recent.length ? recent.map(function (it) { return '<button type="button" class="recent-row" data-page="history"><span class="tag">' + KIND_LABEL[it.type] + '</span><span class="rt">' + esc(it.att ? it.att.title : it.ph.phrase) + '</span><b>' + (it.att ? it.att.overall + '/100' : (it.ev.action === 'learned' ? 'learned' : 'practised')) + '</b></button>'; }).join('') : '<p class="body-text">Nothing yet. Start a practice and your latest activity will show up here.</p>';
  var un = 0; $('achievements').innerHTML = ST.ACH.map(function (a) { var t = s.achievements[a.id]; if (t) un++; return '<div class="ach' + (t ? ' on' : '') + '"><span>' + (t ? '✓' : '○') + '</span><div><b>' + esc(a.label) + '</b><small>' + (t ? 'Unlocked ' + shortDate(t) : esc(a.desc)) + '</small></div></div>'; }).join(''); $('achCount').textContent = un + ' of ' + ST.ACH.length + ' unlocked';
}

/* ---------- Profile / data ---------- */
function fillProfile() { var p = ST.state.profile; $('pfName').value = p.name; $('pfInterests').value = p.interests; $('pfRoles').value = p.roles.join(', '); $('pfGoals').value = p.goals; $('pfConfidence').value = p.confidence; $('pfSaved').textContent = ''; $('dataMsg').textContent = ''; $('resetConfirm').hidden = true;
  $('engineStatus').textContent = A.activeProvider() === 'rule' ? 'Assessment engine: rule-based. It runs entirely in your browser: no AI, no accounts, nothing is sent anywhere.' : 'An external assessment provider is active. If it fails, SpeakWell falls back to the built-in rule-based assessment.'; }
$('pfSave').addEventListener('click', function () {
  ST.setProfile({name:$('pfName').value.trim(), interests:$('pfInterests').value.trim(), roles:$('pfRoles').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 8), goals:$('pfGoals').value.trim(), confidence:$('pfConfidence').value});
  $('pfSaved').textContent = 'Saved on this device.'; fillProfile(); $('pfSaved').textContent = 'Saved on this device.'; interview.fillSetup(); renderDashboard(); noteStorage();
});
$('exportBtn').addEventListener('click', function () {
  try { var blob = new Blob([ST.exportJSON()], {type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'speakwell-export-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1500); $('dataMsg').textContent = 'Export created.'; }
  catch (e) { $('dataMsg').textContent = 'Sorry, the export could not be created in this browser.'; }
});
$('importFile').addEventListener('change', function () {
  var f = this.files && this.files[0], input = this; if (!f) return; var r = new FileReader();
  r.onload = function () { var res = ST.importJSON(String(r.result)); $('dataMsg').className = res.ok ? 'form-ok' : 'form-error'; $('dataMsg').textContent = res.ok ? 'Imported ' + res.attempts + ' attempt(s). Your data has been replaced with the file contents.' : res.error; if (res.ok) { renderDashboard(); fillProfile(); $('dataMsg').textContent = 'Imported ' + res.attempts + ' attempt(s). Your data has been replaced with the file contents.'; for (var k in {conversation:1, writing:1}) {} convPractice.ex = null; wriPractice.ex = null; interview.session = null; } input.value = ''; };
  r.onerror = function () { $('dataMsg').className = 'form-error'; $('dataMsg').textContent = 'That file could not be read.'; }; r.readAsText(f);
});
$('resetBtn').addEventListener('click', function () { $('resetConfirm').hidden = false; $('resetYes').focus(); });
$('resetNo').addEventListener('click', function () { $('resetConfirm').hidden = true; });
$('resetYes').addEventListener('click', function () { ST.reset(); $('resetConfirm').hidden = true; $('dataMsg').className = 'form-ok'; $('dataMsg').textContent = 'All data was deleted.'; convPractice.ex = null; wriPractice.ex = null; interview.session = null; $('intRole').value = ''; fillProfile(); $('dataMsg').textContent = 'All data was deleted.'; renderDashboard(); });

/* ---------- storage notice ---------- */
function noteStorage() {
  var n = $('storageNotice'), s = ST.status; var msg = (s.memoryOnly || s.saveFailed || s.recovered || s.migrated) ? s.note : '';
  if (!msg || n.dataset.dismissed === msg) { n.hidden = true; return; }
  n.hidden = false; n.innerHTML = '<span></span><button type="button" class="ghost small" aria-label="Dismiss notice">Dismiss</button>'; n.firstChild.textContent = msg;
  n.querySelector('button').onclick = function () { n.dataset.dismissed = msg; n.hidden = true; };
}

/* init */
noteStorage(); renderDashboard(); showPage(location.hash.slice(1), {fromHash:true});
SW.app = {showPage:showPage, convPractice:convPractice, wriPractice:wriPractice, interview:interview, renderDashboard:renderDashboard, renderHistory:renderHistory, renderVocab:renderVocab};
})();
