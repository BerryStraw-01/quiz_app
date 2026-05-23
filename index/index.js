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

/* ======================
   Firebase 初期化
====================== */
const db = getFirestore(initializeApp({
  apiKey: "AIzaSy...",
  authDomain: "quiz-app-97d7c.firebaseapp.com",
  projectId: "quiz-app-97d7c"
}));

/* ======================
   状態
====================== */
let userId = localStorage.getItem("userId");
let savedEventId = localStorage.getItem("eventId");

let myChoice = null;
let currentState = null;
let hasAnswered = false;

/* ======================
   画面切替
====================== */
function show(id){
  ["join","wait","quiz","blocked","ranking"].forEach(x=>{
    const el = document.getElementById(x);
    if(el) el.style.display = "none";
  });

  const target = document.getElementById(id);
  if(target) target.style.display = "block";
}

/* ======================
   参加
====================== */
document.getElementById("btnJoin").onclick = async ()=>{
  if(!currentState) return;

  const name = document.getElementById("name").value;
  if(!name) return;

  const ref = await addDoc(collection(db,"players"),{
    name,
    score: 0,
    eventId: currentState.eventId
  });

  userId = ref.id;
  localStorage.setItem("userId", userId);

  localStorage.setItem("eventId", currentState.eventId);
  savedEventId = currentState.eventId;

  show("wait");
};

/* ======================
   問題描画
====================== */
function render(q, showAnswer){

  /* 問題文 */
  document.getElementById("q").innerText = q.text;

  /* 画像（ある時だけ） */
  const img = document.getElementById("qImg");
  if(img){
    if(q.image){
      img.src = q.image;
      img.style.display = "block";
      img.oncontextmenu = ()=>false; // 保存禁止
    }else{
      img.style.display = "none";
    }
  }

  /* 選択肢 */
  const choicesEl = document.getElementById("choices");
  choicesEl.innerHTML = "";

  const labels = ["①","②","③","④"];

  q.choices.forEach((c,i)=>{
    const div = document.createElement("div");

    let cls = "choice c" + i;

    const clickable =
      currentState.acceptingAnswers &&
      !showAnswer &&
      !hasAnswered;

    /* ===== 表示ロジック ===== */
    /* ===== 表示ロジック（最終版） ===== */

    /* 解答表示 */
    if (showAnswer) {
      if (i === q.answer) {
        cls += " correct";     // ✅ 正解は必ず鮮やか
      } else if (i === myChoice) {
        cls += " selected";    // 選んだ不正解（黒枠＋薄い）
      } else {
        cls += " dim";
      }
    }

    /* 解答前 */
    else {
      if (i === myChoice) {
        cls += " selected";    // 黒枠＋薄い
      } else if (myChoice !== null) {
        cls += " dim";
      }
    }

    if(!clickable) cls += " disabled";

    div.className = cls;
    div.innerHTML = `${labels[i]}<br>${c}`;

    if(clickable){
      div.onclick = ()=> answer(i);
    }

    choicesEl.appendChild(div);
  });

  /* 状態表示 */
  const status = document.getElementById("quizStatus");
  status.innerText = currentState.acceptingAnswers
    ? "回答受付中"
    : "回答受付終了";
}

/* ======================
   得点加算
====================== */
async function addScore(){
  const aRef = doc(db,"answers","q"+currentState.questionId,"users",userId);
  const aSnap = await getDoc(aRef);
  if(!aSnap.exists()) return;

  const a = aSnap.data();
  if(!a.scored || a.scoreAdded) return;

  const pRef = doc(db,"players",userId);
  const pSnap = await getDoc(pRef);
  const current = pSnap.data()?.score || 0;

  await setDoc(pRef,{ score: current + 1 },{ merge:true });
  await setDoc(aRef,{ scoreAdded:true },{ merge:true });
}

/* ======================
   状態監視
====================== */
onSnapshot(doc(db,"game","state"), async snap=>{
  if(!snap.exists()) return;

  currentState = snap.data();

  /* 未参加 */
  if(!userId){
    show(currentState.mode === "join" ? "join" : "blocked");
    return;
  }

  /* イベント違い */
  if(savedEventId !== currentState.eventId){
    localStorage.clear();
    userId = null;
    savedEventId = null;
    show("blocked");
    return;
  }

  /* 待機 */
  if(currentState.mode === "waiting"){
    show("wait");
    return;
  }

  /* 問題 */
  if(currentState.mode === "question"){
    show("quiz");

    const qSnap = await getDoc(doc(db,"questions","q"+currentState.questionId));
    if(!qSnap.exists()) return;

    myChoice = null;
    hasAnswered = false;

    const resultBox = document.getElementById("answerResult");
    if(resultBox) resultBox.style.display = "none";

    render(qSnap.data(), false);
    return;
  }

  /* 解答表示 */
  if(currentState.mode === "answer"){
    show("quiz");

    const qSnap = await getDoc(doc(db,"questions","q"+currentState.questionId));
    if(!qSnap.exists()) return;

    const q = qSnap.data();
    render(q, true);

    await addScore();

    /* 結果UI */
    const resultBox = document.getElementById("answerResult");
    if(resultBox){
      resultBox.style.display = "block";

      const resultText = document.getElementById("resultText");
      const myAnswerEl = document.getElementById("myAnswer");
      const correctAnswerEl = document.getElementById("correctAnswer");
      const scoreEl = document.getElementById("score");

      if(myChoice === q.answer){
        resultText.innerText = "正解！";
        resultText.className = "result-text correct";
      }else{
        resultText.innerText = "不正解";
        resultText.className = "result-text wrong";
      }

      myAnswerEl.innerText = q.choices[myChoice] ?? "未回答";
      correctAnswerEl.innerText = q.choices[q.answer];

      const pSnap = await getDoc(doc(db,"players",userId));
      scoreEl.innerText = pSnap.data()?.score || 0;
    }

    return;
  }

  /* ランキング */
  if(currentState.mode === "ranking"){
    show("ranking");

    const snapRank = await getDoc(doc(db,"ranking","current"));
    if(!snapRank.exists()) return;

    let html = "";
    snapRank.data().top10.forEach((p,i)=>{
      html += `
        <div class="rank-row">
          <div class="rank-num">${i+1}位</div>
          <div class="rank-name">${p.name}</div>
          <div class="rank-score">${p.score}点</div>
        </div>
      `;
    });

    document.getElementById("rankList").innerHTML = html;
  }
});

/* ======================
   回答
====================== */
window.answer = async (i)=>{
  if(hasAnswered) return;

  hasAnswered = true;
  myChoice = i;

  const qSnap = await getDoc(doc(db,"questions","q"+currentState.questionId));
  if(!qSnap.exists()) return;

  render(qSnap.data(), false);

  await setDoc(
    doc(db,"answers","q"+currentState.questionId,"users",userId),
    {
      choice: i,
      eventId: currentState.eventId,
      answered: true,
      scored: (i === qSnap.data().answer),
      answeredAt: Date.now()
    },
    { merge:true }
  );
};