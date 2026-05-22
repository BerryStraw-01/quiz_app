import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, addDoc, collection, doc,
  getDoc, setDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* Firebase */
const db = getFirestore(initializeApp({
  apiKey:"AIzaSy...",
  authDomain:"quiz-app-97d7c.firebaseapp.com",
  projectId:"quiz-app-97d7c"
}));

let userId = localStorage.getItem("userId");
let myChoice = null;
let lastQ = null;

/* ✅ index側が信じる最新state（ここが核心） */
let currentState = null;

/* 画面切替 */
function show(id){
  ["join","wait","quiz","blocked","ranking"].forEach(x=>{
    document.getElementById(x).style.display="none";
  });
  document.getElementById(id).style.display="block";
}

/* ✅ ユーザー確認（eventId一致必須） */
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

/* ✅ 参加（即時反映対応） */
document.getElementById("btnJoin").onclick = async ()=>{
  if(!currentState) return;

  // ✅ 即時判定（Firestoreを待たない）
  if(currentState.mode === "waiting" || currentState.mode === "ranking") return;

  const name = document.getElementById("name").value;
  if(!name) return;

  const ref = await addDoc(collection(db,"players"),{
    name,
    score: 0,
    eventId: currentState.eventId
  });

  userId = ref.id;
  localStorage.setItem("userId",userId);
  show("wait");
};

/* 得点 */
async function addScore(q){
  const ref = doc(db,"answers","q"+currentState.questionId,"users",userId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;

  const data = snap.data();
  if(data.scored) return;
  if(data.choice !== q.answer) return;

  const pRef = doc(db,"players",userId);
  const pSnap = await getDoc(pRef);
  const score = pSnap.data().score || 0;

  await setDoc(pRef,{score:score+1},{merge:true});
  await setDoc(ref,{scored:true},{merge:true});
}

/* 描画 */
function render(q,showAnswer){

  document.getElementById("q").innerText = q.text;

  const img = document.getElementById("qImg");
  if(q.image){
    img.src = q.image;
    img.style.display = "block";
  }else{
    img.style.display = "none";
  }

  let html="";
  const label=["①","②","③","④"];

  q.choices.forEach((c,i)=>{
    let cls="choice c"+i;

    if(showAnswer){
      if(i===q.answer) cls+=" answer-correct";
      else cls+=" dim";
    }

    if(!showAnswer && myChoice!==null && i!==myChoice){
      cls+=" dim";
    }

    if(i===myChoice) cls+=" selected";

    const click = (currentState.acceptingAnswers && !showAnswer)
      ? `onclick="answer(${i})"` : "";

    if(!currentState.acceptingAnswers && !showAnswer){
      cls+=" disabled";
    }

    html+=`
      <div class="${cls}" ${click}>
        ${label[i]}<br>${c}
      </div>
    `;
  });

  document.getElementById("choices").innerHTML = html;
}

/* ✅ Firestore state 監視（indexの唯一の入口） */
onSnapshot(doc(db,"game","state"), async snap=>{
  if(!snap.exists()) return;

  currentState = snap.data();

  const valid = await validateUser();

  if(currentState.questionId !== lastQ){
    lastQ = currentState.questionId;
    myChoice = null;
    document.getElementById("result").innerText="";
    document.getElementById("answerText").innerText="";
    document.getElementById("scoreText").innerText="";
  }

  if(!valid){
    if(currentState.mode==="join") show("join");
    else show("blocked");
    return;
  }

  if(currentState.mode==="waiting"){
    show("wait");
    return;
  }

  const q = (await getDoc(
    doc(db,"questions","q"+currentState.questionId)
  )).data();

  if(currentState.mode==="question"){
    show("quiz");
    render(q,false);
  }

  if(currentState.mode==="answer"){
    show("quiz");
    render(q,true);

    document.getElementById("result").innerText =
      (myChoice===q.answer) ? "正解" : "不正解";

    document.getElementById("answerText").innerText =
      "正解は " + (Number(q.answer)+1);

    await addScore(q);

    const p = (await getDoc(doc(db,"players",userId))).data();
    document.getElementById("scoreText").innerText =
      "スコア: " + p.score;
  }

  if(currentState.mode==="ranking"){
    show("ranking");

    const snapRank = await getDoc(doc(db,"ranking","current"));
    if(!snapRank.exists()){
      document.getElementById("rankList").innerText="ランキングデータなし";
      return;
    }

    let html="";
    snapRank.data().top10.forEach((p,i)=>{
      let cls="rank normal";
      if(i===0) cls="rank top1";
      else if(i===1) cls="rank top2";
      else if(i===2) cls="rank top3";

      html+=`
        <div class="${cls}">
          ${i+1}位 ${p.name} ${p.score}点
        </div>
      `;
    });

    document.getElementById("rankList").innerHTML=html;
  }
});

/* 回答 */
window.answer = async (i)=>{
  if(!currentState || !currentState.acceptingAnswers) return;

  myChoice = i;

  const q = (await getDoc(
    doc(db,"questions","q"+currentState.questionId)
  )).data();

  render(q,false);

  await setDoc(
    doc(db,"answers","q"+currentState.questionId,"users",userId),
    {
      choice: i,
      scored: false,
      eventId: currentState.eventId
    }
  );
};