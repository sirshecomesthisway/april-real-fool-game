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
  document.getElementById("timer").innerText = snap.val() + "s";
});