(function () {
  const el = {
    soundToggle: document.getElementById('soundToggle'),
    resetBtn: document.getElementById('resetBtn'),
    startGameBtn: document.getElementById('startGameBtn'),
    startTimerBtn: document.getElementById('startTimerBtn'),
    revealBtn: document.getElementById('revealBtn'),
    nextBtn: document.getElementById('nextBtn'),
    podiumBtn: document.getElementById('podiumBtn'),
    hostQuestionCounter: document.getElementById('hostQuestionCounter'),
    hostPhaseBadge: document.getElementById('hostPhaseBadge'),
    hostQuestionText: document.getElementById('hostQuestionText'),
    hostQuestionCard: document.getElementById('hostQuestionCard'),
    joinedCount: document.getElementById('joinedCount'),
    hostAnswerCount: document.getElementById('hostAnswerCount'),
    hostTimerNumber: document.getElementById('hostTimerNumber'),
    hostTimerRing: document.getElementById('hostTimerRing'),
    hostTimerBar: document.getElementById('hostTimerBar'),
    hostTimerShell: document.querySelector('.host-stage .timer-shell'),
    hostHint: document.getElementById('hostHint'),
    hostPlayers: document.getElementById('hostPlayers'),
    hostLeaderboard: document.getElementById('hostLeaderboard'),
    hostStage: document.getElementById('hostStage'),
    hostQuestionHud: document.getElementById('hostQuestionHud'),
    hostRevealContent: document.getElementById('hostRevealContent'),
    hostRevealScrim: document.getElementById('hostRevealScrim'),
    hostRevealMedia: document.getElementById('hostRevealMedia'),
    hostRevealAnswerBadge: document.getElementById('hostRevealAnswerBadge'),
    hostRevealNote: document.getElementById('hostRevealNote'),
    hostRevealSources: document.getElementById('hostRevealSources'),
    hostPodiumPanel: document.getElementById('hostPodiumPanel'),
    hostPodiumWrap: document.getElementById('hostPodiumWrap')
  };

  let session = RF.sessionTemplate();
  let players = {};
  let roundAnswers = {};
  let answerRef = null;
  let timerFrame = null;
  let activeTimerEndsAt = null;
  let revealTimeout = null;
  let podiumTimeout = null;
  let lastTickSecond = null;
  let lastPhaseSignature = '';

  function setBadge(text, variant) {
    el.hostPhaseBadge.textContent = text;
    el.hostPhaseBadge.className = 'pill ' + (variant || 'pill-muted');
  }

  function updateSoundToggle() {
    el.soundToggle.textContent = RF.isSoundEnabled() ? 'Sound: On' : 'Sound: Off';
  }

  function clearRevealTimeout() {
    if (revealTimeout) {
      clearTimeout(revealTimeout);
      revealTimeout = null;
    }
  }

  function clearPodiumTimeout() {
    if (podiumTimeout) {
      clearTimeout(podiumTimeout);
      podiumTimeout = null;
    }
  }

  function stopTimerLoop() {
    if (timerFrame) {
      cancelAnimationFrame(timerFrame);
      timerFrame = null;
    }
    clearRevealTimeout();
    activeTimerEndsAt = null;
  }

  function currentQuestion() {
    return RF.getQuestion(session.questionIndex);
  }

  function attachAnswersListener(questionIndex) {
    if (answerRef) {
      answerRef.off();
    }
    answerRef = db.ref('answers/' + questionIndex);
    answerRef.on('value', function (snap) {
      roundAnswers = snap.val() || {};
      render();
    });
  }

  async function zeroScores() {
    const snap = await db.ref('players').once('value');
    const currentPlayers = snap.val() || {};
    const updates = {};
    Object.keys(currentPlayers).forEach(function (id) {
      updates['players/' + id + '/score'] = 0;
    });
    if (Object.keys(updates).length) {
      await db.ref().update(updates);
    }
  }

  async function resetGame() {
    stopTimerLoop();
    clearPodiumTimeout();
    await db.ref().update({
      session: Object.assign(RF.sessionTemplate(), { updatedAt: firebase.database.ServerValue.TIMESTAMP }),
      answers: null,
      players: null
    });
  }

  async function openQuestion(index, autoStart) {
    stopTimerLoop();
    clearPodiumTimeout();
    const question = RF.getQuestion(index);
    if (!question) {
      await showPodium();
      return;
    }
    const live = !!autoStart;
    const endAt = live ? RF.serverNow() + (session.timeLimitSeconds || RF.TIME_LIMIT_SECONDS) * 1000 : null;
    await db.ref().update({
      ['answers/' + index]: null,
      session: {
        title: (window.GAME_META && window.GAME_META.title) || 'April Real / Fool',
        phase: live ? 'question_live' : 'question_waiting',
        questionIndex: index,
        totalQuestions: RF.TOTAL_QUESTIONS,
        timeLimitSeconds: RF.TIME_LIMIT_SECONDS,
        timerEndsAt: endAt,
        reveal: null,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }
    });
  }

  async function startGame() {
    RF.initAudio();
    RF.playReady();
    await zeroScores();
    await openQuestion(0, true);
  }

  async function startTimer() {
    if (session.phase !== 'question_waiting') {
      return;
    }
    RF.initAudio();
    RF.playReady();
    const endAt = RF.serverNow() + (session.timeLimitSeconds || RF.TIME_LIMIT_SECONDS) * 1000;
    await db.ref('session').update({
      phase: 'question_live',
      timerEndsAt: endAt,
      reveal: null,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  async function revealCurrent() {
    if (session.phase === 'reveal' || session.phase === 'podium' || session.phase === 'lobby') {
      return;
    }
    stopTimerLoop();
    const question = currentQuestion();
    if (!question) {
      return;
    }

    const answersSnap = await db.ref('answers/' + session.questionIndex).once('value');
    const answerMap = answersSnap.val() || {};
    const correctEntries = Object.keys(answerMap).map(function (playerId) {
      return answerMap[playerId];
    }).filter(function (entry) {
      return entry && entry.answer === question.answer;
    }).sort(function (a, b) {
      return (Number(a.answeredAt) || 0) - (Number(b.answeredAt) || 0);
    });

    const scoreUpdates = {};
    correctEntries.forEach(function (entry, index) {
      const currentScore = Number(players[entry.playerId] && players[entry.playerId].score) || 0;
      const bonus = index === 0 ? 5 : index <= 2 ? 3 : 1;
      scoreUpdates['players/' + entry.playerId + '/score'] = currentScore + bonus;
    });

    scoreUpdates['session/phase'] = 'reveal';
    scoreUpdates['session/timerEndsAt'] = null;
    scoreUpdates['session/reveal'] = {
      answer: question.answer,
      artifactNote: question.artifact_note,
      sources: question.sources || [],
      media: question.media || null
    };
    scoreUpdates['session/updatedAt'] = firebase.database.ServerValue.TIMESTAMP;

    await db.ref().update(scoreUpdates);


  }

  async function nextQuestion() {
    const nextIndex = Number(session.questionIndex || 0) + 1;
    if (nextIndex >= RF.TOTAL_QUESTIONS) {
      await showPodium();
      return;
    }
    await openQuestion(nextIndex, true);
  }

  async function showPodium() {
    stopTimerLoop();
    clearPodiumTimeout();
    await db.ref('session').update({
      phase: 'podium',
      timerEndsAt: null,
      reveal: null,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  function renderControls() {
    el.startGameBtn.disabled = false;
    el.startTimerBtn.disabled = session.phase !== 'question_waiting';
    el.revealBtn.disabled = !(session.phase === 'question_waiting' || session.phase === 'question_live');
    el.nextBtn.disabled = session.phase !== 'reveal';
    el.podiumBtn.disabled = !(session.phase === 'reveal' || session.phase === 'podium');
  }

  function renderLeaderboard() {
    el.hostLeaderboard.innerHTML = RF.renderLeaderboard(RF.scoresArray(players));
  }

  function renderPlayers() {
    el.hostPlayers.innerHTML = RF.renderPlayerChips(players);
    el.joinedCount.textContent = String(RF.playersArray(players).length);
  }

  function renderRevealPanel() {
    const isReveal = session.phase === 'reveal';
    el.hostQuestionHud.classList.toggle('hidden', isReveal);
    el.hostRevealContent.classList.toggle('hidden', !isReveal);
    el.hostQuestionCard.classList.toggle('host-question-compact', isReveal);
    if (!isReveal) {
      return;
    }
    const reveal = session.reveal || {};
    const question = currentQuestion();
    el.hostRevealMedia.innerHTML = RF.renderRevealMedia(RF.resolveRevealMedia(question, reveal), question ? question.statement : 'Reveal media');
    el.hostRevealAnswerBadge.textContent = RF.answerLabel(reveal.answer);
    el.hostRevealAnswerBadge.className = 'reveal-answer-badge ' + (reveal.answer === 'REAL' ? 'badge-real' : 'badge-fool');
    el.hostRevealNote.textContent = reveal.artifactNote || '';
    el.hostRevealSources.innerHTML = RF.renderSources(reveal.sources || []);
  }

  function renderPodiumPanel() {
    const show = session.phase === 'podium';
    el.hostPodiumPanel.classList.toggle('hidden', !show);
    el.hostRevealScrim.classList.toggle('hidden', !show);
    if (show) {
      el.hostStage.classList.add('hidden-phase');
      el.hostPodiumWrap.innerHTML = RF.renderPodium(RF.scoresArray(players));
    } else {
      el.hostStage.classList.remove('hidden-phase');
    }
  }

  function renderTimer() {
    if (session.phase === 'question_live') {
      if (timerFrame && activeTimerEndsAt === session.timerEndsAt) {
        return;
      }
      const durationMs = (session.timeLimitSeconds || RF.TIME_LIMIT_SECONDS) * 1000;
      function step() {
        if (session.phase !== 'question_live') {
          return;
        }
        const timer = RF.calcTimerState(session.timerEndsAt, durationMs);
        RF.updateTimerVisual(el.hostTimerNumber, el.hostTimerRing, el.hostTimerBar, el.hostTimerShell, timer.remainingSeconds, timer.fraction);
        if (timer.remainingSeconds > 0 && timer.remainingSeconds !== lastTickSecond) {
          lastTickSecond = timer.remainingSeconds;
          RF.playTick(timer.remainingSeconds);
        }
        if (timer.remainingMs > 0) {
          timerFrame = requestAnimationFrame(step);
        } else {
          RF.updateTimerVisual(el.hostTimerNumber, el.hostTimerRing, el.hostTimerBar, el.hostTimerShell, 0, 0);
        }
      }
      stopTimerLoop();
      activeTimerEndsAt = session.timerEndsAt;
      lastTickSecond = null;
      step();
      revealTimeout = setTimeout(function () {
        revealCurrent();
      }, Math.max(0, Number(session.timerEndsAt || 0) - RF.serverNow()) + 80);
      return;
    }

    stopTimerLoop();
    if (session.phase === 'question_waiting') {
      RF.updateTimerVisual(el.hostTimerNumber, el.hostTimerRing, el.hostTimerBar, el.hostTimerShell, session.timeLimitSeconds || RF.TIME_LIMIT_SECONDS, 1);
    } else {
      RF.updateTimerVisual(el.hostTimerNumber, el.hostTimerRing, el.hostTimerBar, el.hostTimerShell, 0, 0);
    }
  }

  function render() {
    updateSoundToggle();
    renderControls();
    renderPlayers();
    renderLeaderboard();
    renderRevealPanel();
    renderPodiumPanel();

    const question = currentQuestion();
    const totalPlayers = RF.playersArray(players).length;
    const answerCount = Object.keys(roundAnswers || {}).length;

    el.hostQuestionCounter.textContent = 'Question ' + (Number(session.questionIndex || 0) + 1) + ' of ' + RF.TOTAL_QUESTIONS;
    el.hostQuestionText.textContent = question ? question.statement : 'Waiting to start the game...';
    el.hostAnswerCount.textContent = answerCount + ' / ' + totalPlayers;

    if (session.phase === 'lobby') {
      el.hostStage.classList.remove('hidden-phase');
      setBadge('Lobby', 'pill-muted');
      el.hostHint.textContent = 'Invite players to the lobby, then click Start Game.';
    } else if (session.phase === 'question_waiting') {
      el.hostStage.classList.remove('hidden-phase');
      setBadge('Get ready', 'pill-muted');
      el.hostHint.textContent = 'Question 1 is on screen. Click Start Timer when you are ready.';
    } else if (session.phase === 'question_live') {
      el.hostStage.classList.remove('hidden-phase');
      setBadge('Live', 'pill-live');
      el.hostHint.textContent = 'Answers are coming in now. After reveal, Next Question will auto-start the next timer.';
    } else if (session.phase === 'reveal') {
      setBadge('Reveal', 'pill-reveal');
      el.hostHint.textContent = Number(session.questionIndex || 0) >= RF.TOTAL_QUESTIONS - 1 ? 'Final reveal! Click Show Podium when you\'re ready.' : 'Click Next Question when you are ready to continue.';
    } else if (session.phase === 'podium') {
      setBadge('Podium', 'pill-podium');
      el.hostHint.textContent = 'Final results are on display.';
    }

    const signature = session.phase + ':' + session.questionIndex;
    if (signature !== lastPhaseSignature) {
      if (session.phase === 'reveal') {
        RF.playReveal();
      }
      if (session.phase === 'podium') {
        RF.playVictory();
      }
      lastPhaseSignature = signature;
    }

    renderTimer();
  }

  function boot() {
    el.soundToggle.addEventListener('click', function () {
      RF.setSoundEnabled(!RF.isSoundEnabled());
      updateSoundToggle();
      if (RF.isSoundEnabled()) {
        RF.playReady();
      }
    });
    el.resetBtn.addEventListener('click', resetGame);
    el.startGameBtn.addEventListener('click', startGame);
    el.startTimerBtn.addEventListener('click', startTimer);
    el.revealBtn.addEventListener('click', revealCurrent);
    el.nextBtn.addEventListener('click', nextQuestion);
    el.podiumBtn.addEventListener('click', showPodium);

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

    render();
  }

  boot();
})();
