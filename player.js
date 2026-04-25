(function () {
  const el = {
    screenJoin: document.getElementById('screenJoin'),
    screenLobby: document.getElementById('screenLobby'),
    screenQuestion: document.getElementById('screenQuestion'),
    screenPodium: document.getElementById('screenPodium'),
    nameInput: document.getElementById('nameInput'),
    joinBtn: document.getElementById('joinBtn'),
    joinError: document.getElementById('joinError'),
    soundToggle: document.getElementById('soundToggle'),
    lobbyTitle: document.getElementById('lobbyTitle'),
    lobbyStatus: document.getElementById('lobbyStatus'),
    lobbyPlayerCount: document.getElementById('lobbyPlayerCount'),
    lobbyQuestionCount: document.getElementById('lobbyQuestionCount'),
    lobbyPlayers: document.getElementById('lobbyPlayers'),
    questionMain: document.getElementById('questionMain'),
    playerRevealBackdrop: document.getElementById('playerRevealBackdrop'),
    questionCounter: document.getElementById('questionCounter'),
    phaseBadge: document.getElementById('phaseBadge'),
    questionText: document.getElementById('questionText'),
    answerCountText: document.getElementById('answerCountText'),
    yourAnswerText: document.getElementById('yourAnswerText'),
    timerNumber: document.getElementById('timerNumber'),
    timerRing: document.getElementById('timerRing'),
    timerBar: document.getElementById('timerBar'),
    timerShell: document.querySelector('#screenQuestion .timer-shell'),
    btnReal: document.getElementById('btnReal'),
    btnFool: document.getElementById('btnFool'),
    questionHint: document.getElementById('questionHint'),
    revealPanel: document.getElementById('revealPanel'),
    revealReaction: document.getElementById('revealReaction'),
    revealMedia: document.getElementById('revealMedia'),
    revealHeadline: document.getElementById('revealHeadline'),
    revealAnswerBadge: document.getElementById('revealAnswerBadge'),
    revealNote: document.getElementById('revealNote'),
    revealSources: document.getElementById('revealSources'),
    podiumWrap: document.getElementById('podiumWrap')
  };

  const playerId = RF.getPlayerId();
  let playerName = RF.getStoredName();
  let session = RF.sessionTemplate();
  let players = {};
  let roundAnswers = {};
  let answerRef = null;
  let timerFrame = null;
  let activeTimerEndsAt = null;
  let lastTickSecond = null;
  let lastPhaseSignature = '';

  function showScreen(target) {
    [el.screenJoin, el.screenLobby, el.screenQuestion, el.screenPodium].forEach(function (screen) {
      if (!screen) {
        return;
      }
      screen.classList.toggle('active', screen === target);
    });
  }

  function updateSoundToggle() {
    el.soundToggle.textContent = RF.isSoundEnabled() ? 'Sound: On' : 'Sound: Off';
  }

  function setPhaseBadge(text, variant) {
    el.phaseBadge.textContent = text;
    el.phaseBadge.className = 'pill ' + (variant || 'pill-muted');
  }

  function setSelectedAnswer(answer) {
    el.btnReal.classList.toggle('selected', answer === 'REAL');
    el.btnFool.classList.toggle('selected', answer === 'FOOL');
  }

  function setButtonsEnabled(enabled) {
    el.btnReal.disabled = !enabled;
    el.btnFool.disabled = !enabled;
  }

  function currentQuestion() {
    return RF.getQuestion(session.questionIndex);
  }

  function currentMyAnswer() {
    return (roundAnswers[playerId] && roundAnswers[playerId].answer) || null;
  }

  function joinLobby() {
    const clean = RF.sanitizeName(el.nameInput.value);
    if (!clean) {
      el.joinError.textContent = 'Please enter a name.';
      return;
    }
    el.joinError.textContent = '';
    playerName = clean;
    RF.setStoredName(clean);
    RF.initAudio();
    RF.playReady();

    const existingScore = Number(players[playerId] && players[playerId].score) || 0;
    const joinedAt = (players[playerId] && players[playerId].joinedAt) || firebase.database.ServerValue.TIMESTAMP;

    db.ref('players/' + playerId).update({
      name: clean,
      score: existingScore,
      joinedAt: joinedAt,
      lastSeenAt: firebase.database.ServerValue.TIMESTAMP
    });

    render();
  }

  function submitAnswer(answer) {
    if (!playerName || session.phase !== 'question_live') {
      return;
    }
    RF.initAudio();
    RF.playSelect();

    db.ref('answers/' + session.questionIndex + '/' + playerId).set({
      playerId: playerId,
      name: playerName,
      answer: answer,
      answeredAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  function attachAnswersListener(questionIndex) {
    if (answerRef) {
      answerRef.off();
    }
    answerRef = db.ref('answers/' + questionIndex);
    answerRef.on('value', function (snap) {
      roundAnswers = snap.val() || {};
      renderQuestion();
    });
  }

  function stopTimerLoop() {
    if (timerFrame) {
      cancelAnimationFrame(timerFrame);
      timerFrame = null;
    }
    activeTimerEndsAt = null;
  }

  function runTimerLoop() {
    if (timerFrame && activeTimerEndsAt === session.timerEndsAt) {
      return;
    }
    stopTimerLoop();
    activeTimerEndsAt = session.timerEndsAt;
    lastTickSecond = null;
    const durationMs = (session.timeLimitSeconds || RF.TIME_LIMIT_SECONDS) * 1000;
    function step() {
      if (session.phase !== 'question_live') {
        return;
      }
      const timer = RF.calcTimerState(session.timerEndsAt, durationMs);
      RF.updateTimerVisual(el.timerNumber, el.timerRing, el.timerBar, el.timerShell, timer.remainingSeconds, timer.fraction);
      if (timer.remainingSeconds > 0 && timer.remainingSeconds !== lastTickSecond) {
        lastTickSecond = timer.remainingSeconds;
        RF.playTick(timer.remainingSeconds);
      }
      if (timer.remainingMs > 0) {
        timerFrame = requestAnimationFrame(step);
      } else {
        RF.updateTimerVisual(el.timerNumber, el.timerRing, el.timerBar, el.timerShell, 0, 0);
      }
    }
    step();
  }

  function renderLobby() {
    const joined = RF.playersArray(players);
    el.lobbyPlayerCount.textContent = String(joined.length);
    el.lobbyQuestionCount.textContent = String(RF.TOTAL_QUESTIONS);
    el.lobbyPlayers.innerHTML = RF.renderPlayerChips(players, playerId);

    if (!playerName) {
      el.lobbyTitle.textContent = 'Join the lobby';
      el.lobbyStatus.textContent = 'Enter your name to get in.';
      return;
    }

    if (session.phase === 'lobby') {
      el.lobbyTitle.textContent = 'You are in, ' + playerName;
      el.lobbyStatus.textContent = 'Waiting for the host to open question 1.';
    } else if (session.phase === 'question_waiting') {
      el.lobbyTitle.textContent = 'Question is ready';
      el.lobbyStatus.textContent = 'The host is about to start the timer.';
    } else if (session.phase === 'question_live') {
      el.lobbyTitle.textContent = 'Round is live';
      el.lobbyStatus.textContent = 'Jump in and answer before time runs out.';
    } else if (session.phase === 'reveal') {
      el.lobbyTitle.textContent = 'Answer revealed';
      el.lobbyStatus.textContent = 'The reveal is on screen now.';
    } else if (session.phase === 'podium') {
      el.lobbyTitle.textContent = 'Final results';
      el.lobbyStatus.textContent = 'The podium is live.';
    }
  }

  function renderReveal() {
    if (session.phase !== 'reveal') {
      el.questionMain.classList.remove('hidden-phase');
      el.playerRevealBackdrop.classList.add('hidden');
      el.revealPanel.classList.add('hidden');
      return;
    }

    const question = currentQuestion();
    const reveal = session.reveal || {};
    const correctAnswer = reveal.answer || (question && question.answer) || '';
    const reaction = RF.reactionForPlayer(question, roundAnswers, playerId);

    el.questionMain.classList.add('hidden-phase');
    el.playerRevealBackdrop.classList.remove('hidden');
    el.revealPanel.classList.remove('hidden');
    el.revealReaction.innerHTML = RF.renderReaction(reaction);
    el.revealMedia.innerHTML = RF.renderRevealMedia(RF.resolveRevealMedia(question, reveal), question ? question.statement : 'Reveal media');
    el.revealHeadline.textContent = 'Correct answer';
    el.revealAnswerBadge.textContent = RF.answerLabel(correctAnswer);
    el.revealAnswerBadge.className = 'reveal-answer-badge ' + (correctAnswer === 'REAL' ? 'badge-real' : 'badge-fool');
    el.revealNote.textContent = reveal.artifactNote || '';
    el.revealSources.innerHTML = RF.renderSources(reveal.sources || []);
  }

  function renderQuestion() {
    const question = currentQuestion();
    const totalPlayers = RF.playersArray(players).length;
    const answerCount = Object.keys(roundAnswers || {}).length;
    const myAnswer = currentMyAnswer();

    el.questionCounter.textContent = 'Question ' + (Number(session.questionIndex || 0) + 1) + ' of ' + RF.TOTAL_QUESTIONS;
    el.questionText.textContent = question ? question.statement : 'Waiting for host...';
    el.answerCountText.textContent = answerCount + ' / ' + totalPlayers + ' answered';
    setSelectedAnswer(myAnswer);

    if (session.phase === 'question_live') {
      setPhaseBadge('Live', 'pill-live');
      el.questionHint.textContent = 'You can change your answer until the timer hits zero.';
      el.yourAnswerText.textContent = myAnswer ? 'Current answer: ' + RF.answerLabel(myAnswer) : 'Tap Real or Fool now.';
      setButtonsEnabled(true);
      runTimerLoop();
      el.questionMain.classList.remove('hidden-phase');
    } else if (session.phase === 'question_waiting') {
      setPhaseBadge('Get ready', 'pill-muted');
      stopTimerLoop();
      RF.updateTimerVisual(el.timerNumber, el.timerRing, el.timerBar, el.timerShell, session.timeLimitSeconds || RF.TIME_LIMIT_SECONDS, 1);
      el.questionHint.textContent = 'The host will start the timer soon.';
      el.yourAnswerText.textContent = 'Answer buttons unlock when the timer starts.';
      setButtonsEnabled(false);
      el.questionMain.classList.remove('hidden-phase');
    } else if (session.phase === 'reveal') {
      setPhaseBadge('Reveal', 'pill-reveal');
      stopTimerLoop();
      RF.updateTimerVisual(el.timerNumber, el.timerRing, el.timerBar, el.timerShell, 0, 0);
      el.questionHint.textContent = 'Reveal on screen.';
      el.yourAnswerText.textContent = myAnswer ? 'Your final answer: ' + RF.answerLabel(myAnswer) : 'No answer selected.';
      setButtonsEnabled(false);
    } else {
      setPhaseBadge(RF.phaseLabel(session.phase), 'pill-muted');
      stopTimerLoop();
      RF.updateTimerVisual(el.timerNumber, el.timerRing, el.timerBar, el.timerShell, session.timeLimitSeconds || RF.TIME_LIMIT_SECONDS, 1);
      el.questionHint.textContent = 'Waiting for the host.';
      el.yourAnswerText.textContent = 'No answer selected yet.';
      setButtonsEnabled(false);
      el.questionMain.classList.remove('hidden-phase');
    }

    renderReveal();
  }

  function renderPodium() {
    el.podiumWrap.innerHTML = RF.renderPodium(RF.scoresArray(players), playerId);
  }

  function maybePlayPhaseSound() {
    const signature = session.phase + ':' + session.questionIndex;
    if (signature === lastPhaseSignature) {
      return;
    }
    if (session.phase === 'reveal') {
      RF.playReveal();
    }
    if (session.phase === 'podium') {
      RF.playVictory();
    }
    lastPhaseSignature = signature;
  }

  function render() {
    updateSoundToggle();
    renderLobby();
    renderQuestion();
    renderPodium();
    maybePlayPhaseSound();

    if (!playerName) {
      showScreen(el.screenJoin);
      return;
    }
    if (session.phase === 'lobby') {
      showScreen(el.screenLobby);
    } else if (session.phase === 'podium') {
      showScreen(el.screenPodium);
    } else {
      showScreen(el.screenQuestion);
    }
  }

  function boot() {
    el.nameInput.value = playerName;
    el.joinBtn.addEventListener('click', joinLobby);
    el.nameInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        joinLobby();
      }
    });
    el.soundToggle.addEventListener('click', function () {
      RF.setSoundEnabled(!RF.isSoundEnabled());
      updateSoundToggle();
      if (RF.isSoundEnabled()) {
        RF.playReady();
      }
    });
    el.btnReal.addEventListener('click', function () { submitAnswer('REAL'); });
    el.btnFool.addEventListener('click', function () { submitAnswer('FOOL'); });

    db.ref('players').on('value', function (snap) {
      players = snap.val() || {};
      render();
    });

    db.ref('session').on('value', function (snap) {
      const next = snap.val() || RF.sessionTemplate();
      const qChanged = next.questionIndex !== session.questionIndex;
      session = Object.assign(RF.sessionTemplate(), next);
      if (qChanged || !answerRef) {
        attachAnswersListener(session.questionIndex || 0);
      }
      render();
    });

    if (playerName) {
      joinLobby();
    } else {
      render();
    }
  }

  boot();
})();
