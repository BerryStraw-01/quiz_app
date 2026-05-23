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

let currentState = null;
let myChoice = null;
let hasAnswered = false;
let lastQuestionId = null;

/* ✅ ランキング監視解除用 */
let unsubscribeRanking = null;

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

  /* ======================
     問題文
  ====================== */
  const qEl = document.getElementById("q");
  qEl.textContent = q.text ?? "";

  /* ======================
     画像（確実に表示 / 非表示）
  ====================== */
  const img = document.getElementById("qImg");
  if(img){
    if(q.image){
      img.onload = () => {
        img.style.display = "block";
      };

      img.onerror = () => {
        // ✅ 読み込み失敗時は完全に隠す
        img.style.display = "none";
        img.src = "";
      };

      img.src = q.image;
    }else{
      img.style.display = "none";
      img.src = "";
    }
  }

  /* ======================
     選択肢
  ====================== */
  const choicesEl = document.getElementById("choices");
  choicesEl.innerHTML = "";

  const labels = ["①","②","③","④"];

  q.choices.forEach((c,i)=>{
    const div = document.createElement("div");
    let cls = "choice c" + i;

    /* 表示ロジック */
    if(showAnswer){
      if(i === q.answer){
        cls += " correct";
      }else if(i === myChoice){
        cls += " selected";
      }else{
        cls += " dim";
      }
    }
    else if(currentState.acceptingAnswers === false){
      cls += " dim";
      if(i === myChoice){
        cls += " selected";
      }
    }
    else{
      if(i === myChoice){
        cls += " selected";
      }else if(myChoice !== null){
        cls += " dim";
      }
    }

    /* 押せるか */
    const clickable =
      currentState.mode === "question" &&
      currentState.acceptingAnswers === true &&
      !hasAnswered;

    if(!clickable){
      cls += " disabled";
    }

    div.className = cls;
    div.innerHTML = `${labels[i]}<br>${c}`;

    if(clickable){
      div.onclick = () => answer(i);
    }

    choicesEl.appendChild(div);
  });

  /* ======================
     状態表示
  ====================== */
  const status = document.getElementById("quizStatus");
  status.textContent = currentState.acceptingAnswers
    ? "回答受付中"
    : "回答受付終了";
}
``

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

  /* ランキング以外に移動したら監視解除 */
  if(currentState.mode !== "ranking" && unsubscribeRanking){
    unsubscribeRanking();
    unsubscribeRanking = null;
  }

  if(!userId){
    show(currentState.mode === "join" ? "join" : "blocked");
    return;
  }

  if(savedEventId !== currentState.eventId){
    localStorage.clear();
    userId = null;
    savedEventId = null;
    show("blocked");
    return;
  }

  if(currentState.mode === "waiting"){
    show("wait");
    return;
  }

  if(currentState.mode === "question"){
    show("quiz");

    // 問題データ取得
    const qSnap = await getDoc(
      doc(db, "questions", "q" + currentState.questionId)
    );
    if(!qSnap.exists()) return;
    const q = qSnap.data();

    /* ✅ 新しい問題のときだけ状態をリセット */
    if(currentState.questionId !== lastQuestionId){
      myChoice = null;
      hasAnswered = false;
      lastQuestionId = currentState.questionId;
    }

    /* ✅ 結果表示は必ず非表示に戻す */
    const resultBox = document.getElementById("answerResult");
    if(resultBox){
      resultBox.style.display = "none";

      // 中身も一度リセット（ゴースト防止）
      const resultText = document.getElementById("resultText");
      const myAnswerEl = document.getElementById("myAnswer");
      const correctAnswerEl = document.getElementById("correctAnswer");
      const scoreEl = document.getElementById("score");

      if(resultText) resultText.textContent = "";
      if(myAnswerEl) myAnswerEl.textContent = "";
      if(correctAnswerEl) correctAnswerEl.textContent = "";
      if(scoreEl) scoreEl.textContent = "";
    }

    /* ✅ 問題表示（解答前） */
    render(q, false);
    return;
  }

  if(currentState.mode === "answer"){
    show("quiz");

    const qRef = doc(db,"questions","q"+currentState.questionId);
    const aRef = doc(db,"answers","q"+currentState.questionId,"users",userId);

    const [qSnap, aSnap] = await Promise.all([
      getDoc(qRef),
      getDoc(aRef)
    ]);

    if(!qSnap.exists()) return;
    const q = qSnap.data();

    // 自分の回答を復元
    if(aSnap.exists()){
      myChoice = aSnap.data().choice;
      hasAnswered = true;
    }else{
      myChoice = null;
      hasAnswered = false;
    }

    lastQuestionId = currentState.questionId;

    // 選択肢表示（正解ハイライト）
    render(q, true);

    // スコア加算（1回だけ）
    await addScore();

    /* ✅ 結果UIに中身を書き込む（ここが今まで無かった） */
    const resultBox = document.getElementById("answerResult");
    if(resultBox){
      resultBox.style.display = "block";

      const resultText = document.getElementById("resultText");
      const myAnswerEl = document.getElementById("myAnswer");
      const correctAnswerEl = document.getElementById("correctAnswer");
      const scoreEl = document.getElementById("score");

      // 正解 / 不正解
      if(myChoice === q.answer){
        resultText.textContent = "正解！";
        resultText.className = "result-text correct";
      }else{
        resultText.textContent = "不正解";
        resultText.className = "result-text wrong";
      }

      // あなたの解答
      myAnswerEl.textContent =
        myChoice !== null ? q.choices[myChoice] : "未回答";

      // 正解
      correctAnswerEl.textContent = q.choices[q.answer];

      // スコア
      const pSnap = await getDoc(doc(db,"players",userId));
      scoreEl.textContent = pSnap.data()?.score ?? 0;
    }

    return;
  }

  /* ✅ ランキング（安定版） */
  if(currentState.mode === "ranking"){
    show("ranking");

    if(unsubscribeRanking) return;

    unsubscribeRanking = onSnapshot(
      doc(db,"ranking","current"),
      snapRank=>{
        const list = document.getElementById("rankList");
        if(!list) return;

        if(!snapRank.exists()){
          list.innerHTML = "<div style='text-align:center;color:#888;'>集計中…</div>";
          return;
        }

        let html = "";
        snapRank.data().top10.forEach((p,i)=>{
          const rankClass =
            i === 0 ? "rank1" :
            i === 1 ? "rank2" :
            i === 2 ? "rank3" : "";

          html += `
            <div class="rank-row ${rankClass}">
              <div class="rank-num">${i+1}位</div>
              <div class="rank-name">${p.name}</div>
              <div class="rank-score">${p.score}点</div>
            </div>
          `;
        });

        list.innerHTML = html;
      }
    );
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