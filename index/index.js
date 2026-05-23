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
let lastQ = null;
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

  /* ✅ 超重要：イベント保存 */
  localStorage.setItem("eventId", currentState.eventId);
  savedEventId = currentState.eventId;

  show("wait");
};

/* ======================
   問題描画
====================== */
function render(q, showAnswer){

  document.getElementById("q").innerText = q.text;

  const img = document.getElementById("qImg");
  if(q.image){
    img.src = q.image;
    img.style.display = "block";
  }else{
    img.style.display = "none";
  }

  const choicesEl = document.getElementById("choices");
  choicesEl.innerHTML = "";

  const label = ["①","②","③","④"];

  q.choices.forEach((c,i)=>{
    const div = document.createElement("div");

    let cls = "choice c" + i;

    const clickable =
      currentState.acceptingAnswers &&
      !showAnswer &&
      !hasAnswered;

    if(!showAnswer && myChoice !== null){
      if(i === myChoice){
        cls += " selected";
      }else{
        cls += " dim";
      }
    }

    if(!clickable) cls += " disabled";

    div.className = cls;
    div.innerHTML = `${label[i]}<br>${c}`;

    if(clickable){
      div.onclick = ()=> answer(i);
    }

    choicesEl.appendChild(div);
  });
}

/* ======================
   得点
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
   状態監視（最重要）
====================== */
onSnapshot(doc(db,"game","state"), async snap=>{
  if(!snap.exists()) return;

  currentState = snap.data();

  /* ✅ 未参加 */
  if(!userId){

    if(currentState.mode === "join"){
      show("join");
    }else{
      show("blocked");   // ✅ 出るようになる
    }

    return;
  }

  /* ✅ イベント違い → 強制退出 */
  if(savedEventId !== currentState.eventId){

    localStorage.removeItem("userId");
    localStorage.removeItem("eventId");

    userId = null;
    savedEventId = null;

    show("blocked");   // ✅ ここ重要
    return;
  }

  /* ✅ 通常遷移 */

  if(currentState.mode === "waiting"){
    show("wait");
    return;
  }

  if(currentState.mode === "question"){
    show("quiz");

    const qSnap = await getDoc(doc(db,"questions","q"+currentState.questionId));
    if(!qSnap.exists()) return;

    myChoice = null;
    hasAnswered = false;

    render(qSnap.data(), false);
    return;
  }

  if(currentState.mode === "answer"){
    show("quiz");

    const qSnap = await getDoc(doc(db,"questions","q"+currentState.questionId));
    if(!qSnap.exists()) return;

    const q = qSnap.data();

    render(q,true);

    document.getElementById("result").innerText =
      (myChoice === q.answer) ? "正解" : "不正解";

    document.getElementById("answerText").innerText =
      "正解は " + (q.answer + 1);

    await addScore();

    const pSnap = await getDoc(doc(db,"players",userId));
    document.getElementById("scoreText").innerText =
      "スコア: " + (pSnap.data()?.score || 0);

    return;
  }

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

  const q = qSnap.data();
  render(q,false);

  await setDoc(
    doc(db,"answers","q"+currentState.questionId,"users",userId),
    {
      choice: i,
      eventId: currentState.eventId,
      answered: true,
      scored: (i === q.answer),
      answeredAt: Date.now()
    },
    { merge:true }
  );
};