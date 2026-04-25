let index = 0;
let timer = 15;
let interval = null;
let scores = {};

function start() {
  index = 0;
  scores = {};
  loadQuestion();
}

function loadQuestion() {
  db.ref("answers").set({});
  db.ref("game").set(questions[index]);
  startTimer();
}

function startTimer() {
  timer = 15;
  db.ref("timer").set(timer);

  clearInterval(interval);
  interval = setInterval(() => {
    timer--;
    db.ref("timer").set(timer);

    if (timer <= 0) {
      clearInterval(interval);
      scoreRound();
    }
  }, 1000);
}

function next() {
  index++;
  loadQuestion();
}

function reveal() {
  const q = questions[index];
  alert("Answer: " + q.a + "\n" + q.artifact);
}

function scoreRound() {
  db.ref("answers").once("value", snap => {
    const data = snap.val();
    if (!data) return;

    let correct = [];

    Object.entries(data).forEach(([name, val]) => {
      if (val.answer === questions[index].a) {
        correct.push({name, time: val.time});
      }
    });

    correct.sort((a,b)=>a.time-b.time);

    correct.forEach((p, i) => {
      if (!scores[p.name]) scores[p.name] = 0;

      if (i === 0) scores[p.name] += 5;
      else if (i <= 2) scores[p.name] += 3;
      else scores[p.name] += 1;
    });

    updateLeaderboard();
  });
}

function updateLeaderboard() {
  let text = "Leaderboard:\n";
  Object.entries(scores)
    .sort((a,b)=>b[1]-a[1])
    .forEach(([name,score]) => {
      text += `${name}: ${score}\n`;
    });

  document.getElementById("leaderboard").innerText = text;
}