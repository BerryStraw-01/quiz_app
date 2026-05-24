import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  increment,
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
   状態監視p.data()
====================== */
const stateRef = doc(db, "game", "state");

let unsubscribePlayerScore = null;

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
     state 取得
  ====================== */
  const s = snap.data();
  currentState = s;

  /* ======================
     ✅ 自分のスコアは常に監視（方法①の核心）
  ====================== */
  if (userId && !unsubscribePlayerScore) {
    unsubscribePlayerScore = onSnapshot(
      doc(db, "players", userId),
      snapPlayer => {
        if (!snapPlayer.exists()) return;
        const score = snapPlayer.data().score ?? 0;

        const scoreEl = document.getElementById("score");
        if (scoreEl) {
          scoreEl.textContent = score;
        }
      }
    );
  }

  /* ======================
     ✅ 解答ON/OFFだけは最優先で反映
  ====================== */
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
  if (savedEventId && savedEventId !== s.eventId) {
    localStorage.clear();
    userId = null;
    savedEventId = null;

    if (unsubscribePlayerScore) {
      unsubscribePlayerScore();
      unsubscribePlayerScore = null;
    }

    show("blocked");
    return;
  }

  /* ======================
     未参加ユーザー
  ====================== */
  if (!userId) {
    show(s.mode === "join" ? "join" : "blocked");
    return;
  }

  /* ======================
     ranking 監視解除
  ====================== */
  if (s.mode !== "ranking" && unsubscribeRanking) {
    unsubscribeRanking();
    unsubscribeRanking = null;
  }

  /* ======================
     待機
  ====================== */
  if (s.mode === "waiting") {
    show("wait");
    return;
  }

  /* ======================
     問題表示
  ====================== */
  if (s.mode === "question") {
    show("quiz");

    const qRef = doc(db, "questions", "q" + s.questionId);
    const aRef = doc(db, "answers", "q" + s.questionId, "users", userId);

    const [qSnap, aSnap] = await Promise.all([
      getDoc(qRef),
      getDoc(aRef)
    ]);

    if (!qSnap.exists()) return;
    const q = qSnap.data();

    if (s.questionId !== lastQuestionId) {
      myChoice = null;
      hasAnswered = false;
      lastQuestionId = s.questionId;
    }

    if (aSnap.exists() && aSnap.data().eventId === s.eventId) {
      myChoice = aSnap.data().choice;
      hasAnswered = true;
    }

    const resultBox = document.getElementById("answerResult");
    if (resultBox) resultBox.style.display = "none";

    render(q, false);
    return;
  }

  /* ======================
     回答結果
  ====================== */
  if (s.mode === "answer") {
    show("quiz");

    const qRef = doc(db, "questions", "q" + s.questionId);
    const aRef = doc(db, "answers", "q" + s.questionId, "users", userId);

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

    lastQuestionId = s.questionId;

    render(q, true);

    const resultBox = document.getElementById("answerResult");
    if (resultBox) {
      resultBox.style.display = "block";

      const correct = myChoice === q.answer;
      const resultText = document.getElementById("resultText");
      resultText.textContent = correct ? "正解！" : "不正解";
      resultText.className =
        "result-text " + (correct ? "correct" : "wrong");

      document.getElementById("myAnswer").textContent =
        myChoice !== null ? q.choices[myChoice] : "未回答";
      document.getElementById("correctAnswer").textContent =
        q.choices[q.answer];

      /* ✅ スコアはここでは読まない！
         → onSnapshot(players/{userId}) が更新する */
    }

    return;
  }

  /* ======================
     ランキング
  ====================== */
  if (s.mode === "ranking") {
    show("ranking");

    if (unsubscribeRanking) return;

    unsubscribeRanking = onSnapshot(
      doc(db, "ranking", "current"),
      snapRank => {
        const list = document.getElementById("rankList");
        if (!list) return;

        if (!snapRank.exists()) {
          list.innerHTML =
            "<div style='text-align:center;color:#888;'>集計中…</div>";
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
window.answer = async (i) => {
  if (hasAnswered) return;

  hasAnswered = true;
  myChoice = i;

  const qRef = doc(db, "questions", "q" + currentState.questionId);
  const qSnap = await getDoc(qRef);
  if (!qSnap.exists()) return;

  const q = qSnap.data();
  const isCorrect = (i === q.answer);

  // UI は即更新
  render(q, false);

  const aRef = doc(
    db,
    "answers",
    "q" + currentState.questionId,
    "users",
    userId
  );

  // ✅ 回答を保存
  await setDoc(
    aRef,
    {
      choice: i,
      eventId: currentState.eventId,
      answered: true,
      scored: isCorrect,
      scoreAdded: true,
      answeredAt: Date.now()
    },
    { merge: true }
  );

  // ✅ 正解ならスコアを即加算（ここが最重要）
  if (isCorrect) {
    const pRef = doc(db, "players", userId);

    await setDoc(
      pRef,
      {
        score: increment(1)   // ✅ 正しい書き方
      },
      { merge: true }
    );
  }
};