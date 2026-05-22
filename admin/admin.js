import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, onSnapshot,
  collection, getDocs, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* Firebase */
const db = getFirestore(initializeApp({
  apiKey:"AIzaSy...",
  authDomain:"quiz-app-97d7c.firebaseapp.com",
  projectId:"quiz-app-97d7c"
}));

/* 初期状態：問題は未選択 */
let state = {
  mode: "waiting",
  questionId: null,
  acceptingAnswers: false,
  eventId: Date.now().toString()
};

let currentTab = "q";

/* state保存（eventId保持） */
const update = async () => {
  await setDoc(doc(db,"game","state"), state, { merge:true });
};

/* 参加人数 */
onSnapshot(collection(db,"players"), snap=>{
  document.getElementById("playerCount").innerText =
    "参加人数：" + snap.size + "人";
});

/* タブ */
document.getElementById("tab-q").onclick = ()=>showTab("q");
document.getElementById("tab-a").onclick = ()=>showTab("a");

function showTab(t){
  currentTab = t;
  document.getElementById("tab-q-area").style.display = t==="q"?"block":"none";
  document.getElementById("tab-a-area").style.display = t==="a"?"block":"none";
  document.getElementById("tab-q").classList.toggle("active",t==="q");
  document.getElementById("tab-a").classList.toggle("active",t==="a");
  if(t==="a") loadAnswerStatus();
}

/* 問題一覧 */
async function loadQuestions(){
  const snap = await getDocs(collection(db,"questions"));
  let html="";
  snap.forEach(docSnap=>{
    const d = docSnap.data();
    const id = docSnap.id.replace("q","");
    html += `
      <div class="q-card inactive" id="q${id}">
        第${id}問：${d.text}
      </div>`;
  });
  document.getElementById("questionList").innerHTML = html;

  snap.forEach(docSnap=>{
    const id = docSnap.id.replace("q","");
    document.getElementById("q"+id).onclick = ()=>setQ(id);
  });
}

/* =====================
   回答状況（flex 1行構造）
===================== */
async function loadAnswerStatus(){

  const stateSnap = await getDoc(doc(db,"game","state"));
  if(!stateSnap.exists()) return;

  const s = stateSnap.data();

  if(s.questionId === null){
    document.getElementById("answerStatus").innerText =
      "問題を選択してください";
    return;
  }

  const qId = s.questionId;

  const qSnap = await getDoc(doc(db,"questions","q"+qId));
  if(!qSnap.exists()) return;
  const q = qSnap.data();

  const ansSnap = await getDocs(
    collection(db,"answers","q"+qId,"users")
  );

  const count = Array(q.choices.length).fill(0);

  ansSnap.forEach(d=>{
    const data = d.data();
    if(
      data.eventId === s.eventId &&
      typeof data.choice === "number"
    ){
      count[data.choice]++;
    }
  });

  // 回答受付中
  if(s.acceptingAnswers){
    document.getElementById("answerStatus").innerHTML = `
      <div class="answer-info">
        <div class="answer-title">回答受付中</div>
        <div class="answer-sub">参加者が解答しています…</div>
      </div>
    `;
    return;
  }

  // 表形式
  let html = `<div class="answer-table">`;

  q.choices.forEach((text,i)=>{
    const isCorrect = (s.mode === "answer" && i === q.answer);

    html += `
      <div class="answer-row ${isCorrect ? "correct" : ""}">
        <div class="col-check">
          ${isCorrect ? "✅" : ""}
        </div>
        <div class="col-number">
          ${i+1}.
        </div>
        <div class="col-text">
          ${text}
        </div>
        <div class="col-count">
          ${count[i]}人
        </div>
      </div>
    `;
  });

  html += `</div>`;

  document.getElementById("answerStatus").innerHTML = html;
}

/* UI更新 */
function updateUI(s){

  document.querySelectorAll(".q-card").forEach(el=>{
    el.classList.remove("active");
    el.classList.add("inactive");
  });

  if(s.questionId !== null){
    const cur = document.getElementById("q"+s.questionId);
    if(cur){
      cur.classList.remove("inactive");
      cur.classList.add("active");
    }
  }

  const btn=document.getElementById("btnToggle");
  btn.className = s.acceptingAnswers ? "toggleActive":"toggleInactive";
  btn.innerText = s.acceptingAnswers ? "回答：ON":"回答：OFF";
}

/* 操作 */
document.getElementById("btnToggle").onclick = ()=>{
  state.acceptingAnswers = !state.acceptingAnswers;
  update();
};

document.querySelector(".reset").onclick = async ()=>{
  state = {
    mode:"waiting",
    questionId:null,
    acceptingAnswers:false,
    eventId: Date.now().toString()
  };
  await setDoc(doc(db,"game","state"), state, { merge:false });
  currentTab="q";
  showTab("q");
};

function setQ(q){
  state.questionId=q;
  state.mode="question";
  state.acceptingAnswers=false;
  update();
}

/* state監視 */
onSnapshot(doc(db,"game","state"), snap=>{
  state = snap.data();
  updateUI(state);
  if(currentTab==="a") loadAnswerStatus();
});

/* init */
loadQuestions();