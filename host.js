let index = 0;
let timer = 15;
let interval;
let scores = {};

function start() {
  index = 0;
  scores = {};
  loadQ();
}

function loadQ() {
  db.ref("answers").set({});
  db.ref("reveal").set(null);
  db.ref("game").set(questions[index]);
  document.getElementById("qnum").innerText = "Question " + (index+1);

  startTimer();
}

function startTimer() {
  timer = 15;
  db.ref("timer").set(timer);

  clearInterval(interval);

  interval = setInterval(()=>{
    timer--;
    db.ref("timer").set(timer);

    if(timer<=0){
      clearInterval(interval);
      score();
      reveal();
    }
  },1000);
}

function next(){
  index++;
  if(index<questions.length) loadQ();
  else alert("Game Over");
}

function reveal(){
  const q = questions[index];
  db.ref("reveal").set({
    answer:q.a,
    link:q.link
  });
}

function score(){
  db.ref("answers").once("value", snap=>{
    const data = snap.val()||{};
    let correct=[];

    Object.entries(data).forEach(([name,val])=>{
      if(val.answer===questions[index].a){
        correct.push({name,time:val.time});
      }
    });

    correct.sort((a,b)=>a.time-b.time);

    correct.forEach((p,i)=>{
      if(!scores[p.name]) scores[p.name]=0;
      if(i===0) scores[p.name]+=5;
      else if(i<=2) scores[p.name]+=3;
      else scores[p.name]+=1;
    });

    updateBoard();
  });
}

function updateBoard(){
  let text="Leaderboard\n";
  Object.entries(scores)
  .sort((a,b)=>b[1]-a[1])
  .forEach(([n,s])=>{
    text+=n+": "+s+"\n";
  });

  document.getElementById("leaderboard").innerText=text;
}
