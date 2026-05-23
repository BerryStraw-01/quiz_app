import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =====================================================
   Firebase 初期化
===================================================== */
const app = initializeApp({
  apiKey:"AIzaSy...",
  authDomain:"quiz-app-97d7c.firebaseapp.com",
  projectId:"quiz-app-97d7c"
});
const db = getFirestore(app);

/* =====================================================
   state
===================================================== */
let state = {
  mode: "waiting",
  questionId: null,
  acceptingAnswers: false,
  eventId: Date.now().toString() // ✅ 初期イベント
};

let currentTab = "q";
let unsubscribeAnswers = null;
let playerCount = 0;

/* =====================================================
   ✅ state更新関数（核心）
===================================================== */
function updateState(data, newEvent=false){
  const newState = {
    ...data,
    eventId: newEvent ? Date.now().toString() : state.eventId
  };

  return setDoc(doc(db,"game","state"), newState, { merge:true });
}

/* =====================================================
   タブ切替
===================================================== */
document.getElementById("tab-q").onclick = ()=> showTab("q");
document.getElementById("tab-status").onclick = ()=> showTab("status");

function showTab(tab){
  currentTab = tab;

  document.getElementById("tab-q-area").style.display =
    tab === "q" ? "block" : "none";

  document.getElementById("tab-status-area").style.display =
    tab === "status" ? "block" : "none";

  document.getElementById("tab-q").classList.toggle("active", tab === "q");
  document.getElementById("tab-status").classList.toggle("active", tab === "status");

  if(tab === "status"){
    renderStatus();
  }
}

/* =====================================================
   参加人数
===================================================== */
onSnapshot(collection(db,"players"), snap=>{

  let count = 0;

  snap.forEach(d=>{
    if(d.data().eventId === state.eventId){
      count++;
    }
  });

  playerCount = count;

  document.getElementById("playerCount").innerText =
    `参加人数：${count}人`;
});

/* =====================================================
   状況描画
===================================================== */
function renderStatus(){
  if(state.mode === "ranking"){
    showRanking();
  }else{
    startAnswerListener();
  }
}

/* =====================================================
   回答状況
===================================================== */
async function startAnswerListener(){

  if(unsubscribeAnswers){
    unsubscribeAnswers();
    unsubscribeAnswers = null;
  }

  if(state.questionId === null){
    document.getElementById("answerStatus").innerHTML =
      "<div class='answer-info'>問題が選択されていません</div>";
    return;
  }

  const qSnap = await getDoc(doc(db,"questions","q"+state.questionId));
  if(!qSnap.exists()) return;
  const q = qSnap.data();

  const col = collection(db,"answers","q"+state.questionId,"users");

  unsubscribeAnswers = onSnapshot(col, snap=>{

    const count = Array(q.choices.length).fill(0);
    let answered = 0;

    snap.forEach(d=>{
      const a = d.data();

      if(a.eventId === state.eventId && typeof a.choice === "number"){
        answered++;
        count[a.choice]++;
      }
    });

    let html = `
      <div class="answer-info">
        <div class="answer-title">
          ${state.acceptingAnswers ? "回答受付中" : "回答結果"}
        </div>
        <div class="answer-sub">
          ${answered}人回答済み / ${playerCount}人
        </div>
      </div>

      <div class="answer-table">
    `;

    q.choices.forEach((t,i)=>{

      const isCorrect =
        (i === q.answer) && state.mode === "answer";

      html += `
        <div class="answer-row ${isCorrect ? "correct":""}">
          <div class="answer-no">${i+1}</div>
          <div class="answer-text">${t}</div>
          <div class="answer-count">${count[i]}人</div>
        </div>
      `;
    });

    html += "</div>";

    document.getElementById("answerStatus").innerHTML = html;
  });
}

/* =====================================================
   ランキング生成
===================================================== */
async function buildAndSaveRanking(){

  const snap = await getDocs(collection(db,"players"));
  const result = [];

  snap.forEach(docSnap=>{
    const d = docSnap.data();

    if(d.eventId !== state.eventId) return;

    result.push({
      name: d.name,
      score: d.score || 0
    });
  });

  result.sort((a,b)=> b.score - a.score);

  await setDoc(doc(db,"ranking","current"),{
    eventId: state.eventId,
    updatedAt: serverTimestamp(),
    top10: result.slice(0,10)
  });
}

/* =====================================================
   ランキング表示
===================================================== */
async function showRanking(){

  if(unsubscribeAnswers){
    unsubscribeAnswers();
    unsubscribeAnswers = null;
  }

  const snap = await getDoc(doc(db,"ranking","current"));
  if(!snap.exists()) return;

  const r = snap.data();
  if(r.eventId !== state.eventId) return;

  let html = `<div class="ranking-list">`;

  r.top10.forEach((p,i)=>{

    let cls = "ranking-row";
    if(i === 0) cls += " rank1";
    else if(i === 1) cls += " rank2";
    else if(i === 2) cls += " rank3";

    html += `
      <div class="${cls}">
        <div class="rank">${i+1}</div>
        <div class="rank-name">${p.name}</div>
        <div class="rank-score">${p.score}点</div>
      </div>
    `;
  });

  html += "</div>";

  document.getElementById("answerStatus").innerHTML = html;
}

/* =====================================================
   問題一覧
===================================================== */
async function loadQuestions(){

  const snap = await getDocs(collection(db,"questions"));

  let html = "";
  let i = 1;

  snap.forEach(ds=>{
    html += `
      <div class="q-card" data-id="${i}">
        ${ds.data().text}
      </div>
    `;
    i++;
  });

  document.getElementById("questionList").innerHTML = html;

  document.querySelectorAll(".q-card").forEach(card=>{
    card.onclick = async ()=>{
      const qid = Number(card.dataset.id);

      await updateState({
        mode:"question",
        questionId:qid,
        acceptingAnswers:false
      });

      document.querySelectorAll(".q-card")
        .forEach(c=>c.classList.remove("active"));

      card.classList.add("active");
    };
  });
}

/* =====================================================
   UI更新
===================================================== */
function updateUI(s){

  state = s;

  setActive("btnJoin", s.mode==="join");
  setActive("btnWait", s.mode==="waiting");
  setActive("btnRanking", s.mode==="ranking");
  setActive("btnQuestion", s.questionId !== null);
  setActive("btnAnswer", s.mode==="answer");

  const toggle = document.getElementById("btnToggle");
  const title  = document.querySelector(".toggle-title");
  const sub    = document.querySelector(".toggle-sub");

  if(s.acceptingAnswers){
    toggle.classList.add("on");
    title.textContent = "回答：ON";
    sub.textContent   = "回答を受け付けています";
  }else{
    toggle.classList.remove("on");
    title.textContent = "回答：OFF";
    sub.textContent   = "回答を受け付けていません";
  }
}

function setActive(id,on){
  document.getElementById(id).classList.toggle("active",on);
}

/* =====================================================
   ボタン処理（超重要）
===================================================== */

/* ✅ 新イベント開始 */
document.getElementById("btnJoin").onclick = ()=>{
  updateState({
    mode:"join",
    questionId:null,
    acceptingAnswers:false
  }, true);
};

document.getElementById("btnWait").onclick = ()=>{
  updateState({ mode:"waiting" });
};

document.getElementById("btnAnswer").onclick = ()=>{
  updateState({
    mode:"answer",
    acceptingAnswers:false
  });
};

document.getElementById("btnRanking").onclick = async ()=>{
  await buildAndSaveRanking();
  updateState({ mode:"ranking" });
};

/* toggle */
document.getElementById("btnToggle").onclick = async ()=>{
  const snap = await getDoc(doc(db,"game","state"));
  const cur = snap.data().acceptingAnswers;

  updateState({ acceptingAnswers: !cur });
};

/* リセット */
document.querySelector(".reset").onclick = ()=>{
  updateState({
    mode:"waiting",
    questionId:null,
    acceptingAnswers:false
  }, true);
};

/* =====================================================
   state監視
===================================================== */
onSnapshot(doc(db,"game","state"), snap=>{
  if(!snap.exists()) return;

  updateUI(snap.data());

  if(currentTab === "status"){
    renderStatus();
  }
});

/* =====================================================
   初期処理
===================================================== */
loadQuestions();
showTab("q");