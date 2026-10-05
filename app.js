const STORAGE_KEY = "speakwellProgress";
function loadState(){
  const fresh = {sessions:0,scores:[],words:[],focus:{}};
  try{
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if(!saved || typeof saved!=="object") return fresh;
    return {
      sessions: Number.isFinite(saved.sessions) ? saved.sessions : 0,
      scores: Array.isArray(saved.scores) ? saved.scores.filter(Number.isFinite) : [],
      words: Array.isArray(saved.words) ? saved.words.filter(Number.isInteger) : [],
      focus: (saved.focus && typeof saved.focus==="object") ? saved.focus : {}
    };
  }catch(e){ return fresh; } // corrupted data or storage blocked (e.g. private mode)
}
const state = loadState();

const conversationData = [
  {id:"workplace", title:"Meeting someone new at work", prompt:"A new colleague introduces themselves: “Hi, I’m Alex. I don’t think we’ve met before.” Respond naturally and keep the conversation going."},
  {id:"teacher", title:"Asking a teacher for clarification", prompt:"Your teacher has explained an assignment, but you still do not understand one part. Ask for clarification without sounding abrupt."},
  {id:"customer", title:"Helping a customer", prompt:"A customer asks whether you can help them find something. Respond professionally and guide the conversation."},
  {id:"church", title:"Starting a conversation", prompt:"You are at an event and notice someone you have not spoken to before. Start a friendly conversation."}
];

const interviewData = {
  "Digital Marketing Apprentice":[
    "Why are you interested in digital marketing?",
    "Tell me about a time you used creativity to solve a problem.",
    "What do you think makes social media content effective?",
    "Why should we choose you for this apprenticeship?"
  ],
  "Retail Assistant":[
    "Why would you like to work in retail?",
    "Tell me about a time you helped a customer or another person.",
    "How would you handle a difficult customer?",
    "What does good customer service mean to you?"
  ],
  "Hospitality Assistant":[
    "Why are you interested in hospitality?",
    "Tell me about a time you worked as part of a team.",
    "How would you respond if a customer complained?",
    "What does good service look like to you?"
  ],
  "Business Apprentice":[
    "Why are you interested in business?",
    "Tell me about a time you had to organise something.",
    "What strengths would you bring to this role?",
    "How do you prioritise when you have several tasks?"
  ],
  "Media Assistant":[
    "Why are you interested in media?",
    "Tell me about a piece of content you have created.",
    "How would you decide whether content has performed well?",
    "How do you respond to creative feedback?"
  ],
  "IT Apprentice":[
    "Why are you interested in IT?",
    "Tell me about something you taught yourself.",
    "Describe a technical problem you solved.",
    "How do you approach learning unfamiliar technology?"
  ]
};

const writingPrompts = {
  email:"Write an email to your manager asking whether you can discuss your availability for next week. Keep it polite and professional.",
  teacher:"Write a message to your teacher explaining that you need clarification about an assignment deadline.",
  followup:"Write a short follow-up message after an interview, thanking the interviewer and showing continued interest.",
  linkedin:"Write a professional LinkedIn message to someone whose career in marketing interests you. Introduce yourself and explain why you are contacting them."
};

const vocabulary = [
  ["I’d be happy to…","A professional but friendly way to show willingness.","Professional tone"],
  ["I’m particularly interested in…","Useful when explaining a specific interest rather than saying only “I like…”.","Interviews"],
  ["From my experience…","A natural way to introduce evidence from something you have actually done.","Interviews"],
  ["Could you clarify…?","A polite way to ask for more information.","Conversation"],
  ["I appreciate your time.","Useful when thanking someone for their time or help.","Professional"],
  ["I’d like to follow up on…","Useful for professional emails and messages.","Writing"],
  ["One example would be…","Helps you introduce evidence instead of making a vague statement.","Interviews"],
  ["That makes sense. Could I also ask…?","Helps you keep a conversation moving naturally.","Conversation"]
];

function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){ /* storage unavailable: keep working in memory */ }
  updateDashboard();
}

/* ---------- Navigation ---------- */
const PAGE_IDS = ["dashboard","conversation","interview","writing","vocabulary"];
const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("backdrop");
const menuBtn = document.getElementById("mobileMenu");

function setMenu(open){
  sidebar.classList.toggle("open", open);
  backdrop.classList.toggle("show", open);
  document.body.classList.toggle("menu-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
}

function showPage(id, opts={}){
  if(!PAGE_IDS.includes(id)) id = "dashboard";
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active", p.id===id));
  document.querySelectorAll(".nav").forEach(b=>{
    const on = b.dataset.page===id;
    b.classList.toggle("active", on);
    if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
  });
  setMenu(false);
  if(!opts.fromHash && location.hash !== "#"+id){
    try{ history.replaceState(null,"","#"+id); }catch(e){ /* file:// or sandboxed */ }
  }
  window.scrollTo(0,0);
}

// One delegated listener handles every nav button, CTA and quick-start card.
document.addEventListener("click",e=>{
  const t = e.target.closest("[data-page],[data-go]");
  if(!t) return;
  e.preventDefault();
  showPage(t.dataset.page || t.dataset.go);
});
menuBtn.addEventListener("click",()=>setMenu(!sidebar.classList.contains("open")));
backdrop.addEventListener("click",()=>setMenu(false));
document.getElementById("closeMenu").addEventListener("click",()=>setMenu(false));
document.addEventListener("keydown",e=>{ if(e.key==="Escape") setMenu(false); });
window.addEventListener("resize",()=>{ if(window.innerWidth>700) setMenu(false); });
window.addEventListener("hashchange",()=>showPage(location.hash.slice(1),{fromHash:true}));

function basicAssessment(text, type){
  const clean=text.trim();
  const words=clean ? clean.split(/\s+/).length : 0;
  const sentences=(clean.match(/[.!?]+/g)||[]).length;
  const lower=clean.toLowerCase();
  let score=40;
  if(words>=12) score+=12;
  if(words>=25) score+=8;
  if(sentences>=2) score+=8;
  if(/[.!?]$/.test(clean)) score+=5;
  if(type==="interview" && /\b(because|example|experience|learned|helped|created|worked)\b/i.test(clean)) score+=12;
  if(type==="conversation" && /\b(you|your|how|what|nice|thanks|also)\b/i.test(clean)) score+=8;
  if(type==="writing" && /\b(hello|hi|dear)\b/i.test(clean)) score+=5;
  score=Math.min(100,score);
  const strengths=[];
  const improvements=[];
  if(words>=20) strengths.push("You gave enough detail to develop your response.");
  else improvements.push("Try expanding your answer with one specific detail or example.");
  if(sentences>=2) strengths.push("Your response has more than one sentence, which helps it feel developed.");
  else improvements.push("Use a second sentence to explain or develop your point.");
  if(/[.!?]$/.test(clean)) strengths.push("Your punctuation gives the response a clear ending.");
  else improvements.push("Finish complete sentences with punctuation.");
  if(type==="interview" && !/\b(because|example|experience|learned|helped|created|worked)\b/i.test(clean))
    improvements.push("For interviews, include evidence from something you have actually done.");
  if(type==="conversation" && !/\?/.test(clean) && !/\b(you|your|how|what)\b/i.test(clean))
    improvements.push("Try adding a question so the other person has an easy way to continue the conversation.");
  if(type==="writing" && /\b(very|really|just|like)\b/i.test(lower))
    improvements.push("Check for filler words such as “very”, “really”, “just” or “like” and remove any that do not add meaning.");
  return {score,strengths,improvements,words};
}

function renderFeedback(el,title,result){
  el.innerHTML=`<h3>${title}</h3><div class="score">${result.score}/100</div>
  <p><strong>What went well</strong></p><ul>${result.strengths.map(x=>`<li class="good">${x}</li>`).join("")}</ul>
  <p><strong>Next improvements</strong></p><ul>${result.improvements.map(x=>`<li class="warn">${x}</li>`).join("")}</ul>
  <p class="muted">This first version uses transparent rule-based feedback. It is deliberately not pretending to be an AI judge.</p>`;
  state.sessions++;
  state.scores.push(result.score);
  save();
}

const convSelect=document.getElementById("conversationSelect");
conversationData.forEach((x,i)=>convSelect.add(new Option(x.title,i)));
function updateConversation(){
  document.getElementById("conversationPrompt").textContent=conversationData[convSelect.value].prompt;
}
convSelect.addEventListener("change",updateConversation); updateConversation();

document.getElementById("conversationSubmit").addEventListener("click",()=>{
  const text=document.getElementById("conversationAnswer").value;
  if(!text.trim()) return alert("Write your response first.");
  renderFeedback(document.getElementById("conversationFeedback"),"Your feedback",basicAssessment(text,"conversation"));
});

let interviewIndex=0;
function updateInterview(){
  const role=document.getElementById("jobSelect").value;
  const questions=interviewData[role];
  document.getElementById("interviewQuestion").textContent=questions[interviewIndex%questions.length];
  document.getElementById("interviewAnswer").value="";
}
document.getElementById("jobSelect").addEventListener("change",()=>{interviewIndex=0;updateInterview();});
document.getElementById("nextQuestion").addEventListener("click",()=>{interviewIndex++;updateInterview();});
document.getElementById("interviewSubmit").addEventListener("click",()=>{
  const text=document.getElementById("interviewAnswer").value;
  if(!text.trim()) return alert("Answer the interview question first.");
  renderFeedback(document.getElementById("interviewFeedback"),"Interview feedback",basicAssessment(text,"interview"));
});
updateInterview();

const writingType=document.getElementById("writingType");
function updateWriting(){ document.getElementById("writingPrompt").textContent=writingPrompts[writingType.value]; }
writingType.addEventListener("change",updateWriting); updateWriting();

document.getElementById("writingSubmit").addEventListener("click",()=>{
  const text=document.getElementById("writingAnswer").value;
  if(!text.trim()) return alert("Write your message first.");
  renderFeedback(document.getElementById("writingFeedback"),"Writing feedback",basicAssessment(text,"writing"));
});

const vocabList=document.getElementById("vocabList");
vocabList.innerHTML=vocabulary.map((v,i)=>{
  const done=state.words.includes(i);
  return `
<article class="vocab-card">
<span class="tag">${v[2]}</span>
<div class="phrase">${v[0]}</div>
<p>${v[1]}</p>
<button type="button" class="secondary learn-btn${done?" learned":""}" data-index="${i}">${done?"Learned ✓":"Mark as learned"}</button>
</article>`;}).join("");

vocabList.addEventListener("click",e=>{
  const btn=e.target.closest(".learn-btn");
  if(!btn) return;
  const i=Number(btn.dataset.index);
  if(!state.words.includes(i)) state.words.push(i);
  btn.textContent="Learned ✓"; btn.classList.add("learned"); save();
});

function updateDashboard(){
  document.getElementById("sessions").textContent=state.sessions;
  const avg=state.scores.length?Math.round(state.scores.reduce((a,b)=>a+b,0)/state.scores.length):0;
  document.getElementById("averageScore").textContent=avg;
  document.getElementById("overallScore").textContent=avg;
  document.getElementById("wordsLearned").textContent=state.words.length;
  const focus=document.getElementById("focusAreas");
  if(!state.sessions){focus.innerHTML='<p class="muted">Complete a few exercises and your focus areas will appear here.</p>';return;}
  const suggestions=[];
  const avgScore=avg;
  if(avgScore<70) suggestions.push("Developing answers with more detail");
  if(avgScore<80) suggestions.push("Using specific examples");
  if(avgScore<90) suggestions.push("Making responses more natural and confident");
  focus.innerHTML=suggestions.map(s=>`<p>⚠️ ${s}</p>`).join("") || "<p>You're building a strong baseline. Keep practising.</p>";
}
updateDashboard();
showPage(location.hash.slice(1),{fromHash:true}); // honour #hash on load, default Overview
