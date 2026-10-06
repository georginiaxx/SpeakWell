/* SpeakWell assessment engine.
   - analyse()/proofread(): transparent text analysis (no AI).
   - ruleBasedAssessment(): the current engine. Fully deterministic: same text -> same result, different text -> different result.
   - aiAssessment(): optional adapter that POSTs to YOUR OWN backend endpoint (never put an API key in this file).
   - SW.assess.run(): picks the active provider, validates its output and falls back to rule-based. */
(function (root) {
'use strict';
var SW = root.SW = root.SW || {}, C = SW.content;
var VERSION = 'rule-based-1';
function clamp(n, a, b) { n = Math.round(n); return Math.max(a == null ? 0 : a, Math.min(b == null ? 100 : b, n)); }
function norm(t) { return String(t || '').replace(/[\u2018\u2019]/g, '\'').replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...'); }
var STOP = {}; 'the a an and or but if then so of to in on at for with from by as is are was were be been being it its this that these those i you he she we they me my your our their his her them us do does did have has had will would could should can may might not no yes very really just also about into over after before than there here what when where who which how why all any some more most other such only own same too'.split(' ').forEach(function (w) { STOP[w] = 1; });
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]; }); }

function analyse(raw, opts) {
  opts = opts || {}; var text = norm(raw).trim();
  var words = (text.match(/[A-Za-z0-9]+(?:'[A-Za-z]+)?/g) || []), lower = words.map(function (w) { return w.toLowerCase(); });
  var sentences = text.replace(/([.!?]+)(\s+)/g, '$1\u0001').split(/\u0001|\n+/).map(function (s) { return s.trim(); }).filter(function (s) { return /[A-Za-z0-9]/.test(s); });
  var content = lower.filter(function (w) { return !STOP[w] && w.length > 2; });
  var avg = sentences.length ? words.length / sentences.length : 0;
  return {text:text, words:words, lower:lower, wc:words.length, sentences:sentences, sc:sentences.length, avgLen:avg, content:content, voice:!!opts.voice};
}
function snippet(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > (n || 60) ? s.slice(0, (n || 60) - 1) + '…' : s; }
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function countRe(re, t) { var m = t.match(re); return m ? m.length : 0; }

/* ---------- word lists ---------- */
var CASUAL = {gonna:'going to',wanna:'want to',gotta:'have to',kinda:'somewhat',sorta:'somewhat',yeah:'yes',yep:'yes',nope:'no',nah:'no',dunno:'I don\'t know',lemme:'let me',gimme:'give me',cuz:'because',cos:'because',thx:'thanks',pls:'please',plz:'please',u:'you',ur:'your',lol:'(leave out)',omg:'(leave out)',btw:'by the way',bruh:'(leave out)',guys:'everyone',mate:'(use their name)',stuff:'(name the things)',"ain't":'isn\'t / aren\'t',loads:'many',tbh:'honestly',idk:'I don\'t know'};
var INFLATED = [[/\butili[sz]e[sd]?\b/i,'use'],[/\bcommence[sd]?\b/i,'start'],[/\bendeavou?r\b/i,'try'],[/\bascertain\b/i,'find out'],[/\baforementioned\b/i,'(name the thing)'],[/\bin order to\b/i,'to'],[/\bdue to the fact that\b/i,'because'],[/\bat this point in time\b/i,'now'],[/\bprior to\b/i,'before'],[/\ba large number of\b/i,'many'],[/\bin the event that\b/i,'if'],[/\bfor the purpose of\b/i,'to / for'],[/\bis able to\b/i,'can'],[/\bhas the ability to\b/i,'can'],[/\bfacilitate\b/i,'help'],[/\bleverage\b/i,'use'],[/\bsynerg(y|ies)\b/i,'(say what you mean)']];
var VAGUE = ['something','stuff','things','thing','a lot of','lots of','nice','good','bad','some people','various','etc','and so on','kind of','sort of','somehow','whatever','anything'];
var FILLERS = [[/\b(um|uh|er|erm|hmm)\b/gi,1,'um/uh'],[/\byou know\b/gi,1,'you know'],[/\bi mean\b/gi,1,'I mean'],[/\b(kind of|sort of|kinda|sorta)\b/gi,1,'kind of / sort of'],[/\bbasically\b/gi,1,'basically'],[/\bliterally\b/gi,1,'literally'],[/\bactually\b/gi,.7,'actually'],[/\bhonestly\b/gi,.7,'honestly'],[/\bobviously\b/gi,.7,'obviously'],[/\bto be honest\b/gi,1,'to be honest'],[/\bat the end of the day\b/gi,1,'at the end of the day'],[/\b(stuff like that|and stuff|or whatever|and things like that)\b/gi,1,'and stuff / or whatever'],[/\bi (guess|suppose)\b/gi,.7,'I guess'],[/\bif that makes sense\b/gi,1,'if that makes sense'],[/\bso yeah\b|\byeah\b/gi,.8,'yeah'],[/,\s*like\b|\blike\s*,|\b(was|were|is|it's|i'm|im) like\b/gi,1,'like'],[/\bjust\b/gi,.4,'just'],[/\breally\b/gi,.4,'really'],[/\bvery\b/gi,.4,'very']];
var PADDING = [/\bin order to\b/i,/\bdue to the fact that\b/i,/\bat the end of the day\b/i,/\bat this point in time\b/i,/\bthe fact that\b/i,/\bit is important to note that\b/i,/\bas a matter of fact\b/i,/\bin my personal opinion\b/i,/\bfor all intents and purposes\b/i,/\bI would just like to say that\b/i];
var PRO = [/\bi would be happy to\b|\bi'd be happy to\b/i,/\bappreciate\b/i,/\bi understand\b/i,/\bfrom my perspective\b/i,/\bin particular\b/i,/\bas a result\b/i,/\bspecifically\b/i,/\bcollaborat/i,/\bprioriti[sz]/i,/\bdeadline\b/i,/\bfeedback\b/i,/\bresponsib/i,/\binitiative\b/i,/\bapproach\b/i,/\bstrateg/i,/\bimprov/i,/\bcommunicat/i,/\bevaluat/i,/\bhowever\b/i,/\btherefore\b/i,/\bfor example\b|\bfor instance\b/i,/\bI would like to\b/i,/\bkind regards\b/i,/\bthank you for\b/i,/\bI look forward\b/i,/\bunfortunately\b/i];
var WEAK = ['good','nice','bad','thing','things','stuff','got','get','lot','big','okay','ok','basically'];
var SLANG_STRONG = ['lol','bruh','omg','tbh','idk','thx','pls','plz','u','ur','gonna','wanna','gotta','dunno','ain\'t'];
var RUDE = /\b(shut up|stupid|idiot|whatever|not my problem|your fault|i don'?t care|ridiculous|unacceptable|you never|you always|i demand|as i (already )?said|i already told you)\b/gi;
var POLITE = /\b(please|thank you|thanks|appreciate|would you|could you|would it be possible|happy to|i understand|kind regards|best wishes|i'?d be glad|i'?d be happy|grateful|i apologi[sz]e|sorry)\b/gi;
var SWEAR = /\b(damn|hell|crap|shit|fuck\w*|bloody|bastard|piss\w*)\b/i;
var HEDGE = /\b(maybe|perhaps|i guess|possibly|probably|i think maybe|sort of|kind of)\b/gi;
var CONN = /\b(because|so that|therefore|however|for example|for instance|as a result|first|firstly|second|then|next|after that|finally|also|in addition|although|but|which meant|while|since)\b/gi;

/* ---------- proofreader ---------- */
function proofread(raw, opts) {
  opts = opts || {}; var a = opts.analysis || analyse(raw, opts), t = a.text, tl = t.toLowerCase(), kind = opts.kind || 'writing', tone = opts.tone || 'neutral', voice = !!opts.voice;
  var issues = [], seen = {};
  function add(type, sev, excerpt, why, fix, key) { key = key || (type + excerpt); if (seen[key]) return; seen[key] = 1; issues.push({type:type, sev:sev, excerpt:snippet(excerpt, 70), why:why, fix:fix}); }
  var wc = a.wc;
  // repetition
  var m, re = /\b([a-z']+)\s+\1\b/gi;
  while ((m = re.exec(t))) if (['had', 'that'].indexOf(m[1].toLowerCase()) < 0) add('repetition', 2, m[0], 'A word appears twice in a row. This is usually a typing slip and distracts the reader.', 'Delete one "' + m[1] + '".');
  var freq = {}; a.content.forEach(function (w) { freq[w] = (freq[w] || 0) + 1; });
  var thr = wc < 80 ? 3 : 4, rep = Object.keys(freq).filter(function (w) { return freq[w] >= thr && (!opts.keywords || opts.keywords.indexOf(w) < 0 || freq[w] >= thr + 2); }).sort(function (x, y) { return freq[y] - freq[x]; }).slice(0, 2);
  rep.forEach(function (w) { add('repetition', freq[w] >= 5 ? 2 : 1, '"' + w + '" used ' + freq[w] + ' times', 'Repeating the same word makes writing feel flat and can hide your other points.', 'Use a pronoun ("it", "they") or a different word in some places, or restructure the sentence.'); });
  if (!voice) {
    var starts = {}; a.sentences.forEach(function (s) { var f = (s.match(/^[A-Za-z']+/) || [''])[0].toLowerCase(); if (f) starts[f] = (starts[f] || 0) + 1; });
    Object.keys(starts).forEach(function (f) { if (a.sc >= 4 && starts[f] >= 3 && starts[f] / a.sc >= 0.4 && f !== 'the') add('repetition', 1, starts[f] + ' sentences start with "' + f + '"', 'Starting many sentences the same way sounds repetitive and robotic.', 'Vary your openings or join two short sentences with "and", "because" or "so".'); });
  }
  // long / complicated sentences
  a.sentences.forEach(function (s) {
    var n = (s.match(/[A-Za-z0-9']+/g) || []).length;
    if (!voice && n > 32) add('complex', 2, s, 'This sentence has ' + n + ' words. Very long sentences are hard to follow because the reader has to hold too much in mind.', 'Split it at a natural break (often at "and", "but" or "because") so each sentence has one main point.');
    else if (!voice && (countRe(/\band\b/gi, s) >= 4 || countRe(/,/g, s) >= 6)) add('unclear', 1, s, 'This sentence chains many ideas together, which can read as a run-on.', 'Pick the main point and move the rest into separate sentences.');
  });
  // casual
  var casualOK = (tone === 'friendly' && kind !== 'writing');
  Object.keys(CASUAL).forEach(function (w) {
    var r = new RegExp('(^|[^A-Za-z\'])' + escRe(w) + '(?![A-Za-z\'])', 'i'), mm = t.match(r);
    if (!mm) return;
    if (casualOK && SLANG_STRONG.indexOf(w) < 0) return;
    if (casualOK && ['gonna', 'wanna', 'gotta', 'dunno', 'ain\'t', 'u', 'ur'].indexOf(w) >= 0) return;
    add('casual', 2, mm[0].trim(), 'Casual or text-speak words can sound unprofessional when you do not know the reader well.', 'Try "' + CASUAL[w] + '" instead.', 'casual' + w);
  });
  if (!casualOK && /^\s*(hey|yo)\b/i.test(t)) add('casual', 1, t.split(/\s/)[0], '"Hey" is quite casual for a professional message.', 'Start with "Hello" or "Hi" plus their name.');
  if (!casualOK && /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|:\)|:\(|:D/u.test(t)) add('casual', 1, 'emoji or emoticon', 'Emojis can feel too informal in professional communication.', 'Express the tone with words instead.');
  var caps = t.match(/\b[A-Z]{5,}\b/g); if (caps && caps.length) add('tone', 1, caps[0], 'Words in capitals can look like shouting.', 'Use normal capitalisation and choose a stronger word if you need emphasis.');
  // inflated
  INFLATED.forEach(function (p) { var mm = t.match(p[0]); if (mm) add('complex', 1, mm[0], 'This is more formal or wordy than it needs to be. Plain words are quicker to read.', 'Try "' + p[1] + '".', 'inf' + p[1]); });
  // vague
  var vagueFound = 0;
  VAGUE.forEach(function (w) { if (vagueFound >= 3) return; var mm = t.match(new RegExp('(^|[^A-Za-z])(' + escRe(w) + ')(?![A-Za-z])', 'i')); if (mm) { vagueFound++; add('vague', 1, mm[2], '"' + mm[2] + '" does not tell the reader exactly what you mean.', 'Replace it with the specific thing, number or detail.', 'vag' + w); } });
  // fillers (aggregate)
  var fl = fillerStats(t); if (fl.total >= 1) add('filler', fl.total >= 3 ? 2 : 1, fl.list.map(function (x) { return x[0] + (x[1] > 1 ? ' x' + x[1] : ''); }).join(', '), 'Filler words add length but no meaning, and can make you sound unsure.', 'Cut them, or pause briefly instead.', 'fillers');
  if (!voice) {
    // punctuation
    if (/[A-Za-z0-9)"']$/.test(t) && a.sc >= 1) add('punctuation', 1, t.slice(-25), 'The last sentence has no closing punctuation.', 'End with a full stop (or question mark).', 'endp');
    a.sentences.forEach(function (s) { if (/^[a-z]/.test(s)) add('punctuation', 1, s, 'A sentence should begin with a capital letter.', 'Capitalise the first word.', 'lc' + s.slice(0, 12)); });
    if (/(^|[^A-Za-z.])i(?=[\s,.!?']|$)/.test(t.replace(/\bi\.e\./g, ''))) add('punctuation', 1, 'i', 'The pronoun "I" is always a capital letter.', 'Change "i" to "I".', 'lci');
    if (/[^\n ] {2,}\S/.test(t)) add('punctuation', 1, 'double space', 'Extra spaces look untidy.', 'Use a single space.', 'dsp');
    if (/\S [,.!?;:]/.test(t)) add('punctuation', 1, t.match(/\S [,.!?;:]/)[0], 'There should be no space before punctuation.', 'Remove the space.', 'sp-p');
    if (/[a-z][,][A-Za-z]|[a-z][.!?][A-Z]/.test(t) && !/\b[a-z]+\.[a-z]{2,}\b/i.test(t.replace(/[a-z]\.[A-Z]/g, ''))) add('punctuation', 1, (t.match(/[a-z][,][A-Za-z]|[a-z][.!?][A-Z]/) || [''])[0], 'Punctuation should be followed by a space.', 'Add a space after the comma or full stop.', 'nosp');
    if (/[!?]{2,}/.test(t)) add('tone', 1, t.match(/[!?]{2,}/)[0], 'Repeated exclamation or question marks look over-excited or aggressive.', 'One is enough.', 'multi!');
    else if (tone !== 'friendly' && countRe(/!/g, t) > 2) add('tone', 1, '!', 'Several exclamation marks can feel unprofessional in formal messages.', 'Keep them for one or two moments at most.', 'many!');
    var apos = {dont:'don\'t',cant:'can\'t',wont:'won\'t',didnt:'didn\'t',doesnt:'doesn\'t',isnt:'isn\'t',wasnt:'wasn\'t',couldnt:'couldn\'t',wouldnt:'wouldn\'t',shouldnt:'shouldn\'t',im:'I\'m',ive:'I\'ve',youre:'you\'re',theyre:'they\'re',thats:'that\'s',whats:'what\'s',hasnt:'hasn\'t',havent:'haven\'t',arent:'aren\'t'};
    Object.keys(apos).forEach(function (w) { var mm = t.match(new RegExp('(^|[^A-Za-z\'])(' + w + ')(?![A-Za-z\'])', 'i')); if (mm) add('punctuation', 1, mm[2], 'The apostrophe is missing.', 'Write "' + apos[w] + '".', 'ap' + w); });
    if (kind === 'writing' && /^(hi|hello|dear|hey)\s+[A-Za-z]+\s*\n/i.test(t)) add('punctuation', 1, t.split('\n')[0], 'A greeting is usually followed by a comma.', 'Add a comma after the name.', 'gcomma');
  }
  // grammar
  var ga = /\ba\s+([aeiou][a-z]*)/gi;
  while ((m = ga.exec(t))) if (!/^(uni|use|usu|eur|one|once|uti|uk)/i.test(m[1])) add('grammar', 1, m[0], 'Use "an" before a vowel sound.', '"an ' + m[1] + '".', 'a' + m[1]);
  var gb = /\ban\s+([bcdfgjklmnpqrstvwxz][a-z]*)/g;
  while ((m = gb.exec(t))) if (!/^(hour|honest|honou?r|heir)/i.test(m[1])) add('grammar', 1, m[0], 'Use "a" before a consonant sound.', '"a ' + m[1] + '".', 'an' + m[1]);
  [[/\b(could|should|would|might|must) of\b/i,'"could of / should of / would of" should be "could have / should have / would have".','Replace "of" with "have".'],
   [/\byour welcome\b/i,'"Your" shows ownership. "You\'re" means "you are".','Write "you\'re welcome".'],
   [/\btheir (is|are)\b/i,'"Their" shows ownership; "there" is used with "is/are".','Write "there is/are".'],
   [/\balot\b/i,'"A lot" is two words.','Write "a lot".'],
   [/\b(i|we|they) (is)\b|\b(we|they|you) was\b|\b(he|she|it) (don't|are)\b/i,'The verb does not agree with the subject.','Check the verb form (for example "we were", "he doesn\'t").'],
   [/\b(more|most) (better|best|easier|bigger|faster)\b/i,'Comparatives should not have "more" plus an "-er" word.','Use one form only ("better", not "more better").'],
   [/\b(more|less|better|worse|bigger|rather|other) then\b/i,'"Than" is used for comparisons; "then" is about time.','Use "than".'],
   [/\bto much\b/i,'"Too much" with two o\'s means "excessive".','Write "too much".'],
   [/\bdon't have no\b|\bcan't (get|do) no\b/i,'This is a double negative.','Use "don\'t have any".']
  ].forEach(function (g) { var mm = t.match(g[0]); if (mm) add('grammar', 2, mm[0], g[1], g[2], 'g' + g[2]); });
  if (!voice && /^me and\b/i.test(t.split(/[.!?\n]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(-1)[0] || '') ) { /* placeholder */ }
  var meAnd = t.match(/(^|[.!?]\s+)me and (my|a|the|\w+)\b[^.!?]*/i); if (meAnd) add('grammar', 1, meAnd[0].trim(), 'As the subject of a sentence, it is more standard to write "X and I".', 'Try "My friend and I...".', 'meand');
  // weak openings / closings
  if (!voice) {
    var first = a.sentences[0] || ''; if (/^(so|um|uh|well|basically|like|yeah|ok(ay)?)[,\s]/i.test(first)) add('opening', 1, first.split(' ').slice(0, 4).join(' '), 'Starting with a filler word weakens your opening.', 'Begin with your actual point or a greeting.', 'weakopen');
    var last = a.sentences[a.sc - 1] || ''; if (/(hope (that|this) makes sense|if that'?s (ok|okay|alright)|no worries if not|sorry (for|to) (bother|waste)|whatever)/i.test(last)) add('closing', 1, last, 'Ending on doubt or an apology weakens an otherwise confident message.', 'End with a clear request, next step or thank-you.', 'weakclose');
    if (kind === 'writing' && !opts.noEnvelope) {
      if (!C.MOVES.greet[1].test(t.slice(0, 40))) add('opening', 2, t.slice(0, 40), 'There is no greeting, so the message may feel abrupt.', 'Start with "Hi Name," or "Dear Name,".', 'nogreet');
      if (!C.MOVES.signoff[1].test(t.slice(-80))) add('closing', 2, t.slice(-40), 'There is no sign-off, so the message just stops.', 'Finish with "Kind regards," (or similar) and your name.', 'nosign');
    }
  }
  if (/\bi just wanted to\b/i.test(t)) add('opening', 1, 'I just wanted to', '"Just" can make you sound unsure about asking.', 'Say "I\'d like to..." or "I\'m writing to...".', 'justwanted');
  // tone
  if (tone !== 'friendly') { var rude = t.match(RUDE); if (rude) add('tone', 2, rude[0], 'This can sound blunt or accusatory, which may make the reader defensive.', 'Describe the problem or what you need ("I\'d appreciate it if...") instead of blaming.', 'rude'); var ya = t.match(/\byou (must|have to|need to)\b/i); if (ya) add('tone', 1, ya[0], 'Commands can sound bossy.', 'Try "Could you...?" or "It would help if...".', 'bossy'); }
  if (countRe(/\b(sorry|apologi[sz]e)\b/gi, t) >= 3) add('tone', 1, 'sorry x' + countRe(/\b(sorry|apologi[sz]e)\b/gi, t), 'Apologising many times can reduce your confidence.', 'Apologise once, clearly, then move to the solution.', 'sorrymany');
  if (countRe(HEDGE, t) >= 3) add('tone', 1, 'hedging words', 'Many "maybe/perhaps/sort of" words make you sound unsure.', 'State your point directly, and keep one hedge for genuine doubt.', 'hedge');
  return issues.sort(function (x, y) { return y.sev - x.sev; });
}
function fillerStats(t) {
  var total = 0, list = []; FILLERS.forEach(function (f) { var n = countRe(f[0], t); if (n) { total += n * f[1]; list.push([f[2], n]); } }); return {total:total, list:list};
}

/* ---------- skill scorers ---------- */
function sFillers(a) {
  var f = fillerStats(a.text), rate = a.wc ? f.total / a.wc * 100 : 0; return {score:clamp(100 - rate * 10), list:f.list, rate:rate};
}
function sRepetition(a, kw) {
  if (a.wc < 12) return {score:100, rep:[]};
  var freq = {}; a.content.forEach(function (w) { freq[w] = (freq[w] || 0) + 1; });
  var pen = 0, rep = [];
  Object.keys(freq).forEach(function (w) { var thr = (kw && kw.indexOf(w) >= 0) ? 5 : 3; if (freq[w] >= thr) { pen += freq[w] - (thr - 1); rep.push([w, freq[w]]); } });
  rep.sort(function (x, y) { return y[1] - x[1]; });
  var score = 100 - (pen / a.wc * 100) * 6;
  if (!a.voice) { var st = {}; a.sentences.forEach(function (s) { var f = (s.match(/^[A-Za-z']+/) || [''])[0].toLowerCase(); st[f] = (st[f] || 0) + 1; }); Object.keys(st).forEach(function (f) { if (a.sc >= 4 && st[f] >= 3 && st[f] / a.sc >= 0.5 && f !== 'the') score -= 8; }); }
  var big = {}, c = a.content; for (var i = 0; i < c.length - 1; i++) { var b = c[i] + ' ' + c[i + 1]; big[b] = (big[b] || 0) + 1; }
  Object.keys(big).forEach(function (b) { if (big[b] >= 3) { score -= 8; } });
  score -= countRe(/\b([a-z']+)\s+\1\b/gi, a.text) * 4;
  return {score:clamp(score), rep:rep};
}
function sVocab(a) {
  if (a.wc < 5) return {score:30, pro:[], weak:[]};
  var uniq = {}; a.content.forEach(function (w) { uniq[w] = 1; }); var u = Object.keys(uniq).length, n = a.content.length;
  var div = n < 15 ? 60 : clamp((u / n - 0.45) / 0.4 * 100);
  var pro = []; PRO.forEach(function (r) { var m = a.text.match(r); if (m) pro.push(m[0]); });
  var weak = []; var wr = 0; a.lower.forEach(function (w) { if (WEAK.indexOf(w) >= 0) { wr++; if (weak.indexOf(w) < 0) weak.push(w); } });
  wr += countRe(/\ba lot\b/gi, a.text);
  var wrate = wr / a.wc * 100, infl = 0; INFLATED.forEach(function (p) { if (p[0].test(a.text)) infl++; });
  var score = 56 + div * 0.25 + Math.min(30, pro.length * 6) - Math.min(30, wrate * 5) - infl * 2;
  return {score:clamp(score), pro:pro, weak:weak};
}
function sSpecific(a, ctx) {
  var base = ctx.kind === 'interview' ? (ctx.story === false ? 46 : 40) : (ctx.kind === 'writing' ? 35 : 40); if (ctx.level === 'noexp') base += 8;
  var t = a.text, ev = [], b = 0;
  var nums = countRe(/\b\d+(?:[.,]\d+)?%?|£\s?\d+/g, t); if (nums) { b += Math.min(16, nums * 8); ev.push('numbers'); }
  var caps = 0; a.sentences.forEach(function (s) { var ws = s.match(/[A-Za-z']+/g) || []; for (var i = 1; i < ws.length; i++) if (/^[A-Z][a-z]+/.test(ws[i]) && ws[i] !== 'I' && !/^I'/.test(ws[i])) caps++; });
  if (caps) { b += Math.min(12, caps * 4); ev.push('names'); }
  var ex = countRe(/\b(for example|for instance|such as|specifically|in particular|last (year|term|summer|month)|during|when i|one time|at (school|college|work))\b/gi, t); if (ex) { b += Math.min(18, ex * 6); ev.push('a real example'); }
  var rs = countRe(/\b(as a result|which led to|resulted in|increased|reduced|improved|achieved|learned|so that|outcome)\b/gi, t); if (rs) { b += Math.min(15, rs * 5); ev.push('a result'); }
  var av = countRe(/\bI\s+(?:then\s+|first\s+|also\s+)?(\w+ed|led|built|wrote|made|took|ran|set|held|sent|spoke|met|taught|chose|began|fixed|found|did|gave|told|put|kept|saw)\b/g, t); if (av) { b += Math.min(16, av * 4); ev.push('your own actions'); }
  var vg = 0; VAGUE.forEach(function (w) { if (new RegExp('(^|[^A-Za-z])' + escRe(w) + '(?![A-Za-z])', 'i').test(t)) vg++; });
  var score = base + b - vg * 5;
  if (a.wc < 12) score = Math.min(score, 45);
  return {score:clamp(score), ev:ev, nums:nums, vague:vg};
}
function sStructure(a, ctx, moveHits) {
  var t = a.text, M = C.MOVES, kind = ctx.kind, hit = [], miss = [], score;
  function has(m) { return M[m][1].test(t); }
  var conn = Math.min(13, countRe(CONN, t) * 4);
  if (kind === 'interview' && ctx.star) {
    var parts = [['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result']]; parts.forEach(function (p) { (has(p[0]) ? hit : miss).push(p[1]); });
    score = 15 + hit.length * 18 + conn;
  } else if (kind === 'interview') {
    var checks = [['an answer-first opening', a.wc >= 8 && !/^(so|um|well|uh)\b/i.test(t)], ['a reason or explanation', has('reason') || /\b(because|so that|which means|this means|that way)\b/i.test(t)], ['an example or clear steps', has('example') || has('plan')], ['a closing takeaway', has('link') || has('reflect') || /\b(check|make sure|finally|afterwards|so that|overall)\b/i.test(t)]];
    checks.forEach(function (c) { (c[1] ? hit : miss).push(c[0]); }); score = 22 + hit.length * 18 + Math.min(10, conn);
  } else if (kind === 'writing' && ctx.noEnvelope) {
    var pc = [['a clear opening claim', (a.sentences[0] || '').split(/\s+/).length >= 6], ['a real example', has('example') || /\b\d+/.test(t)], ['a result or outcome', has('result') || /\b\d+%?/.test(t)], ['a link to the role or company', /\b(would|bring|love|enjoy|keen|look forward|want to)\b/i.test(t)]];
    score = 20 + Math.min(8, conn); pc.forEach(function (c) { if (c[1]) { score += 18; hit.push(c[0]); } else miss.push(c[0]); });
  } else if (kind === 'writing' && !a.voice) {
    var wc = [['a greeting', has('greet') && M.greet[1].test(t.slice(0, 50)), 15], ['a clear purpose early on', M.purpose[1].test(t.split(/[.!?]/).slice(0, 2).join('.')) || has('request'), 20], ['a sign-off', M.signoff[1].test(t.slice(-90)), 15], ['more than one paragraph or enough sentences', /\n\s*\n/.test(t) || a.sc >= 3, 15], ['a clear request or next step', has('request') || has('nextstep') || has('offer'), 15]];
    score = 10 + Math.min(10, conn); wc.forEach(function (c) { if (c[1]) { score += c[2]; hit.push(c[0]); } else miss.push(c[0]); });
  } else {
    var op = a.wc >= 6 && (has('greet') || has('intro') || has('thanks') || has('empathy') || has('apologise') || has('purpose') || has('request') || has('opinion') || has('balance') || a.sc >= 2);
    var cl = has('ask') || has('nextstep') || has('thanks') || has('offer');
    score = 30 + (op ? 20 : 0) + (a.sc >= 2 || a.wc >= 25 ? 15 : 0) + (cl ? 20 : 0) + Math.min(15, conn);
    (op ? hit : miss).push('a clear opening'); ((a.sc >= 2 || a.wc >= 25) ? hit : miss).push('more than one idea'); (cl ? hit : miss).push('a closing question or next step');
  }
  if (a.wc < 8) score = Math.min(score, 35);
  return {score:clamp(score), hit:hit, miss:miss};
}
function sProf(a, ctx) {
  var t = a.text, tone = ctx.tone || 'neutral', base = tone === 'friendly' ? 88 : (ctx.kind === 'interview' ? 84 : (tone === 'formal' ? 80 : 80)), pen = 0, found = [];
  Object.keys(CASUAL).forEach(function (w) { if (new RegExp('(^|[^A-Za-z\'])' + escRe(w) + '(?![A-Za-z\'])', 'i').test(t)) { var strong = SLANG_STRONG.indexOf(w) >= 0; if (tone === 'friendly' && !strong) return; if (tone === 'friendly' && ['gonna', 'wanna', 'gotta', 'dunno', 'ain\'t', 'u', 'ur'].indexOf(w) >= 0) return; found.push(w); pen += tone === 'friendly' ? 6 : 8; } });
  if (SWEAR.test(t)) pen += 25;
  if (tone !== 'friendly' && /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)) pen += 5;
  var caps = t.match(/\b[A-Z]{5,}\b/g); if (caps) pen += 8;
  if (tone !== 'friendly' && countRe(/!/g, t) > 2) pen += 4;
  var rude = t.match(RUDE); if (rude && tone !== 'friendly') { pen += 10 * rude.length; found.push(rude[0].toLowerCase()); }
  var pol = (t.match(POLITE) || []).map(function (x) { return x.toLowerCase(); }), pu = []; pol.forEach(function (p) { if (pu.indexOf(p) < 0) pu.push(p); });
  var bonus = Math.min(tone === 'friendly' ? 10 : 20, pu.length * 5);
  if (countRe(/\b(sorry|apologi[sz]e)\b/gi, t) >= 3) pen += 6;
  var hed = countRe(HEDGE, t); if (hed > 2) pen += (hed - 2) * 3;
  var score = base + bonus - pen; if (a.wc < 8) score = Math.min(score, 50);
  return {score:clamp(score), slang:found, polite:pu};
}
function sConcise(a, ctx, fil, rep) {
  var lo = ctx.len[0], hi = ctx.len[1], pen = 0, pad = [];
  PADDING.forEach(function (r) { var m = a.text.match(r); if (m) { pad.push(m[0]); pen += 6; } });
  var over = a.wc > hi ? (a.wc - hi) / hi * 60 : 0; pen += over;
  var longS = 0; if (!a.voice) a.sentences.forEach(function (s) { if ((s.match(/[A-Za-z0-9']+/g) || []).length > 35) { longS++; pen += 7; } });
  pen += (100 - rep.score) * 0.3 + (100 - fil.score) * 0.3;
  var score = 92 - pen; if (a.wc < lo * 0.4) score = Math.min(score, 72); if (a.wc < 8) score = Math.min(score, 60);
  return {score:clamp(score), pad:pad, over:a.wc > hi, longS:longS};
}
function sClarity(a, issues, ctx) {
  var pen = 0; issues.forEach(function (i) { if (['complex', 'unclear', 'punctuation', 'grammar', 'vague'].indexOf(i.type) >= 0) pen += i.sev * 3; });
  pen = Math.min(45, pen * (60 / Math.max(a.wc, 30)));
  var sc = 94 - pen;
  if (!a.voice && a.sc) { if (a.avgLen > 26) sc -= Math.min(15, (a.avgLen - 26) * 1.5); if (a.avgLen < 5 && a.wc > 10) sc -= 8; }
  if (a.wc < 6) sc -= 30;
  return {score:clamp(sc), pen:pen};
}
function sRelevance(a, ctx, moveHits) {
  var kws = (ctx.keywords || []).map(function (k) { return k.toLowerCase(); }), hits = 0, hitKw = [];
  kws.forEach(function (k) { var stem = k.length > 5 ? k.slice(0, k.length - 2) : k; if (a.lower.some(function (w) { return w.indexOf(stem) === 0; })) { hits++; hitKw.push(k); } });
  var kr = kws.length ? Math.min(1, hits / Math.min(kws.length, 2)) : 0.7;
  var mr = ctx.moves && ctx.moves.length ? moveHits.hit.length / ctx.moves.length : 0.7;
  var s = 20 + kr * 30 + mr * 50; if (a.wc < 4) s = Math.min(s, 25);
  return {score:clamp(s), hitKw:hitKw, kr:kr};
}

var WEIGHTS = {
 conversation:{clarity:15, structure:12, professionalism:14, vocabulary:8, specificity:8, conciseness:10, repetition:7, fillers:8, relevance:18},
 interview:{clarity:12, structure:17, professionalism:8, vocabulary:8, specificity:20, conciseness:7, repetition:6, fillers:7, relevance:15},
 writing:{clarity:16, structure:16, professionalism:16, vocabulary:8, specificity:10, conciseness:10, repetition:6, fillers:4, relevance:14}
};

function ruleBasedAssessment(sub) {
  var ctx = sub.ctx || {kind:sub.kind || 'conversation', moves:[], keywords:[], len:[20, 80]}; ctx.len = ctx.len || [20, 80]; var kind = ctx.kind || sub.kind || 'conversation';
  var a = analyse(sub.text, {voice:sub.voice}), M = C.MOVES;
  var issues = proofread(sub.text, {analysis:a, kind:kind, tone:ctx.tone, voice:sub.voice, noEnvelope:ctx.noEnvelope, keywords:(ctx.keywords || [])});
  var mh = {hit:[], missed:[]}; (ctx.moves || []).forEach(function (m) { if (M[m] && M[m][1].test(a.text)) mh.hit.push(m); else if (M[m]) mh.missed.push(m); });
  var fil = sFillers(a), rep = sRepetition(a, ctx.keywords), voc = sVocab(a), spe = sSpecific(a, ctx), str = sStructure(a, ctx, mh), pro = sProf(a, ctx), con = sConcise(a, ctx, fil, rep), cla = sClarity(a, issues, ctx), rel = sRelevance(a, ctx, mh);
  var raw = {clarity:cla.score, structure:str.score, professionalism:pro.score, vocabulary:voc.score, specificity:spe.score, conciseness:con.score, repetition:rep.score, fillers:fil.score, relevance:rel.score};
  var lo = ctx.len[0], cap = 35 + 65 * Math.min(1, a.wc / (lo * 0.8)), skills = {};
  C.SKILLS.forEach(function (s) { skills[s.id] = clamp(Math.min(raw[s.id], cap)); });
  var W = WEIGHTS[kind] || WEIGHTS.conversation, tot = 0; if (kind === 'interview' && ctx.story === false) W = {clarity:16, structure:21, professionalism:8, vocabulary:8, specificity:12, conciseness:7, repetition:6, fillers:7, relevance:15}; C.SKILLS.forEach(function (s) { tot += skills[s.id] * W[s.id]; }); var overall = tot / 100;
  var sf = a.wc / lo, factor = sf >= 1 ? 1 : (sf >= 0.5 ? 0.85 + 0.3 * (sf - 0.5) : 0.4 + 0.9 * sf); overall *= factor;
  if (a.wc < 5) overall = Math.min(overall, 20); if (skills.relevance < 35) overall = Math.min(overall, 60);
  overall = clamp(overall);
  // ---- feedback ----
  var label = function (id) { return C.SKILLS.filter(function (s) { return s.id === id; })[0].label; };
  var impact = function (id) { return W[id] * (100 - skills[id]); };
  var strengths = [], weaknesses = [], q = function (s) { return '\u201C' + s + '\u201D'; };
  var S = {
    clarity:function () { return 'Your sentences are clear and easy to follow' + (a.avgLen && !a.voice ? ' (about ' + Math.round(a.avgLen) + ' words per sentence on average).' : '.'); },
    structure:function () { return ctx.star ? 'You covered ' + str.hit.join(', ') + ', which gives the answer a clear shape.' : 'Your response has a clear shape: ' + str.hit.slice(0, 3).join(', ') + '.'; },
    professionalism:function () { return 'Your tone is polite and suitable for the situation' + (pro.polite.length ? ' (for example, ' + q(pro.polite[0]) + ').' : '.'); },
    vocabulary:function () { return pro_ok(voc) ? 'You used effective phrases such as ' + q(voc.pro[0]) + '.' : 'Your word choice is varied and avoids vague words.'; },
    specificity:function () { return 'You backed up your points with concrete detail' + (spe.ev.length ? ' (' + spe.ev.join(', ') + ').' : '.'); },
    conciseness:function () { return 'You kept the response focused without padding.'; },
    repetition:function () { return 'You varied your wording well.'; },
    fillers:function () { return 'You avoided filler words.'; },
    relevance:function () { return mh.hit.length ? 'You addressed the task directly by including ' + mh.hit.slice(0, 2).map(function (m) { return M[m][0]; }).join(' and ') + '.' : 'Your response is clearly on topic.'; }
  };
  function pro_ok(v) { return v.pro.length > 0; }
  var W_ = {
    clarity:function () { var top = issues.filter(function (i) { return ['complex', 'unclear', 'punctuation', 'grammar'].indexOf(i.type) >= 0; }).slice(0, 2); return top.length ? 'Some wording is hard to follow or has language slips (' + top.map(function (i) { return i.excerpt; }).join('; ') + ').' : 'The message could be easier to follow; try shorter sentences with one point each.'; },
    structure:function () { return ctx.star && str.miss.length ? 'The answer is missing ' + str.miss.join(' and ') + ' from the STAR shape.' : 'The response would be stronger with ' + str.miss.slice(0, 2).join(' and ') + '.'; },
    professionalism:function () { return pro.slang.length ? 'Some wording is too casual or blunt for this situation (' + pro.slang.slice(0, 3).map(q).join(', ') + ').' : 'Add polite phrases such as ' + q('Could you...?') + ' or ' + q('I\'d be happy to...') + ' to sound more professional.'; },
    vocabulary:function () { return voc.weak.length ? 'Vague or basic words weaken the answer: ' + voc.weak.slice(0, 4).map(q).join(', ') + '.' : 'Your wording is quite plain; try one or two more precise or professional phrases.'; },
    specificity:function () { return 'There is little concrete detail. Add a number, a name, a date or a real example of what you did.'; },
    conciseness:function () { return con.pad.length ? 'Some phrases add length without meaning (' + con.pad.slice(0, 2).map(q).join(', ') + ').' : (con.over ? 'The response is longer than it needs to be (' + a.wc + ' words). Cut anything that does not support your main point.' : (con.longS ? 'Some sentences are very long; split them.' : 'Keep each sentence to one clear point.')); },
    repetition:function () { return rep.rep.length ? 'You repeat some words a lot: ' + rep.rep.slice(0, 2).map(function (r) { return q(r[0]) + ' (' + r[1] + ' times)'; }).join(', ') + '.' : 'Several sentences begin the same way, which sounds repetitive.'; },
    fillers:function () { return 'Filler words found: ' + fil.list.slice(0, 3).map(function (f) { return q(f[0]) + (f[1] > 1 ? ' x' + f[1] : ''); }).join(', ') + '.'; },
    relevance:function () { var ms = mh.missed.slice(0, 2).map(function (m) { return M[m][0]; }); return ms.length ? 'The response does not clearly include ' + ms.join(' or ') + '.' : 'Link your answer more directly to what the question asks' + (ctx.role ? ' and to the ' + ctx.role + ' role.' : '.'); }
  };
  var order = C.SKILLS.map(function (s) { return s.id; });
  order.slice().sort(function (x, y) { return skills[y] - skills[x]; }).forEach(function (id) { if (skills[id] >= 78 && strengths.length < 3 && a.wc >= 8) strengths.push(S[id]()); });
  if (!strengths.length) strengths.push(a.wc >= 8 ? 'You attempted the task and wrote ' + a.wc + ' words to work with, which gives us something to improve.' : 'You have made a start. Writing a little more will give much more to work with.');
  order.slice().sort(function (x, y) { return impact(y) - impact(x); }).forEach(function (id) { if (skills[id] < 72 && weaknesses.length < 3) weaknesses.push(W_[id]()); });
  if (a.wc < lo * 0.5) weaknesses.unshift('The response is quite short (' + a.wc + ' words). Aim for roughly ' + lo + ' to ' + ctx.len[1] + ' words so you can develop your point.');
  if (!weaknesses.length) weaknesses.push('Nothing major stands out. To push higher, make one detail more specific or one sentence tighter.');
  var big = order.slice().sort(function (x, y) { return impact(y) - impact(x); })[0];
  var advice = [C.SKILL_TIPS[big]];
  if (kind === 'interview' && ctx.familyTip && skills.relevance < 92) advice.push('For a ' + (ctx.role || 'this') + ' role, ' + ctx.familyTip + '.');
  if (mh.missed.length) advice.push(M[mh.missed[0]][3]);
  if (ctx.star && str.miss.length) advice.push('Add a sentence for ' + str.miss[0] + ' (for example, ' + ({Situation:'"At college, we had a group project when..."', Task:'"My task was to..."', Action:'"I decided to... and then I..."', Result:'"As a result..."'}[str.miss[0]]) + ').');
  var second = order.slice().sort(function (x, y) { return impact(y) - impact(x); })[1]; if (second && skills[second] < 80 && advice.length < 3) advice.push(C.SKILL_TIPS[second]);
  if (ctx.level === 'exp' && !spe.nums && advice.length < 3) advice.push('At your experience level, interviewers expect measurable results, so add a number, scale or outcome.');
  advice = advice.filter(function (x, i, arr) { return x && arr.indexOf(x) === i; }).slice(0, sub.confidence === 'low' ? 2 : 3);
  var result = {engine:'rule-based', version:VERSION, overall:overall, skills:skills, strengths:strengths, weaknesses:weaknesses.slice(0, 3), biggest:{skill:big, label:label(big), advice:C.SKILL_TIPS[big]}, advice:advice,
    issues:issues.slice(0, 14), moves:{hit:mh.hit, missed:mh.missed}, stats:{words:a.wc, sentences:a.sc, avgSentence:Math.round(a.avgLen * 10) / 10}, structure:{hit:str.hit, missed:str.miss}, relevance:{score:rel.score}};
  return result;
}

/* ---------- AI adapter (optional, never fakes results) ---------- */
SW.config = SW.config || {aiEndpoint:null};
function aiAssessment(sub) {
  var url = SW.config && SW.config.aiEndpoint;
  if (!url) return Promise.reject(new Error('AI assessment is not configured'));
  var payload = {schemaVersion:1, kind:sub.kind, prompt:sub.prompt, response:sub.text, context:{tone:sub.ctx && sub.ctx.tone, role:sub.ctx && sub.ctx.role, level:sub.ctx && sub.ctx.level, moves:sub.ctx && sub.ctx.moves}, skills:C.SKILLS.map(function (s) { return s.id; })};
  return fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}).then(function (r) { if (!r.ok) throw new Error('AI endpoint returned ' + r.status); return r.json(); });
}
function validate(r) {
  if (!r || typeof r !== 'object') return null;
  if (!isFinite(r.overall) || r.overall < 0 || r.overall > 100) return null;
  if (!r.skills || typeof r.skills !== 'object') return null;
  var skills = {}; for (var i = 0; i < C.SKILLS.length; i++) { var v = r.skills[C.SKILLS[i].id]; if (!isFinite(v) || v < 0 || v > 100) return null; skills[C.SKILLS[i].id] = Math.round(v); }
  function arr(x) { return Array.isArray(x) ? x.filter(function (s) { return typeof s === 'string'; }).slice(0, 6) : []; }
  var big = r.biggest && skills[r.biggest.skill] != null ? r.biggest : (function () { var m = C.SKILLS[0].id; C.SKILLS.forEach(function (s) { if (skills[s.id] < skills[m]) m = s.id; }); return {skill:m, label:m, advice:C.SKILL_TIPS[m]}; })();
  big = {skill:big.skill, label:String(big.label || big.skill), advice:String(big.advice || C.SKILL_TIPS[big.skill] || '')};
  return {engine:String(r.engine || 'external'), version:String(r.version || ''), overall:Math.round(r.overall), skills:skills, strengths:arr(r.strengths), weaknesses:arr(r.weaknesses), biggest:big, advice:arr(r.advice),
    issues:Array.isArray(r.issues) ? r.issues.filter(function (i) { return i && typeof i.why === 'string'; }).slice(0, 14).map(function (i) { return {type:String(i.type || 'other'), sev:Math.min(3, Math.max(1, i.sev | 0 || 1)), excerpt:String(i.excerpt || ''), why:i.why, fix:String(i.fix || '')}; }) : [],
    moves:r.moves && Array.isArray(r.moves.hit) ? {hit:r.moves.hit, missed:r.moves.missed || []} : {hit:[], missed:[]}, stats:r.stats || {}, example:typeof r.example === 'string' ? r.example : undefined, exampleWhy:Array.isArray(r.exampleWhy) ? arr(r.exampleWhy) : undefined};
}
var providers = {rule:function (s) { return Promise.resolve(ruleBasedAssessment(s)); }, ai:aiAssessment}, active = 'rule';
function run(sub) {
  var order = (active !== 'rule' && providers[active]) ? [active, 'rule'] : ['rule'], note = null;
  function step(i) {
    var name = order[i];
    return Promise.resolve().then(function () { return providers[name](sub); }).then(function (r) {
      var v = validate(r); if (!v) throw new Error('invalid assessment shape from ' + name);
      if (name === 'rule') v.engine = 'rule-based'; if (note) v.fallbackNote = note; return v;
    }).catch(function (e) { if (i + 1 < order.length) { note = 'Fell back to rule-based assessment (' + e.message + ').'; return step(i + 1); } throw e; });
  }
  return step(0);
}
/* compare two attempts of the same exercise */
function compare(prev, cur) {
  if (!prev) return null;
  var d = cur.overall - prev.overall, up = [], down = [];
  C.SKILLS.forEach(function (s) { var x = cur.skills[s.id] - prev.skills[s.id]; if (x >= 5) up.push({id:s.id, label:s.label, d:x}); else if (x <= -5) down.push({id:s.id, label:s.label, d:x}); });
  var A = new Set(analyse(prev.response).lower), B = analyse(cur.response).lower, same = 0; B.forEach(function (w) { if (A.has(w)) same++; }); var sim = B.length ? same / B.length : 1;
  var note, level;
  if (d >= 8) { level = 'big'; note = 'Clear improvement: +' + d + ' points.' + (up.length ? ' The biggest gains were in ' + up.slice(0, 3).map(function (u) { return u.label.toLowerCase(); }).join(', ') + '.' : ''); }
  else if (d >= 3) { level = 'small'; note = 'A small improvement (+' + d + ').' + (up.length ? ' Better ' + up.slice(0, 2).map(function (u) { return u.label.toLowerCase(); }).join(' and ') + '.' : ''); }
  else if (d > -3) { level = 'same'; note = 'About the same as last time. Try changing one specific thing from the advice.'; }
  else { level = 'down'; note = 'Slightly lower than last time (' + d + ').' + (down.length ? ' ' + down.slice(0, 2).map(function (u) { return u.label; }).join(' and ') + ' dropped.' : ''); }
  if (sim > 0.92 && d >= 3) note += ' (Your wording is very similar to last time, so check the improvement is real.)';
  return {delta:d, up:up, down:down, level:level, note:note, similarity:sim};
}
SW.assess = {run:run, ruleBasedAssessment:ruleBasedAssessment, aiAssessment:aiAssessment, proofread:proofread, analyse:analyse, compare:compare, validate:validate, esc:esc, VERSION:VERSION,
  registerProvider:function (n, fn) { providers[n] = fn; }, use:function (n) { active = providers[n] ? n : 'rule'; return active; }, activeProvider:function () { return active; }};
})(typeof window !== 'undefined' ? window : globalThis);
