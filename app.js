const state = JSON.parse(localStorage.getItem("speakwellProgress") || '{"sessions":0,"scores":[],"words":[],"focus":{}}');

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

function save(){ localStorage.setItem("speakwellProgress", JSON.stringify(state)); updateDashboard(); }

function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===id));
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.go)));

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
  if(type==="interview" && /(because|example|experience|learned|helped|created|worked)/i.test(clean)) score+=12;
  if(type==="conversation" && /(you|your|how|what|nice|thanks|also)/i.test(clean)) score+=8;
  if(type==="writing" && /(hello|hi|dear)/i.test(clean)) score+=5;
  score=Math.min(100,score);
  const strengths=[];
  const improvements=[];
  if(words>=20) strengths.push("You gave enough detail to develop your response.");
  else improvements.push("Try expanding your answer with one specific detail or example.");
  if(sentences>=2) strengths.push("Your response has more than one sentence, which helps it feel developed.");
  else improvements.push("Use a second sentence to explain or develop your point.");
  if(/[.!?]$/.test(clean)) strengths.push("Your punctuation gives the response a clear ending.");
  else improvements.push("Finish complete sentences with punctuation.");
  if(type==="interview" && !/(because|example|experience|learned|helped|created|worked)/i.test(clean))
    improvements.push("For interviews, include evidence from something you have actually done.");
  if(type==="conversation" && !/(you|your|how|what)/i.test(clean))
    improvements.push("Try adding a question so the other person has an easy way to continue the conversation.");
  if(type==="writing" && /(very|really|just|like)/i.test(lower))
    improvements.push("Check for filler words such as “very”, “really”, “just” or “like” and remove any that do not add meaning.");
  return {score,strengths,improvements,words};
}

function renderFeedback(el,title,result){
  el.innerHTML=`<h2>${title}</h2><div class="score">${result.score}/100</div>
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

document.getElementById("vocabList").innerHTML=vocabulary.map((v,i)=>`
<article class="vocab-card">
<span class="tag">${v[2]}</span>
<div class="phrase">${v[0]}</div>
<p>${v[1]}</p>
<button class="secondary learn-btn" data-index="${i}">${state.words.includes(i)?"Learned ✓":"Mark as learned"}</button>
</article>`).join("");

document.querySelectorAll(".learn-btn").forEach(btn=>btn.addEventListener("click",()=>{
  const i=Number(btn.dataset.index);
  if(!state.words.includes(i)) state.words.push(i);
  btn.textContent="Learned ✓"; btn.classList.add("learned"); save();
}));

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
