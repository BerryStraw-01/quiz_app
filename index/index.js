import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  addDoc,
  collection,
  doc,
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
let currentQuestion = null;

let myChoice = null;
let hasAnswered = false;
let lastQuestionId = null;

/* ✅ ここを追加（重要） */
let unsubscribeQuestion = null;
let unsubscribeAnswer = null;
let unsubscribeRanking = null;

function subscribeQuestion(s){

  if (unsubscribeQuestion) {
    unsubscribeQuestion();
    unsubscribeQuestion = null;
  }

  const questionId = s.questionId;
  const eventId = s.eventId;

  unsubscribeQuestion = onSnapshot(
    doc(db, "questions", "q" + questionId),
    snap => {

      if (!snap.exists()) return;

      // ✅ 完全ガード（超重要）
      if (!currentState) return;
      if (currentState.questionId !== questionId) return;
      if (currentState.eventId !== eventId) return;
      if (currentState.mode !== "question" && currentState.mode !== "answer") return;

      currentQuestion = snap.data();

      if (currentState.mode === "question") {
        render(currentQuestion, false);
      } else if (currentState.mode === "answer") {
        render(currentQuestion, true);
      }
    }
  );
}

function subscribeAnswer(s){

  if (!userId) return;

  if (unsubscribeAnswer) {
    unsubscribeAnswer();
    unsubscribeAnswer = null;
  }

  const questionId = s.questionId;
  const eventId = s.eventId;

  unsubscribeAnswer = onSnapshot(
    doc(db, "answers", "q" + questionId, "users", userId),
    snap => {

      if (!snap.exists()) return;

      // ✅ ガード
      if (!currentState) return;
      if (currentState.questionId !== questionId) return;
      if (currentState.eventId !== eventId) return;

      const data = snap.data();
      if (data.eventId !== eventId) return;

      myChoice = data.choice;
      hasAnswered = true;

      if (!currentQuestion) return;

      if (currentState.mode === "question") {
        render(currentQuestion, false);
      }

      if (currentState.mode === "answer") {
        render(currentQuestion, true);
      }
    }
  );
}

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
let isJoining = false; // ← 追加：ロックフラグ

document.getElementById("btnJoin").onclick = async () => {
  if (!currentState) return;
  if (isJoining) return; // ← 追加：二重実行ブロック

  const name = document.getElementById("name").value.trim();
  if (!name) return;

  // ── ここから即座にUIをロック ──
  isJoining = true;
  const btn = document.getElementById("btnJoin");
  btn.disabled = true;
  btn.textContent = "参加中…";

  try {
    const ref = await addDoc(collection(db, "players"), {
      name,
      score: 0,
      eventId: currentState.eventId
    });

    userId = ref.id;
    localStorage.setItem("userId", userId);
    localStorage.setItem("eventId", currentState.eventId);
    savedEventId = currentState.eventId;

    show("wait");

  } catch (e) {
    // ── 通信エラー時は復帰 ──
    console.error("参加エラー:", e);
    btn.disabled = false;
    btn.textContent = "参加する";
    isJoining = false;
  }
};

/* ======================
   問題描画
====================== */
function render(q, showAnswer){

  if (!showAnswer && !hasAnswered) {
    myChoice = null;
  }

  if(currentState.mode === "question"){
    if(!hasAnswered){
      myChoice = null;
    }
  }

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
  const type = q.type ?? q.choices.length; // ← 互換性確保

  if (type === "2") {
    choicesEl.classList.add("two");
    choicesEl.style.gridTemplateColumns = "1fr";
  } else {
    choicesEl.classList.remove("two");
    choicesEl.style.gridTemplateColumns = "1fr 1fr";
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
    // ✅ 古い文字配列と新しい object 両対応
    const choice =
      typeof c === "string"
        ? { text: c, image: null }
        : {
            text: c.text ?? "",      // ✅ text がなければ空文字
            image: c.image ?? null
          };

    let html = "";

    // ✅ 選択肢テキスト
    html += `
      <div class="choice-text">
        ${labels[i]}<br>${choice.text}
      </div>
    `;

    // ✅ 画像
    if (choice.image) {
      html += `<img class="choice-img" src="${choice.image}">`;
    }

    div.innerHTML = html;

    if(clickable){
      div.onclick = () => answer(i);
    }

    choicesEl.appendChild(div);
  });

  /* ======================
     状態表示
  ====================== */
  const status = document.getElementById("quizStatus");

  if (hasAnswered && currentState.mode === "question") {
    status.textContent = "回答済みです";
  } else if (currentState.acceptingAnswers) {
    status.textContent = "回答受付中";
  } else {
    status.textContent = "回答受付していません";
  }
}

/* ======================
   状態監視p.data()
====================== */
const stateRef = doc(db, "game", "state");

let unsubscribePlayerScore = null;

let lastEventId = savedEventId; // ✅ 追加

onSnapshot(stateRef, (snap) => {

  if (!snap.exists()) {
    setDoc(stateRef, {
      mode: "waiting",
      questionId: null,
      acceptingAnswers: false,
      eventId: crypto.randomUUID(),
      updatedAt: Date.now() // ✅ 追加
    });
    return;
  }

  const s = snap.data(); // ✅ ここが最初
  currentState = s;

  // ✅ モード変化で全部止める
  if (unsubscribeQuestion && s.mode !== "question") {
    unsubscribeQuestion();
    unsubscribeQuestion = null;
  }

  if (unsubscribeAnswer && s.mode !== "question" && s.mode !== "answer") {

    unsubscribeAnswer();
    unsubscribeAnswer = null;
  }

  if (unsubscribeRanking && s.mode !== "ranking") {
    unsubscribeRanking();
    unsubscribeRanking = null;
  }

  /* イベント切替 */
  if (savedEventId !== s.eventId) {
    myChoice = null;
    hasAnswered = false;
    lastQuestionId = null;
  }

  /* 未参加 */
  if (!userId || savedEventId !== s.eventId) {
    show(s.mode === "join" ? "join" : "blocked");
    return;
  }

  if (s.mode === "join") {
    show("wait");
    stopConfetti();
    return;
  }

  if (s.mode === "waiting") {
    show("wait");
    stopConfetti();
    return;
  }

  if (s.mode === "question") {

    show("quiz");
    stopConfetti();

    if (s.questionId !== lastQuestionId) {
      myChoice = null;
      hasAnswered = false;
      lastQuestionId = s.questionId;

      // ✅ 追加
      document.getElementById("answerResult").style.display = "none";
    }


    subscribeQuestion(s);
    subscribeAnswer(s);
    return;
  }

  if (s.mode === "answer") {

    show("quiz");

    if (currentQuestion) {
      render(currentQuestion, true);

      const judgeEl = document.getElementById("answerJudge");

      judgeEl.className = "answer-judge-global";
      judgeEl.style.display = "block";

      if (myChoice === currentQuestion.answer) {
        judgeEl.textContent = "正解";
        judgeEl.classList.add("correct");
      } else {
        judgeEl.textContent = "不正解";
        judgeEl.classList.add("wrong");
      }

      // ✅ ここ追加
      const labels = ["①","②","③","④"];

      document.getElementById("myAnswer").textContent =
        myChoice !== null ? labels[myChoice] : "-";

      document.getElementById("correctAnswer").textContent =
        labels[currentQuestion.answer];

      // ✅ 既存を止める
      if (unsubscribePlayerScore) {
        unsubscribePlayerScore();
        unsubscribePlayerScore = null;
      }

      unsubscribePlayerScore = onSnapshot(
        doc(db, "players", userId),
        snap => {
          if (snap.exists()) {
            document.getElementById("score").textContent =
              snap.data().score ?? 0;
          }
        }
      );

      // ✅ 解説テキスト・画像
      // ✅ 解説テキスト・画像
      const exp = currentQuestion.explanation;

      const expTextEl = document.getElementById("explainText");
      const expImgEl  = document.getElementById("explainImg");

      // ✅ 初期化（毎回必ず）
      expTextEl.style.display = "none";
      expTextEl.textContent = "";
      expImgEl.style.display = "none";
      expImgEl.src = "";

      if (exp) {

        // ✅ テキストがある場合
        if (typeof exp.text === "string" && exp.text.trim() !== "") {
          expTextEl.textContent = `解説：${exp.text}`;
          expTextEl.style.display = "block";
        }

        // ✅ 画像がある場合（text が無くてもOK）
        if (typeof exp.image === "string" && exp.image.trim() !== "") {
          expImgEl.src = exp.image;
          expImgEl.style.display = "block";
        }
      }
    }

    document.getElementById("answerResult").style.display = "block";

    if (myChoice !== null && currentQuestion) {
      const correct = myChoice === currentQuestion.answer;
      if (correct) startConfetti();
      else stopConfetti();
    }

    return;
  }

  if (s.mode === "ranking") {

    show("ranking");
    stopConfetti();

    unsubscribeRanking = onSnapshot(
      doc(db, "ranking", "current"),
      snapRank => {

        if (!snapRank.exists()) return;

        const r = snapRank.data();
        if (r.eventId !== s.eventId) return;

        let html = "";

        r.top10.forEach((p, i) => {
          let cls = "rank-row";

          if (p.rank === 1) cls += " rank1";
          else if (p.rank === 2) cls += " rank2";
          else if (p.rank === 3) cls += " rank3";

          html += `
            <div class="${cls}">
              <div class="rank">${p.rank}</div>   <!-- ✅これにする -->
              <div class="rank-name">${p.name}</div>
              <div class="rank-score">${p.score}点</div>
            </div>
          `;
        });

        document.getElementById("rankList").innerHTML = html;
      }
    );

    return;
  }
});

/* ======================
   回答
====================== */
window.answer = async (i) => {
  if (hasAnswered) return;

  if (!currentQuestion) return;

  const isCorrect = (i === currentQuestion.answer);

  // ✅ UI即時反映
  myChoice = i;
  hasAnswered = true;

  render(currentQuestion, false);

  const aRef = doc(
    db,
    "answers",
    "q" + currentState.questionId,
    "users",
    userId
  );

  const pRef = doc(db, "players", userId);

  await runTransaction(db, async (tx) => {

    const aDoc = await tx.get(aRef);

    const alreadyScored =
      aDoc.exists() &&
      aDoc.data().eventId === currentState.eventId &&
      aDoc.data().scoreAdded === true;

    tx.set(aRef, {
      choice: i,
      eventId: currentState.eventId,
      answered: true,
      scored: isCorrect,
      scoreAdded: alreadyScored ? true : isCorrect,
      answeredAt: Date.now()
    }, { merge: true });

    if (isCorrect && !alreadyScored) {
      tx.set(pRef, {
        score: increment(1)
      }, { merge: true });
    }
  });
};

function spawnConfettiBurst(){

  for (let i = 0; i < 10; i++) {

    const confetti = document.createElement("div");
    confetti.className = "confetti";

    const fromLeft = Math.random() < 0.5;

    let x = fromLeft ? 0 : window.innerWidth;
    let y = window.innerHeight * 0.6;

    confetti.style.position = "fixed";
    confetti.style.left = "0px";
    confetti.style.top = "0px";
    confetti.style.pointerEvents = "none";
    confetti.style.zIndex = 9999;

    // ✅ 薄く小さくする（軽さUP）
    const w = 5 + Math.random()*5;
    const h = w / 2;

    confetti.style.width = w + "px";
    confetti.style.height = h + "px";
    confetti.style.borderRadius = "2px";
    confetti.style.background =
      `hsl(${Math.random()*360}, 70%, 70%)`;

    document.body.appendChild(confetti);

    // ✅ 初速を弱くする（ここ重要）
    let vx = (fromLeft ? 1 : -1) * (120 + Math.random()*100);
    let vy = -200 - Math.random()*300; // ← 弱め

    // ✅ 重力を弱くする（ここも重要）
    const gravity = 300;

    let rotation = Math.random()*360;
    let vr = (Math.random()-0.5)*180;

    let lastTime = null;

    function update(time){

      if (!lastTime) lastTime = time;
      const dt = Math.min((time - lastTime) / 1000, 0.03);
      lastTime = time;

      // ✅ ふわふわ感（風）
      vx += (Math.random() - 0.5) * 30;

      // ✅ 空気抵抗（減速）
      vx *= 0.99;
      vy *= 0.995;

      // ✅ 重力
      vy += gravity * dt;

      x += vx * dt;
      y += vy * dt;

      rotation += vr * dt;

      confetti.style.transform =
        `translate(${x}px, ${y}px) rotate(${rotation}deg)`;

      if (y > window.innerHeight + 50){
        confetti.remove();
        return;
      }

      requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }
}

function spawnConfetti(){

  const confetti = document.createElement("div");
  confetti.className = "confetti";

  confetti.style.position = "fixed";
  confetti.style.top = "-10px";
  confetti.style.left = Math.random()*100 + "%";
  confetti.style.pointerEvents = "none";
  confetti.style.zIndex = 9999;

  // サイズランダム
  const size = 4 + Math.random()*6;
  confetti.style.width = size + "px";
  confetti.style.height = size + "px";

  // 色
  confetti.style.background =
    `hsl(${Math.random()*360}, 70%, 65%)`;

  document.body.appendChild(confetti);

  // 動き
  const duration = 3 + Math.random()*3;
  const xMove = (Math.random() - 0.5) * 200;

  confetti.animate([
    { transform: `translate(0px, 0px)` },
    { transform: `translate(${xMove}px, 100vh)` }
  ], {
    duration: duration * 1000,
    easing: "ease-out"
  });

  setTimeout(()=>confetti.remove(), duration*1000);
}

let confettiTimer = null;
let confettiRunning = false;
let confettiStartTimer = null;

function startConfetti(){
  if (confettiRunning) return;

  confettiRunning = true;

  // ✅ 最初のドーン
  spawnConfettiBurst();

  // ✅ 遅延スタート（これを控える）
  confettiStartTimer = setTimeout(() => {

    function loop(){
      if (!confettiRunning) return;

      spawnConfetti();

      const delay = 200 + Math.random()*600;
      confettiTimer = setTimeout(loop, delay);
    }

    loop();

  }, 1200);
}

function stopConfetti(){
  confettiRunning = false;

  if (confettiTimer){
    clearTimeout(confettiTimer);
    confettiTimer = null;
  }

  if (confettiStartTimer){
    clearTimeout(confettiStartTimer);
    confettiStartTimer = null;
  }

  // ✅ 追加：残ってる紙吹雪を全部削除
  document.querySelectorAll(".confetti").forEach(el => el.remove());
}