import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, onSnapshot,
  collection, getDocs, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =====================
   Firebase 初期化
===================== */
const db = getFirestore(initializeApp({
  apiKey:"AIzaSy...",
  authDomain:"quiz-app-97d7c.firebaseapp.com",
  projectId:"quiz-app-97d7c"
}));

/* =====================
   state
===================== */
let state = {
  mode: "waiting",
  questionId: null,
  acceptingAnswers: false,
  eventId: null
};

let currentTab = "q";

/* =====================
   参加人数
===================== */
let currentPlayerCount = 0;

onSnapshot(collection(db,"players"), snap=>{
  if(!state.eventId) return;

  let count = 0;
  snap.forEach(d=>{
    if(d.data().eventId === state.eventId){
      count++;
    }
  });

  currentPlayerCount = count;
  document.getElementById("playerCount").innerText =
    "参加人数： " + count + "人";
});

/* =====================
   回答リアルタイム
===================== */
let unsubscribeAnswers = null;

async function startAnswerListener(){

  if(unsubscribeAnswers){
    unsubscribeAnswers();
    unsubscribeAnswers = null;
  }

  if(state.questionId === null) return;

  const qSnap = await getDoc(
    doc(db,"questions","q"+state.questionId)
  );
  if(!qSnap.exists()) return;

  const q = qSnap.data();
  const answersCol = collection(
    db,"answers","q"+state.questionId,"users"
  );

  unsubscribeAnswers = onSnapshot(answersCol, snap=>{

    const count = Array(q.choices.length).fill(0);
    let answeredCount = 0;

    snap.forEach(d=>{
      const data = d.data();
      if(
        data.eventId === state.eventId &&
        data.answered === true &&
        typeof data.choice === "number"
      ){
        answeredCount++;
        count[data.choice]++;
      }
    });

    let html = `
      <div class="answer-info">
        <div class="answer-title">
          ${state.acceptingAnswers ? "回答受付中" : "回答結果"}
        </div>
        <div class="answer-sub">
          ${answeredCount}人が回答済み / ${currentPlayerCount}人参加中
        </div>
      </div>
      <div class="answer-table">
    `;

    q.choices.forEach((text,i)=>{
      const isCorrect =
        (state.mode === "answer" && i === q.answer);

      html += `
        <div class="answer-row ${isCorrect ? "correct" : ""}">
          <div class="col-number">${i+1}</div>
          <div class="col-text">${text}</div>
          <div class="col-count">${count[i]}人</div>
        </div>
      `;
    });

    html += `</div>`;
    document.getElementById("answerStatus").innerHTML = html;
  });
}

/* =====================
   タブ
===================== */
document.getElementById("tab-q").onclick = ()=>showTab("q");
document.getElementById("tab-a").onclick = ()=>showTab("a");

function showTab(t){
  currentTab = t;

  document.getElementById("tab-q-area").style.display =
    t==="q" ? "block" : "none";
  document.getElementById("tab-a-area").style.display =
    t==="a" ? "block" : "none";

  document.getElementById("tab-q").classList.toggle("active", t==="q");
  document.getElementById("tab-a").classList.toggle("active", t==="a");

  if(t==="a") startAnswerListener();
}

/* =====================
   問題選択（画像どおり）
===================== */
async function loadQuestions(){
  const snap = await getDocs(collection(db,"questions"));
  let html = "";
  let index = 1;

  snap.forEach(docSnap=>{
    const d = docSnap.data();
    html += `
      <div class="q-card" data-no="${String(index).padStart(2,"0")}">
        ${d.text}
      </div>
    `;
    index++;
  });

  document.getElementById("questionList").innerHTML = html;

  snap.forEach((docSnap,i)=>{
    const id = docSnap.id.replace("q","");
    document.querySelectorAll(".q-card")[i].onclick = ()=>{
      setDoc(doc(db,"game","state"),{
        questionId: Number(id),
        mode: "question",
        acceptingAnswers: false
      },{ merge:true });
    };
  });
}

/* =====================
   UI更新
===================== */
function updateUI(s){

  setMode("btnJoin",     s.mode==="join");
  setMode("btnWait",     s.mode==="waiting");
  setMode("btnRanking",  s.mode==="ranking");
  setMode("btnAnswer",   s.mode==="answer");
  setMode("btnQuestion", s.mode==="question");

  const toggle = document.getElementById("btnToggle");
  toggle.classList.toggle("on", s.acceptingAnswers);
}

function setMode(id, active){
  document.getElementById(id).classList.toggle("active", active);
}

/* =====================
   ボタン操作
===================== */
document.getElementById("btnJoin").onclick =
  ()=>setDoc(doc(db,"game","state"),{ mode:"join" },{ merge:true });

document.getElementById("btnWait").onclick =
  ()=>setDoc(doc(db,"game","state"),{ mode:"waiting" },{ merge:true });

document.getElementById("btnRanking").onclick =
  ()=>setDoc(doc(db,"game","state"),{ mode:"ranking" },{ merge:true });

document.getElementById("btnAnswer").onclick =
  ()=>setDoc(doc(db,"game","state"),{ mode:"answer" },{ merge:true });

document.getElementById("btnQuestion").onclick =
  ()=>setDoc(doc(db,"game","state"),{ mode:"question" },{ merge:true });

document.getElementById("btnToggle").onclick =
  ()=>setDoc(doc(db,"game","state"),
    { acceptingAnswers: !state.acceptingAnswers },
    { merge:true });

document.querySelector(".reset").onclick = ()=>{
  setDoc(doc(db,"game","state"),{
    mode:"waiting",
    questionId:null,
    acceptingAnswers:false,
    eventId: Date.now().toString()
  });
  currentTab="q";
  showTab("q");
};

/* =====================
   Firestore監視
===================== */
onSnapshot(doc(db,"game","state"), snap=>{
  if(!snap.exists()) return;
  state = snap.data();
  updateUI(state);

  if(currentTab==="a"){
    startAnswerListener();
  }
});

/* =====================
   初期処理
===================== */
loadQuestions();