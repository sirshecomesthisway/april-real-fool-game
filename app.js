let player = "";

function join() {
  player = document.getElementById("name").value;
  document.getElementById("join").style.display = "none";
  document.getElementById("game").style.display = "block";
}

function answer(val) {
  db.ref("answers/" + player).set({
    answer: val,
    time: Date.now()
  });
}

db.ref("game").on("value", snap => {
  const data = snap.val();
  if (!data) return;
  document.getElementById("question").innerText = data.q;
});

db.ref("timer").on("value", snap => {
  const t = snap.val();
  document.getElementById("timer").innerText = t;

  if (t <= 5) document.getElementById("timer").style.color = "red";
  else document.getElementById("timer").style.color = "white";
});

db.ref("answers").on("value", snap => {
  const data = snap.val() || {};
  document.getElementById("count").innerText = Object.keys(data).length + " answers";
});

db.ref("reveal").on("value", snap => {
  const data = snap.val();
  if (!data) return;

  document.getElementById("result").innerHTML =
    "Answer: " + data.answer +
    "<br><a href='" + data.link + "' target='_blank'>View source</a>";
});
