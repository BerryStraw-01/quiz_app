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
  eventId: null
};

let currentTab = "q";
let unsubscribeAnswers = null;

/* ✅ 参加人数 */
let playerCount = 0;

/* =====================================================
   タブ切替（新構成）
===================================================== */
document.getElementById("tab-q").onclick = () => showTab("q");
document.getElementById("tab-status").onclick = () => showTab("status");

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
   状況描画（回答 or ランキング）
===================================================== */
function renderStatus(){

  if(state.mode === "ranking"){
    showRanking();
    return;
  }

  startAnswerListener();
}

/* =====================================================
   ✅ 参加人数（リアルタイム）
===================================================== */
onSnapshot(collection(db,"players"), snap=>{

  if(!state.eventId){
    playerCount = 0;
    document.getElementById("playerCount").innerText = "参加人数：0人";
    return;
  }

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
   ✅ 回答状況
===================================================== */
async function startAnswerListener(){

  // ✅ ランキング時は動かない
  if(state.mode === "ranking"){
    return;
  }

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
          ${answered}人回答済み / 参加者${playerCount}人
        </div>
      </div>

      <div class="answer-table">
    `;

    q.choices.forEach((t,i)=>{

      const isCorrect =
        (i === q.answer) && state.mode === "answer";

      const cls = isCorrect
        ? "answer-row correct"
        : "answer-row";

      html += `
        <div class="${cls}">
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
   ✅ ランキング生成
===================================================== */
async function buildAndSaveRanking(){

  const snap = await getDocs(collection(db,"players"));
  const result = [];

  snap.forEach(docSnap=>{
    const d = docSnap.data();

    if(d.eventId !== state.eventId) return;

    result.push({
      userId: docSnap.id,
      name: d.name,
      score: d.score || 0
    });
  });

  result.sort((a,b)=>b.score - a.score);

  await setDoc(doc(db,"ranking","current"),{
    eventId: state.eventId,
    updatedAt: serverTimestamp(),
    top10: result.slice(0,10)
  });
}

/* =====================================================
   ✅ ランキング表示
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

  const top10 = r.top10 || [];

  let html = `
    <div class="answer-info">
      <div class="answer-title">ランキング</div>
    </div>

    <div class="ranking-list">
  `;

  top10.forEach((p,i)=>{

    let cls = "ranking-row";

    // ✅ 1〜3位だけ少し強調
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
      const eid = state.eventId ?? Date.now().toString();

      await setDoc(doc(db,"game","state"),{
        mode:"question",
        questionId:qid,
        acceptingAnswers:false,
        eventId:eid
      },{ merge:true });

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

  setActive("btnJoin",    s.mode==="join");
  setActive("btnWait",    s.mode==="waiting");
  setActive("btnRanking", s.mode==="ranking");
  setActive("btnQuestion", s.questionId !== null);
  setActive("btnAnswer",   s.mode === "answer");

  const toggle = document.getElementById("btnToggle");
  const check  = document.querySelector(".toggle-check");
  const title  = document.querySelector(".toggle-title");
  const sub    = document.querySelector(".toggle-sub");

  if(s.acceptingAnswers){
    toggle.classList.add("on");
    check.className = "toggle-check on";
    title.textContent = "回答：ON";
    sub.textContent   = "回答を受け付けています";
  }else{
    toggle.classList.remove("on");
    check.className = "toggle-check off";
    title.textContent = "回答：OFF";
    sub.textContent   = "回答を受け付けていません";
  }
}

function setActive(id,on){
  document.getElementById(id).classList.toggle("active",on);
}

/* =====================================================
   進行
===================================================== */
function clearAndSet(mode){
  setDoc(doc(db,"game","state"),{
    mode,
    questionId:null,
    acceptingAnswers:false
  },{ merge:true });
}

document.getElementById("btnJoin").onclick = () => clearAndSet("join");
document.getElementById("btnWait").onclick = () => clearAndSet("waiting");

document.getElementById("btnAnswer").onclick =
  () => setDoc(doc(db,"game","state"),{
    mode:"answer",
    acceptingAnswers:false
  },{ merge:true });

document.getElementById("btnRanking").onclick = async ()=>{
  await buildAndSaveRanking();
  await setDoc(doc(db,"game","state"),{ mode:"ranking" },{ merge:true });

  // ✅ 状況タブが開いていれば即反映
  if(currentTab === "status"){
    showRanking();
  }
};

document.getElementById("btnToggle").onclick = async ()=>{
  const snap = await getDoc(doc(db,"game","state"));
  const cur = snap.data().acceptingAnswers;

  await setDoc(doc(db,"game","state"),{
    acceptingAnswers: !cur
  },{ merge:true });
};

/* =====================================================
   初期化
===================================================== */
document.querySelector(".reset").onclick = ()=>{
  setDoc(doc(db,"game","state"),{
    mode:"waiting",
    questionId:null,
    acceptingAnswers:false,
    eventId:Date.now().toString()
  });

  currentTab="q";
  showTab("q");
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