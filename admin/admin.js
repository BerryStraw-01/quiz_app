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
   表示用 state（唯一の真実）
===================== */
let state = {
  mode: "waiting",
  questionId: null,
  acceptingAnswers: false,
  eventId: null
};

let currentTab = "q";

/* =====================
   ✅ 参加人数（players リアルタイム）
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
    "参加人数：" + count + "人";
});

/* =====================
   回答リアルタイム購読
===================== */
let unsubscribeAnswers = null;

async function startAnswerListener(){

  // 既存の購読解除
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
    db,
    "answers",
    "q"+state.questionId,
    "users"
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

    // ===== ヘッダー + 選択肢表示 =====
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
        (state.mode==="answer" && i === q.answer);

      html += `
        <div class="answer-row ${isCorrect ? "correct" : ""}">
          <div class="col-check">${isCorrect ? "✅" : ""}</div>
          <div class="col-number">${i+1}.</div>
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
   タブ切替
===================== */
document.getElementById("tab-q").onclick = ()=>showTab("q");
document.getElementById("tab-a").onclick = ()=>showTab("a");

function showTab(t){
  currentTab = t;
  document.getElementById("tab-q-area").style.display =
    t==="q" ? "block" : "none";
  document.getElementById("tab-a-area").style.display =
    t==="a" ? "block" : "none";

  document.getElementById("tab-q")
    .classList.toggle("active",t==="q");
  document.getElementById("tab-a")
    .classList.toggle("active",t==="a");

  if(t==="a"){
    startAnswerListener();
  }
}

/* =====================
   問題一覧
===================== */
// 問題一覧生成部分のみ修正
async function loadQuestions(){
  const snap = await getDocs(collection(db,"questions"));
  let html="";
  snap.forEach(docSnap=>{
    const d = docSnap.data();
    html += `
      <div class="q-card inactive">
        ${d.text}
      </div>`;
  });
  document.getElementById("questionList").innerHTML = html;

  snap.forEach(docSnap=>{
    const id = docSnap.id.replace("q","");
    document.querySelectorAll(".q-card")[id-1].onclick = ()=>{
      setDoc(doc(db,"game","state"),{
        questionId: Number(id),
        mode: "question",
        acceptingAnswers: false
      },{ merge:true });
    };
  });
}

/* =====================
   UI 更新
===================== */
function updateUI(s){

  setBtn("btnJoin", s.mode==="join");
  setBtn("btnWait", s.mode==="waiting");
  setBtn("btnAnswer", s.mode==="answer");
  setBtn("btnRanking", s.mode==="ranking");

  document.querySelectorAll(".q-card").forEach(el=>{
    el.classList.remove("active");
    el.classList.add("inactive");
  });

  if(s.questionId !== null){
    const cur=document.getElementById("q"+s.questionId);
    if(cur){
      cur.classList.remove("inactive");
      cur.classList.add("active");
    }
  }

  const btn=document.getElementById("btnToggle");
  btn.className =
    s.acceptingAnswers ? "toggleActive" : "toggleInactive";
  btn.innerText =
    s.acceptingAnswers ? "回答：ON" : "回答：OFF";
}

function setBtn(id, active){
  const el=document.getElementById(id);
  el.classList.remove("active","inactive","gray");
  el.classList.add(active ? "active":"inactive");
}

/* =====================
   ボタン操作（Firestore直更新）
===================== */
document.getElementById("btnJoin").onclick =
  ()=>setDoc(doc(db,"game","state"),{ mode:"join" },{ merge:true });

document.getElementById("btnWait").onclick =
  ()=>setDoc(doc(db,"game","state"),{ mode:"waiting" },{ merge:true });

document.getElementById("btnAnswer").onclick =
  ()=>setDoc(doc(db,"game","state"),{ mode:"answer" },{ merge:true });

document.getElementById("btnRanking").onclick = async ()=>{
  const snap = await getDocs(collection(db,"players"));
  let arr=[];
  snap.forEach(d=>{
    if(d.data().eventId === state.eventId){
      arr.push(d.data());
    }
  });
  arr.sort((a,b)=>b.score-a.score);
  await setDoc(doc(db,"ranking","current"),
    { top10: arr.slice(0,10) });
  await setDoc(doc(db,"game","state"),
    { mode:"ranking" },{ merge:true });
};

document.getElementById("btnToggle").onclick =
  ()=>setDoc(doc(db,"game","state"),
    { acceptingAnswers: !state.acceptingAnswers },
    { merge:true }
  );

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
   Firestore state 監視（唯一）
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