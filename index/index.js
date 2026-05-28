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
     画像
  ====================== */
  const img = document.getElementById("qImg");
  if(img){
    if(q.image){
      img.onload = () => {
        img.style.display = "block";
      };

      img.onerror = () => {
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
     選択肢コンテナ
  ====================== */
  const choicesEl = document.getElementById("choices");
  choicesEl.innerHTML = "";

  // ✅ 2択かどうかでクラス切り替え
  if(q.choices.length === 2){
    choicesEl.classList.add("two");
    choicesEl.style.gridTemplateColumns = "1fr";        // ← 縦並び
  }else{
    choicesEl.classList.remove("two");
    choicesEl.style.gridTemplateColumns = "1fr 1fr";    // ← 2×2
  }

  const labels = ["①","②","③","④"];

  /* ======================
     選択肢生成
  ====================== */
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

async function loadQuestionData(s){

  const qRef = doc(db, "questions", "q" + s.questionId);
  const aRef = doc(db, "answers", "q" + s.questionId, "users", userId);

  const [qSnap, aSnap] = await Promise.all([
    getDoc(qRef),
    getDoc(aRef)
  ]);

  if (!qSnap.exists()) return;
  const q = qSnap.data();

  /* ======================
     ✅ 問題切り替え時リセット
  ====================== */
  if (s.questionId !== lastQuestionId) {
    myChoice = null;
    hasAnswered = false;
    lastQuestionId = s.questionId;
  }

  /* ======================
     ✅ 回答の復元（eventId完全対応）
  ====================== */
  if (aSnap.exists() && aSnap.data().eventId === s.eventId) {
    myChoice = aSnap.data().choice;
    hasAnswered = true;
  } else {
    // ✅ ここが重要（必ず両方リセット）
    myChoice = null;
    hasAnswered = false;
  }

  /* ======================
     ✅ 前の結果UIを消す（重要）
  ====================== */
  const resultBox = document.getElementById("answerResult");
  if (resultBox) resultBox.style.display = "none";

  /* ======================
     ✅ 描画
  ====================== */
  render(q, false);
}

async function loadAnswerData(s){

  const qRef = doc(db, "questions", "q" + s.questionId);
  const aRef = doc(db, "answers", "q" + s.questionId, "users", userId);
  const pRef = doc(db, "players", userId); // ✅ 追加（スコア用）

  const [qSnap, aSnap] = await Promise.all([
    getDoc(qRef),
    getDoc(aRef)
  ]);

  if (!qSnap.exists()) return;
  const q = qSnap.data();

  /* ======================
     ✅ 回答の復元（eventId対応）
  ====================== */
  if (aSnap.exists() && aSnap.data().eventId === s.eventId) {
    myChoice = aSnap.data().choice;
    hasAnswered = true;
  } else {
    myChoice = null;
    hasAnswered = false;
  }

  /* ======================
     ✅ 描画
  ====================== */
  render(q, true);

  /* ======================
     ✅ 結果UI表示
  ====================== */
  const resultBox = document.getElementById("answerResult");
  if (resultBox) resultBox.style.display = "block";

  const correct = myChoice === q.answer;

  const resultText = document.getElementById("resultText");
  resultText.textContent = correct ? "正解！" : "不正解";
  resultText.className =
    "result-text " + (correct ? "correct" : "wrong");

  document.getElementById("myAnswer").textContent =
    myChoice !== null ? q.choices[myChoice] : "未回答";

  document.getElementById("correctAnswer").textContent =
    q.choices[q.answer];

  /* ======================
     ✅ スコア即更新（これが超重要）
  ====================== */
  try {
    const pSnap = await getDoc(pRef);

    if (pSnap.exists() && pSnap.data().eventId === s.eventId) {
      const scoreEl = document.getElementById("score");
      if (scoreEl) {
        scoreEl.textContent = pSnap.data().score ?? 0;
      }
    }
  } catch (e) {
    console.error("score fetch error", e);
  }

  /* ======================
     ✅ 遅延対策（保険）
  ====================== */
  setTimeout(async () => {
    const pSnap2 = await getDoc(pRef);
    if (pSnap2.exists()) {
      const scoreEl = document.getElementById("score");
      if (scoreEl) {
        scoreEl.textContent = pSnap2.data().score ?? 0;
      }
    }
  }, 200);
}

let lastEventId = savedEventId; // ✅ 追加

onSnapshot(stateRef, (snap) => {

  /* ======================
     state が無ければ初期化
  ====================== */
  if (!snap.exists()) {
    setDoc(stateRef, {
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
     ✅ 新イベント検知（ここが最重要）
  ====================== */
  if (lastEventId && lastEventId !== s.eventId) {

    // ✅ ローカル状態リセット
    myChoice = null;
    hasAnswered = false;
    lastQuestionId = null;

    // ✅ UIリセット
    const scoreEl = document.getElementById("score");
    if (scoreEl) scoreEl.textContent = "0";

    const resultBox = document.getElementById("answerResult");
    if (resultBox) resultBox.style.display = "none";
  }
  lastEventId = s.eventId;

  /* ======================
     ✅ 自分のスコア監視
  ====================== */
  if (userId && !unsubscribePlayerScore) {
    unsubscribePlayerScore = onSnapshot(
      doc(db, "players", userId),
      snapPlayer => {
        if (!snapPlayer.exists()) return;

        // ✅ eventId一致チェック（重要）
        if (snapPlayer.data().eventId !== s.eventId) return;

        const score = snapPlayer.data().score ?? 0;

        const scoreEl = document.getElementById("score");
        if (scoreEl) scoreEl.textContent = score;
      }
    );
  }

  /* ======================
     ✅ 解答受付ON/OFFの即反映
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
     ✅ 未参加ユーザー
  ====================== */
  if (!userId) {
    show(s.mode === "join" ? "join" : "blocked");
    return;
  }

  /* ======================
     ✅ ranking監視解除
  ====================== */
  if (s.mode !== "ranking" && unsubscribeRanking) {
    unsubscribeRanking();
    unsubscribeRanking = null;
  }

  /* ======================
     ✅ 参加受付
  ====================== */
  if (s.mode === "join") {
    show("join");
    return;
  }

  /* ======================
     ✅ 待機
  ====================== */
  if (s.mode === "waiting") {
    show("wait");
    return;
  }

  /* ======================
     ✅ 問題表示（爆速）
  ====================== */
  if (s.mode === "question") {
    show("quiz");

    // ✅ 結果UIを必ず消す（これが最重要）
    const resultBox = document.getElementById("answerResult");
    if (resultBox) resultBox.style.display = "none";

    document.getElementById("choices").innerHTML =
      "<div style='text-align:center;color:#888;'>問題を読み込み中…</div>";

    document.getElementById("q").textContent = "";
    document.getElementById("quizStatus").textContent = "";

    loadQuestionData(s);

    return;
  }

  /* ======================
     ✅ 回答結果（爆速）
  ====================== */
  if (s.mode === "answer") {
    show("quiz");

    const resultBox = document.getElementById("answerResult");
    if (resultBox) resultBox.style.display = "none";

    document.getElementById("choices").innerHTML =
      "<div style='text-align:center;color:#888;'>結果を読み込み中…</div>";

    loadAnswerData(s);

    return;
  }

  /* ======================
     ✅ ランキング
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

        const r = snapRank.data();

        // ✅ eventId一致チェック（重要）
        if (r.eventId !== s.eventId) return;

        let html = "";

        r.top10.forEach((p, i) => {
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
     fallback
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

  render(q, false);

  const aRef = doc(
    db,
    "answers",
    "q" + currentState.questionId,
    "users",
    userId
  );

  const pRef = doc(db, "players", userId);

  /* ======================
     ✅ トランザクションで安全処理
  ====================== */
  await runTransaction(db, async (tx) => {

    const aDoc = await tx.get(aRef);

    // ✅ 既にスコア加算済みなら何もしない
    if (aDoc.exists() && aDoc.data().scoreAdded === true) {
      return;
    }

    // ✅ 回答保存
    tx.set(aRef, {
      choice: i,
      eventId: currentState.eventId,
      answered: true,
      scored: isCorrect,
      scoreAdded: isCorrect,  // ✅ 正解時のみtrue
      answeredAt: Date.now()
    }, { merge: true });

    // ✅ 正解なら1回だけ加算
    if (isCorrect) {
      tx.set(pRef, {
        score: increment(1)
      }, { merge: true });
    }
  });
};