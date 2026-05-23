import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =====================================================
   Firebase 初期化
===================================================== */
const db = getFirestore(initializeApp({
  apiKey: "AIzaSy...",
  authDomain: "quiz-app-97d7c.firebaseapp.com",
  projectId: "quiz-app-97d7c"
}));

/* =====================================================
   ローカル状態
===================================================== */
let userId = localStorage.getItem("userId");
let myChoice = null;
let lastQ = null;

/* index 側が信じる最新 game/state */
let currentState = null;

/* 二重回答防止 */
let hasAnswered = false;

/* =====================================================
   画面切替
===================================================== */
function show(id){
  ["join","wait","quiz","blocked","ranking"].forEach(x=>{
    document.getElementById(x).style.display = "none";
  });
  document.getElementById(id).style.display = "block";
}

/* =====================================================
   ユーザー検証（eventId 一致必須）
===================================================== */
async function validateUser(){
  if(!userId || !currentState) return false;

  const userSnap = await getDoc(doc(db,"players",userId));
  if(!userSnap.exists()){
    localStorage.removeItem("userId");
    userId = null;
    return false;
  }

  if(userSnap.data().eventId !== currentState.eventId){
    localStorage.removeItem("userId");
    userId = null;
    return false;
  }

  return true;
}

/* =====================================================
   参加処理
===================================================== */
document.getElementById("btnJoin").onclick = async ()=>{
  if(!currentState) return;
  if(currentState.mode === "waiting" || currentState.mode === "ranking") return;

  const name = document.getElementById("name").value;
  if(!name) return;

  const ref = await addDoc(collection(db,"players"),{
    name,
    score: 0,
    eventId: currentState.eventId
  });

  userId = ref.id;
  localStorage.setItem("userId", userId);
  show("wait");
};

/* =====================================================
   得点加算（answer モード時・scored 基準）
===================================================== */
async function addScore(){
  const aRef = doc(db,"answers","q"+currentState.questionId,"users",userId);
  const aSnap = await getDoc(aRef);
  if(!aSnap.exists()) return;

  const a = aSnap.data();

  /* 正解していない or 既に加点済みなら何もしない */
  if(a.scored !== true) return;
  if(a.scoreAdded === true) return;

  const pRef = doc(db,"players",userId);
  const pSnap = await getDoc(pRef);
  const score = pSnap.data().score || 0;

  await setDoc(pRef,{ score: score + 1 },{ merge:true });
  await setDoc(aRef,{ scoreAdded:true },{ merge:true });
}

/* =====================================================
   問題描画
===================================================== */
function render(q, showAnswer){

  document.getElementById("q").innerText = q.text;

  const img = document.getElementById("qImg");
  if(q.image){
    img.src = q.image;
    img.style.display = "block";
  }else{
    img.style.display = "none";
  }

  let html = "";
  const label = ["①","②","③","④"];

  q.choices.forEach((c,i)=>{
    let cls = "choice c" + i;

    if(showAnswer){
      if(i === q.answer) cls += " answer-correct";
      else cls += " dim";
    }

    if(!showAnswer && myChoice !== null && i !== myChoice){
      cls += " dim";
    }

    if(i === myChoice){
      cls += " selected";
    }

    const clickable =
      currentState.acceptingAnswers &&
      !showAnswer &&
      !hasAnswered;

    const click = clickable ? `onclick="answer(${i})"` : "";

    if(!clickable){
      cls += " disabled";
    }

    html += `
      <div class="${cls}" ${click}>
        ${label[i]}<br>${c}
      </div>
    `;
  });

  document.getElementById("choices").innerHTML = html;
}

/* =====================================================
   game/state 監視
===================================================== */
onSnapshot(doc(db,"game","state"), async snap=>{
  if(!snap.exists()) return;

  currentState = snap.data();

  const valid = await validateUser();

  /* 問題が変わったら状態リセット */
  if(currentState.questionId !== lastQ){
    lastQ = currentState.questionId;
    myChoice = null;
    hasAnswered = false;
    document.getElementById("result").innerText = "";
    document.getElementById("answerText").innerText = "";
    document.getElementById("scoreText").innerText = "";
  }

  if(!valid){
    if(currentState.mode === "join") show("join");
    else show("blocked");
    return;
  }

  if(currentState.mode === "waiting"){
    show("wait");
    return;
  }

  const qSnap = await getDoc(
    doc(db,"questions","q"+currentState.questionId)
  );
  if(!qSnap.exists()) return;
  const q = qSnap.data();

  /* 問題表示 */
  if(currentState.mode === "question"){
    show("quiz");
    render(q,false);
  }

  /* 正解表示 */
  if(currentState.mode === "answer"){
    show("quiz");
    render(q,true);

    document.getElementById("result").innerText =
      (myChoice === q.answer) ? "正解" : "不正解";

    document.getElementById("answerText").innerText =
      "正解は " + (Number(q.answer) + 1);

    await addScore();

    const p = (await getDoc(doc(db,"players",userId))).data();
    document.getElementById("scoreText").innerText =
      "スコア: " + p.score;
  }

  /* ランキング表示 */
  if(currentState.mode === "ranking"){
    show("ranking");

    const snapRank = await getDoc(doc(db,"ranking","current"));
    if(!snapRank.exists()){
      document.getElementById("rankList").innerText = "ランキングデータなし";
      return;
    }

    let html = "";
    snapRank.data().top10.forEach((p,i)=>{
      let cls = "rank normal";
      if(i === 0) cls = "rank top1";
      else if(i === 1) cls = "rank top2";
      else if(i === 2) cls = "rank top3";

      html += `
        <div class="${cls}">
          ${i+1}位 ${p.name} ${p.score}点
        </div>
      `;
    });

    document.getElementById("rankList").innerHTML = html;
  }
});

/* =====================================================
   回答（1回のみ・正誤判定して scored を保存）
===================================================== */
window.answer = async (i)=>{
  if(!currentState || !currentState.acceptingAnswers) return;
  if(hasAnswered) return;

  hasAnswered = true;
  myChoice = i;

  const qSnap = await getDoc(
    doc(db,"questions","q"+currentState.questionId)
  );
  if(!qSnap.exists()) return;
  const q = qSnap.data();

  render(q,false);

  const isCorrect = (i === q.answer);

  await setDoc(
    doc(db,"answers","q"+currentState.questionId,"users",userId),
    {
      choice: i,
      eventId: currentState.eventId,
      answered: true,
      scored: isCorrect,     // ✅ 正誤判定結果をここで保存
      answeredAt: Date.now()
    },
    { merge:true }
  );
};