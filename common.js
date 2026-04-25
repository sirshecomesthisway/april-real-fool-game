(function () {
  const STORAGE_KEYS = {
    playerId: 'rf_player_id',
    playerName: 'rf_player_name',
    soundEnabled: 'rf_sound_enabled'
  };

  const TIME_LIMIT_SECONDS = (window.GAME_META && window.GAME_META.timeLimitSeconds) || 15;
  const TOTAL_QUESTIONS = (window.GAME_QUESTIONS && window.GAME_QUESTIONS.length) || 0;
  const CIRCUMFERENCE = 2 * Math.PI * 54;

  let soundEnabled = localStorage.getItem(STORAGE_KEYS.soundEnabled);
  soundEnabled = soundEnabled === null ? true : soundEnabled === '1';

  let audioContext = null;
  let serverOffset = 0;

  if (window.db && window.db.ref) {
    window.db.ref('.info/serverTimeOffset').on('value', function (snap) {
      serverOffset = Number(snap.val()) || 0;
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  }

  function makeId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getPlayerId() {
    let existing = localStorage.getItem(STORAGE_KEYS.playerId);
    if (!existing) {
      existing = makeId();
      localStorage.setItem(STORAGE_KEYS.playerId, existing);
    }
    return existing;
  }

  function getStoredName() {
    return localStorage.getItem(STORAGE_KEYS.playerName) || '';
  }

  function setStoredName(name) {
    localStorage.setItem(STORAGE_KEYS.playerName, sanitizeName(name));
  }

  function initAudio() {
    if (!soundEnabled) {
      return null;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return null;
    }
    if (!audioContext) {
      audioContext = new Ctx();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  function setSoundEnabled(enabled) {
    soundEnabled = !!enabled;
    localStorage.setItem(STORAGE_KEYS.soundEnabled, soundEnabled ? '1' : '0');
    if (soundEnabled) {
      initAudio();
    }
  }

  function isSoundEnabled() {
    return soundEnabled;
  }

  function playTone(freq, duration, type, volume, delay) {
    if (!soundEnabled) {
      return;
    }
    const ctx = initAudio();
    if (!ctx) {
      return;
    }
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const startAt = ctx.currentTime + (delay || 0);

    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(freq, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume || 0.03, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
  }

  function playTick(secondsLeft) {
    const urgent = Number(secondsLeft) <= 5;
    playTone(urgent ? 980 : 720, 0.06, 'square', urgent ? 0.05 : 0.03, 0);
  }

  function playSelect() {
    playTone(540, 0.05, 'triangle', 0.025, 0);
  }

  function playReveal() {
    playTone(660, 0.08, 'triangle', 0.03, 0);
    playTone(880, 0.12, 'triangle', 0.04, 0.1);
  }

  function playVictory() {
    playTone(523.25, 0.08, 'triangle', 0.03, 0);
    playTone(659.25, 0.08, 'triangle', 0.03, 0.08);
    playTone(783.99, 0.14, 'triangle', 0.04, 0.16);
  }

  function serverNow() {
    return Date.now() + serverOffset;
  }

  function calcTimerState(timerEndsAt, durationMs) {
    const end = Number(timerEndsAt) || serverNow();
    const remainingMs = Math.max(0, end - serverNow());
    const safeDuration = Math.max(1, Number(durationMs) || TIME_LIMIT_SECONDS * 1000);
    return {
      remainingMs: remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      fraction: Math.max(0, Math.min(1, remainingMs / safeDuration))
    };
  }

  function getQuestion(index) {
    return (window.GAME_QUESTIONS || [])[Number(index) || 0] || null;
  }

  function phaseLabel(phase) {
    const labels = {
      lobby: 'Lobby',
      question_waiting: 'Get ready',
      question_live: 'Live',
      reveal: 'Reveal',
      podium: 'Podium'
    };
    return labels[phase] || 'Lobby';
  }

  function answerLabel(answer) {
    return answer === 'REAL' ? 'Real' : answer === 'FOOL' ? 'Fool' : '—';
  }

  function sourceIcon(type) {
    const icons = {
      article: '📰',
      video: '▶️',
      patent: '📜',
      report: '📘'
    };
    return icons[type] || '🔗';
  }

  function renderSources(sources) {
    const list = Array.isArray(sources) ? sources : [];
    if (!list.length) {
      return '<div class="empty-note">No source links provided.</div>';
    }
    return '<div class="source-list">' + list.map(function (source) {
      return (
        '<a class="source-link" href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="source-icon">' + sourceIcon(source.type) + '</span>' +
          '<span class="source-text">' + escapeHtml(source.title) + '</span>' +
          '<span class="source-type">' + escapeHtml(source.type || 'link') + '</span>' +
        '</a>'
      );
    }).join('') + '</div>';
  }

  function playersArray(playersObj) {
    return Object.keys(playersObj || {}).map(function (id) {
      const item = playersObj[id] || {};
      return {
        id: id,
        name: item.name || 'Player',
        joinedAt: Number(item.joinedAt) || 0,
        score: Number(item.score) || 0,
        lastSeenAt: Number(item.lastSeenAt) || 0
      };
    }).sort(function (a, b) {
      return (a.joinedAt || 0) - (b.joinedAt || 0) || a.name.localeCompare(b.name);
    });
  }

  function scoresArray(playersObj) {
    return playersArray(playersObj).sort(function (a, b) {
      return (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name);
    });
  }

  function renderPlayerChips(playersObj, currentPlayerId) {
    const arr = playersArray(playersObj);
    if (!arr.length) {
      return '<div class="empty-note">No players have joined yet.</div>';
    }
    return arr.map(function (player) {
      const meClass = player.id === currentPlayerId ? ' is-me' : '';
      return '<span class="player-chip' + meClass + '">' + escapeHtml(player.name) + '</span>';
    }).join('');
  }

  function renderLeaderboard(scores, currentPlayerId, limit) {
    const rows = Array.isArray(scores) ? scores.slice(0, limit || scores.length) : [];
    if (!rows.length) {
      return '<div class="empty-note">Scores will appear after the first reveal.</div>';
    }
    return rows.map(function (player, index) {
      const meClass = player.id === currentPlayerId ? ' is-me' : '';
      return (
        '<div class="leader-row' + meClass + '">' +
          '<div class="leader-rank">' + (index + 1) + '</div>' +
          '<div class="leader-name">' + escapeHtml(player.name) + '</div>' +
          '<div class="leader-score">' + (player.score || 0) + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderPodium(scores, currentPlayerId) {
    const ordered = Array.isArray(scores) ? scores : [];
    const slots = [ordered[1] || null, ordered[0] || null, ordered[2] || null];
    const medals = ['🥈', '🥇', '🥉'];
    const heights = ['mid', 'top', 'low'];
    const positions = ['2nd', '1st', '3rd'];
    const podiumHtml = '<div class="podium">' + slots.map(function (player, index) {
      if (!player) {
        return '<div class="podium-card ' + heights[index] + ' empty"><div class="podium-medal">' + medals[index] + '</div><div class="podium-name">Open</div><div class="podium-score">0 pts</div><div class="podium-place">' + positions[index] + '</div></div>';
      }
      const meClass = player.id === currentPlayerId ? ' is-me' : '';
      return '<div class="podium-card ' + heights[index] + meClass + '"><div class="podium-medal">' + medals[index] + '</div><div class="podium-name">' + escapeHtml(player.name) + '</div><div class="podium-score">' + (player.score || 0) + ' pts</div><div class="podium-place">' + positions[index] + '</div></div>';
    }).join('') + '</div>';

    const leaderboardHtml = '<div class="leaderboard-block">' +
      '<h3>Full leaderboard</h3>' +
      '<div class="leaderboard-list">' + renderLeaderboard(ordered, currentPlayerId) + '</div>' +
    '</div>';

    return podiumHtml + leaderboardHtml;
  }

  function updateTimerVisual(timerNumberEl, timerRingEl, timerBarEl, timerShellEl, remainingSeconds, fraction) {
    if (timerNumberEl) {
      timerNumberEl.textContent = String(Math.max(0, remainingSeconds));
    }
    if (timerRingEl) {
      timerRingEl.style.strokeDasharray = String(CIRCUMFERENCE);
      timerRingEl.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - fraction));
    }
    if (timerBarEl) {
      timerBarEl.style.transform = 'scaleX(' + Math.max(0, Math.min(1, fraction)) + ')';
    }
    if (timerShellEl) {
      timerShellEl.classList.toggle('urgent', Number(remainingSeconds) <= 5);
    }
  }

  function sessionTemplate() {
    return {
      title: (window.GAME_META && window.GAME_META.title) || 'April Real / Fool',
      phase: 'lobby',
      questionIndex: 0,
      totalQuestions: TOTAL_QUESTIONS,
      timeLimitSeconds: TIME_LIMIT_SECONDS,
      timerEndsAt: null,
      reveal: null,
      updatedAt: null
    };
  }

  window.RF = {
    STORAGE_KEYS: STORAGE_KEYS,
    TIME_LIMIT_SECONDS: TIME_LIMIT_SECONDS,
    TOTAL_QUESTIONS: TOTAL_QUESTIONS,
    CIRCUMFERENCE: CIRCUMFERENCE,
    sanitizeName: sanitizeName,
    escapeHtml: escapeHtml,
    getPlayerId: getPlayerId,
    getStoredName: getStoredName,
    setStoredName: setStoredName,
    initAudio: initAudio,
    setSoundEnabled: setSoundEnabled,
    isSoundEnabled: isSoundEnabled,
    playTick: playTick,
    playSelect: playSelect,
    playReveal: playReveal,
    playVictory: playVictory,
    serverNow: serverNow,
    calcTimerState: calcTimerState,
    getQuestion: getQuestion,
    phaseLabel: phaseLabel,
    answerLabel: answerLabel,
    renderSources: renderSources,
    playersArray: playersArray,
    scoresArray: scoresArray,
    renderPlayerChips: renderPlayerChips,
    renderLeaderboard: renderLeaderboard,
    renderPodium: renderPodium,
    updateTimerVisual: updateTimerVisual,
    sessionTemplate: sessionTemplate
  };
})();
