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
   state（admin側）
===================================================== */
let state = {
  mode: "waiting",
  questionId: null,
  acceptingAnswers: false,
  eventId: null
};

let currentTab = "q";
let unsubscribeAnswers = null;

/* =====================================================
   タブ切替
===================================================== */
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
    startAnswerListener();
  }
}

/* =====================================================
   参加人数（players 基準）
===================================================== */
onSnapshot(collection(db,"players"), snap=>{
  if(!state.eventId){
    document.getElementById("playerCount").innerText="参加人数：0人";
    return;
  }

  let count = 0;
  snap.forEach(d=>{
    if(d.data().eventId === state.eventId){
      count++;
    }
  });

  document.getElementById("playerCount").innerText =
    `参加人数：${count}人`;
});

/* =====================================================
   回答状況（問題別）
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
          ${answered}人が回答済み
        </div>
      </div>
      <div class="answer-table">
    `;

    q.choices.forEach((t,i)=>{
      html += `
        <div class="answer-row">
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
   ✅ ランキング生成（scored === true を集計）
===================================================== */
async function buildAndSaveRanking(){

  if(!state.eventId) return;

  const scoreMap = new Map();

  // ✅ answers を直接走査せず、questions を基準にする
  const questionSnap = await getDocs(collection(db,"questions"));

  for(const qDoc of questionSnap.docs){

    const qId = qDoc.id; // 例: "q1"
    const usersSnap = await getDocs(
      collection(db,"answers", qId, "users")
    );

    usersSnap.forEach(u=>{
      const a = u.data();

      if(a.eventId !== state.eventId) return;
      if(a.scored !== true) return;   // ✅ index 側が書いた scored を信頼

      const cur = scoreMap.get(u.id) || {
        userId: u.id,
        score: 0
      };

      cur.score++;
      scoreMap.set(u.id, cur);
    });
  }

  // ✅ players から名前を補完
  const result = [];
  for(const [userId, r] of scoreMap.entries()){
    const pSnap = await getDoc(doc(db,"players", userId));
    if(!pSnap.exists()) continue;

    result.push({
      userId,
      name: pSnap.data().name,
      score: r.score
    });
  }

  result.sort((a,b)=>b.score - a.score);

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
  const snap = await getDoc(doc(db,"ranking","current"));
  if(!snap.exists()) return;

  const r = snap.data();
  if(r.eventId !== state.eventId) return;

  let html = `<div class="ranking-list">`;
  r.top10.forEach((p,i)=>{
    html += `
      <div class="ranking-row">
        <div class="rank">${i+1}位</div>
        <div class="rank-name">${p.name}</div>
        <div class="rank-score">${p.score}点</div>
      </div>
    `;
  });
  html += `</div>`;

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
    };
  });
}

/* =====================================================
   UI更新
===================================================== */
function updateUI(s){
  state = s;

  setActive("btnJoin",     s.mode==="join");
  setActive("btnWait",     s.mode==="waiting");
  setActive("btnAnswer",   s.mode==="answer");
  setActive("btnRanking",  s.mode==="ranking");

  setActive("btnQuestion", s.questionId !== null);

  const chk   = document.querySelector(".toggle-check");
  const title = document.querySelector(".toggle-title");
  const sub   = document.querySelector(".toggle-sub");

  if(s.acceptingAnswers){
    chk.className = "toggle-check on";
    chk.textContent = "✓";
    title.textContent = "回答：ON";
    sub.textContent   = "回答を受け付けています";
  }else{
    chk.className = "toggle-check off";
    chk.textContent = "✕";
    title.textContent = "回答：OFF";
    sub.textContent   = "回答を受け付けていません";
  }
}

function setActive(id,on){
  document.getElementById(id).classList.toggle("active",on);
}

/* =====================================================
   進行ボタン操作
===================================================== */
function clearAndSet(mode){
  setDoc(doc(db,"game","state"),{
    mode,
    questionId:null,
    acceptingAnswers:false
  },{ merge:true });
}

document.getElementById("btnJoin").onclick = ()=>clearAndSet("join");
document.getElementById("btnWait").onclick = ()=>clearAndSet("waiting");

document.getElementById("btnAnswer").onclick =
  ()=>setDoc(doc(db,"game","state"),{
    mode:"answer",
    acceptingAnswers:true
  },{ merge:true });

document.getElementById("btnRanking").onclick = async ()=>{
  await buildAndSaveRanking();
  await setDoc(doc(db,"game","state"),{ mode:"ranking" },{ merge:true });
  await showRanking();
};

/* =====================================================
   トグル（Firestore値のみ反転）
===================================================== */
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
   Firestore state 監視
===================================================== */
onSnapshot(doc(db,"game","state"), snap=>{
  if(!snap.exists()) return;

  updateUI(snap.data());

  if(state.mode==="ranking"){
    showRanking();
  }

  if(currentTab==="a"){
    startAnswerListener();
  }
});

/* =====================================================
   初期処理
===================================================== */
loadQuestions();
showTab("q");