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
   ✅ タブ切替（← これが無かった）
===================== */
document.getElementById("tab-q").onclick = () => showTab("q");
document.getElementById("tab-a").onclick = () => showTab("a");

function showTab(tab){
  currentTab = tab;

  document.getElementById("tab-q-area").style.display =
    tab === "q" ? "block" : "none";
  document.getElementById("tab-a-area").style.display =
    tab === "a" ? "block" : "none";

  document.getElementById("tab-q").classList.toggle("active", tab === "q");
  document.getElementById("tab-a").classList.toggle("active", tab === "a");

  if(tab === "a"){
    startAnswerListener();   // ← 回答状況を開いた瞬間に購読開始
  }
}

/* =====================
   参加人数
===================== */
let currentPlayerCount = 0;

onSnapshot(collection(db,"players"), snap=>{
  if(!state.eventId){
    currentPlayerCount = 0;
    document.getElementById("playerCount").innerText =
      "参加人数：0人";
    return;
  }

  let count = 0;
  snap.forEach(d=>{
    if(d.data().eventId === state.eventId){
      count++;
    }
  });

  currentPlayerCount = count;
  document.getElementById("playerCount").innerText =
    "参加人数：" + count + "人";
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

  if(!state.eventId || state.questionId === null){
    document.getElementById("answerStatus").innerHTML = "";
    return;
  }

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
          <div class="answer-no">${String(i+1).padStart(2,"0")}</div>
          <div class="answer-text">${text}</div>
          <div class="answer-count">👤 ${count[i]}人</div>
        </div>
      `;
    });

    html += `</div>`;
    document.getElementById("answerStatus").innerHTML = html;
  });
}

/* =====================
   問題選択
===================== */
async function loadQuestions(){
  const snap = await getDocs(collection(db,"questions"));
  let html = "";
  let index = 1;

  snap.forEach(docSnap=>{
    const d = docSnap.data();
    html += `
      <div class="q-card" data-no="${String(index).padStart(2,"0")}" data-id="${index}">
        ${d.text}
      </div>
    `;
    index++;
  });

  document.getElementById("questionList").innerHTML = html;

  document.querySelectorAll(".q-card").forEach(card=>{
    card.onclick = ()=>{
      const qid = Number(card.dataset.id);

      setDoc(doc(db,"game","state"),{
        questionId: qid,
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

  setMode("btnQuestion", s.mode==="question" && s.questionId !== null);
  document.getElementById("btnQuestion").disabled = true;

  const toggle = document.getElementById("btnToggle");
  const check  = document.querySelector(".toggle-check");
  const title  = document.querySelector(".toggle-title");
  const sub    = document.querySelector(".toggle-sub");

  if(s.acceptingAnswers){
    toggle.classList.add("on");
    check.textContent = "✓";
    check.className = "toggle-check on";
    title.textContent = "回答：ON";
    sub.textContent   = "回答を受け付けています";
  }else{
    toggle.classList.remove("on");
    check.textContent = "✕";
    check.className = "toggle-check off";
    title.textContent = "回答：OFF";
    sub.textContent   = "回答を受け付けていません";
  }

  document.querySelectorAll(".q-card").forEach(card=>{
    card.classList.toggle(
      "active",
      Number(card.dataset.id) === s.questionId
    );
  });
}

function setMode(id, active){
  document.getElementById(id).classList.toggle("active", active);
}

/* =====================
   ボタン操作
===================== */
function clearQuestionAndSetMode(newMode){
  setDoc(doc(db,"game","state"),{
    mode: newMode,
    questionId: null,
    acceptingAnswers: false
  },{ merge:true });
}

document.getElementById("btnJoin").onclick =
  ()=>clearQuestionAndSetMode("join");

document.getElementById("btnWait").onclick =
  ()=>clearQuestionAndSetMode("waiting");

document.getElementById("btnRanking").onclick =
  ()=>clearQuestionAndSetMode("ranking");

/* 解答ボタン */
document.getElementById("btnAnswer").onclick =
  ()=>setDoc(doc(db,"game","state"),{
    mode:"answer",
    questionId: state.questionId,
    acceptingAnswers:true
  },{ merge:true });

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
showTab("q");   // ← 初期表示