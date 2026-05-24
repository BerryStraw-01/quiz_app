import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction
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

let lastAccepting = null;

/* ======================
   画面切替
====================== */
function show(id){
  ["loading","join","wait","quiz","blocked","ranking"].forEach(x=>{
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


  if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }

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
    : "回答受付していません";
}

/* ======================
   得点加算
====================== */
async function addScore(){
  const qid = currentState.questionId;

  const aRef = doc(db, "answers", "q" + qid, "users", userId);
  const pRef = doc(db, "players", userId);

  await runTransaction(db, async (tx) => {

    // 自分の回答を取得
    const aSnap = await tx.get(aRef);
    if(!aSnap.exists()) return;

    const a = aSnap.data();

    // ✅ 正解でない / すでに加算済み → 何もしない
    if(!a.scored || a.scoreAdded) return;

    // 現在のスコア取得
    const pSnap = await tx.get(pRef);
    const currentScore = pSnap.data()?.score || 0;

    // ✅ 得点を1加算
    tx.update(pRef, { score: currentScore + 1 });

    // ✅ 二重加算防止フラグ
    tx.update(aRef, { scoreAdded: true });
  });
}

/* ======================
   状態監視p.data()
====================== */
const stateRef = doc(db, "game", "state");

onSnapshot(stateRef, async (snap) => {

  /* ======================
     state が無ければ初期化
  ====================== */
  if (!snap.exists()) {
    await setDoc(stateRef, {
      mode: "waiting",
      questionId: null,
      acceptingAnswers: false,
      eventId: Date.now().toString()
    });
    return;
  }

  /* ======================
     state 取得（ここで loading 終了）
  ====================== */
  const s = snap.data();
  currentState = s;

  // ✅ 解答ON/OFFだけは最優先で反映
  if (lastAccepting !== null && lastAccepting !== s.acceptingAnswers) {
    const status = document.getElementById("quizStatus");
    if (status) {
      status.textContent = s.acceptingAnswers
        ? "回答受付中"
        : "回答受付していません";
    }
  }
  lastAccepting = s.acceptingAnswers;

  /* ======================
     イベント不一致チェック
  ====================== */
  if (savedEventId && savedEventId !== currentState.eventId) {
    localStorage.clear();
    userId = null;
    savedEventId = null;
    show("blocked");
    return;
  }

  /* ======================
     未参加ユーザー
  ====================== */
  if (!userId) {
    show(currentState.mode === "join" ? "join" : "blocked");
    return;
  }

  /* ======================
     ranking 監視解除
  ====================== */
  if (currentState.mode !== "ranking" && unsubscribeRanking) {
    unsubscribeRanking();
    unsubscribeRanking = null;
  }

  /* ======================
     待機
  ====================== */
  if (currentState.mode === "waiting") {
    show("wait");
    return;
  }

  /* ======================
     問題表示
  ====================== */
  if (currentState.mode === "question") {
    show("quiz");

    const qRef = doc(db, "questions", "q" + currentState.questionId);
    const aRef = doc(db, "answers", "q" + currentState.questionId, "users", userId);

    const [qSnap, aSnap] = await Promise.all([
      getDoc(qRef),
      getDoc(aRef)
    ]);

    if (!qSnap.exists()) return;
    const q = qSnap.data();

    // 新しい問題なら初期化
    if (currentState.questionId !== lastQuestionId) {
      myChoice = null;
      hasAnswered = false;
      lastQuestionId = currentState.questionId;
    }

    // 回答済みなら復元
    if (aSnap.exists() && aSnap.data().eventId === currentState.eventId) {
      myChoice = aSnap.data().choice;
      hasAnswered = true;
    }

    // 結果UIを隠す
    const resultBox = document.getElementById("answerResult");
    if (resultBox) resultBox.style.display = "none";

    render(q, false);
    return;
  }

  /* ======================
     回答結果
  ====================== */
  if (currentState.mode === "answer") {
    show("quiz");

    const qRef = doc(db, "questions", "q" + currentState.questionId);
    const aRef = doc(db, "answers", "q" + currentState.questionId, "users", userId);

    const [qSnap, aSnap] = await Promise.all([
      getDoc(qRef),
      getDoc(aRef)
    ]);

    if (!qSnap.exists()) return;
    const q = qSnap.data();

    if (aSnap.exists()) {
      myChoice = aSnap.data().choice;
      hasAnswered = true;
    } else {
      myChoice = null;
      hasAnswered = false;
    }

    lastQuestionId = currentState.questionId;

    render(q, true);

    // ✅ 得点加算（安全版）
    await addScore();

    const resultBox = document.getElementById("answerResult");
    if (resultBox) {
      resultBox.style.display = "block";

      const correct = myChoice === q.answer;
      const resultText = document.getElementById("resultText");
      resultText.textContent = correct ? "正解！" : "不正解";
      resultText.className = "result-text " + (correct ? "correct" : "wrong");

      document.getElementById("myAnswer").textContent =
        myChoice !== null ? q.choices[myChoice] : "未回答";
      document.getElementById("correctAnswer").textContent =
        q.choices[q.answer];

      const pSnap = await getDoc(doc(db, "players", userId));
      document.getElementById("score").textContent =
        pSnap.data()?.score ?? 0;
    }

    return;
  }

  /* ======================
     ランキング
  ====================== */
  if (currentState.mode === "ranking") {
    show("ranking");

    if (unsubscribeRanking) return;

    unsubscribeRanking = onSnapshot(
      doc(db, "ranking", "current"),
      snapRank => {
        const list = document.getElementById("rankList");
        if (!list) return;

        if (!snapRank.exists()) {
          list.innerHTML = "<div style='text-align:center;color:#888;'>集計中…</div>";
          return;
        }

        let html = "";
        snapRank.data().top10.forEach((p, i) => {
          const rankClass =
            i === 0 ? "rank1" :
            i === 1 ? "rank2" :
            i === 2 ? "rank3" : "";

          html += `
            <div class="rank-row ${rankClass}">
              <div class="rank-num">${i + 1}位</div>
              <div class="rank-name">${p.name}</div>
              <div class="rank-score">${p.score}点</div>
            </div>
          `;
        });

        list.innerHTML = html;
      }
    );
    return;
  }

  /* ======================
     想定外の mode
  ====================== */
  show("wait");
});

/* ======================
   回答
====================== */
window.answer = async (i)=>{


  // ✅ 押下時の触覚フィードバック
  if ("vibrate" in navigator) {
    navigator.vibrate(10);
  }

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

      // ✅ 正解かどうか
      scored: (i === qSnap.data().answer),

      // ✅ 初期状態では必ず false
      scoreAdded: false,

      answeredAt: Date.now()
    },
    { merge:true }
  );
};