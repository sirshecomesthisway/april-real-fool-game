(function () {
  const STORAGE_KEYS = {
    playerId: 'rf_player_id',
    playerName: 'rf_player_name',
    soundEnabled: 'rf_sound_enabled'
  };

  const TIME_LIMIT_SECONDS = (window.GAME_META && window.GAME_META.timeLimitSeconds) || 15;
  const TOTAL_QUESTIONS = (window.GAME_QUESTIONS && window.GAME_QUESTIONS.length) || 0;
  const CIRCUMFERENCE = 2 * Math.PI * 54;
  const THUMB_PREFIX = 'https://image.thum.io/get/width/1400/crop/900/noanimate/';

  const REACTION_SETS = {
    first: [
      { tone: 'gold', emoji: '&#128640;', title: 'Lightning fast!', body: 'First correct and 5 points. That was sharp.' },
      { tone: 'gold', emoji: '&#127919;', title: 'Bullseye!', body: 'You were first in with the right answer. Huge round.' },
      { tone: 'gold', emoji: '&#9889;', title: 'Fastest on the board!', body: 'You grabbed the top-speed bonus and 5 points.' }
    ],
    top3: [
      { tone: 'green', emoji: '&#11088;', title: 'Top-three speed!', body: 'Right answer and quick enough for the bonus lane.' },
      { tone: 'green', emoji: '&#127942;', title: 'Strong read!', body: 'You landed in the top three for this round.' },
      { tone: 'green', emoji: '&#128081;', title: 'Nice catch!', body: 'That answer was right and right on time.' }
    ],
    correct: [
      { tone: 'blue', emoji: '&#128079;', title: 'Point on the board!', body: 'Nice catch. You were right and kept moving.' },
      { tone: 'blue', emoji: '&#127881;', title: 'You got it!', body: 'Good read. Keep stacking those points.' },
      { tone: 'blue', emoji: '&#128170;', title: 'Clean hit!', body: 'Correct answer. Keep the streak alive.' }
    ],
    miss: [
      { tone: 'pink', emoji: '&#128591;', title: 'Bold swing!', body: 'Nice try. You are still very much in this.' },
      { tone: 'pink', emoji: '&#127775;', title: 'Good energy!', body: 'That one missed, but the next round is yours.' },
      { tone: 'pink', emoji: '&#128075;', title: 'Strong guess!', body: 'Shake it off. You can bounce back fast.' }
    ],
    blank: [
      { tone: 'purple', emoji: '&#127808;', title: 'Still in it!', body: 'No answer locked in, but the next one is a fresh start.' },
      { tone: 'purple', emoji: '&#128640;', title: 'Reset and go!', body: 'Nothing locked here. Next round is ready for you.' },
      { tone: 'purple', emoji: '&#127752;', title: 'Fresh round ahead!', body: 'You are one tap away from jumping back in.' }
    ]
  };

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
    const peak = Math.max(0.0001, volume || 0.06);

    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(freq, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
  }

  function playTick(secondsLeft) {
    const urgent = Number(secondsLeft) <= 5;
    playTone(urgent ? 1040 : 760, 0.08, 'square', urgent ? 0.12 : 0.08, 0);
  }

  function playSelect() {
    playTone(540, 0.07, 'triangle', 0.08, 0);
    playTone(680, 0.07, 'triangle', 0.06, 0.04);
  }

  function playReady() {
    playTone(440, 0.08, 'triangle', 0.08, 0);
    playTone(660, 0.12, 'triangle', 0.08, 0.09);
  }

  function playReveal() {
    playTone(660, 0.12, 'triangle', 0.08, 0);
    playTone(880, 0.14, 'triangle', 0.1, 0.12);
    playTone(1046.5, 0.16, 'triangle', 0.1, 0.25);
  }

  function playVictory() {
    playTone(523.25, 0.1, 'triangle', 0.08, 0);
    playTone(659.25, 0.1, 'triangle', 0.08, 0.09);
    playTone(783.99, 0.12, 'triangle', 0.09, 0.18);
    playTone(1046.5, 0.18, 'triangle', 0.11, 0.3);
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
    return answer === 'REAL' ? 'Real' : answer === 'FOOL' ? 'Fool' : '-';
  }

  function sourceIcon(type) {
    const icons = {
      article: '&#128240;',
      video: '&#9654;&#65039;',
      patent: '&#128220;',
      report: '&#128214;'
    };
    return icons[type] || '&#128279;';
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
    const medals = ['&#129352;', '&#129351;', '&#129353;'];
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

  function hashString(value) {
    let hash = 0;
    String(value || '').split('').forEach(function (char) {
      hash = ((hash << 5) - hash) + char.charCodeAt(0);
      hash |= 0;
    });
    return Math.abs(hash);
  }

  function pickReaction(bucket, seed) {
    const list = REACTION_SETS[bucket] || REACTION_SETS.correct;
    return list[seed % list.length];
  }

  function correctEntries(roundAnswers, correctAnswer) {
    return Object.keys(roundAnswers || {}).map(function (playerId) {
      const entry = roundAnswers[playerId] || {};
      return Object.assign({ playerId: playerId }, entry);
    }).filter(function (entry) {
      return entry && entry.answer === correctAnswer;
    }).sort(function (a, b) {
      return (Number(a.answeredAt) || 0) - (Number(b.answeredAt) || 0);
    });
  }

  function reactionForPlayer(question, roundAnswers, playerId) {
    const correctAnswer = question && question.answer;
    const mine = roundAnswers && roundAnswers[playerId] ? roundAnswers[playerId].answer : null;
    const placements = correctEntries(roundAnswers, correctAnswer);
    const placement = placements.findIndex(function (entry) {
      return entry.playerId === playerId;
    });

    let bucket = 'blank';
    if (mine && mine === correctAnswer) {
      bucket = placement === 0 ? 'first' : placement === 1 || placement === 2 ? 'top3' : 'correct';
    } else if (mine) {
      bucket = 'miss';
    }
    return pickReaction(bucket, hashString(playerId + ':' + (question ? question.id : 0) + ':' + bucket));
  }

  function renderReaction(reaction) {
    const item = reaction || REACTION_SETS.correct[0];
    return '<div class="reaction-banner tone-' + escapeHtml(item.tone || 'blue') + '">' +
      '<div class="reaction-emoji">' + (item.emoji || '&#127881;') + '</div>' +
      '<div class="reaction-copy-wrap"><div class="reaction-title">' + escapeHtml(item.title || 'Nice work') + '</div><div class="reaction-copy">' + escapeHtml(item.body || '') + '</div></div>' +
    '</div>';
  }

  function youtubeEmbedUrl(url) {
    const value = String(url || '');
    let match = value.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (match && match[1]) {
      return 'https://www.youtube.com/embed/' + match[1] + '?rel=0&modestbranding=1';
    }
    match = value.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    if (match && match[1]) {
      return 'https://www.youtube.com/embed/' + match[1] + '?rel=0&modestbranding=1';
    }
    return '';
  }

  function screenshotUrl(url) {
    const safe = String(url || '').trim();
    if (!safe) {
      return '';
    }
    return THUMB_PREFIX + safe.replace(/^http:\/\//i, 'https://');
  }

  function resolveRevealMedia(question, reveal) {
    const explicit = (reveal && reveal.media) || (question && question.media) || {};
    if (explicit.mode === 'video' && explicit.embedUrl) {
      return {
        mode: 'video',
        embedUrl: explicit.embedUrl,
        posterUrl: explicit.posterUrl || '',
        alt: explicit.alt || 'Related video'
      };
    }
    if (explicit.mode === 'image') {
      const url = explicit.imageUrl || screenshotUrl(explicit.sourceUrl || '');
      if (url) {
        return {
          mode: 'image',
          imageUrl: url,
          alt: explicit.alt || 'Related source image'
        };
      }
    }

    const sources = (reveal && reveal.sources) || (question && question.sources) || [];
    const videoSource = sources.find(function (source) {
      return !!youtubeEmbedUrl(source && source.url);
    });
    if (videoSource) {
      return {
        mode: 'video',
        embedUrl: youtubeEmbedUrl(videoSource.url),
        posterUrl: '',
        alt: videoSource.title || 'Related video'
      };
    }

    const imageSource = sources[0];
    if (imageSource && imageSource.url) {
      return {
        mode: 'image',
        imageUrl: screenshotUrl(imageSource.url),
        alt: imageSource.title || 'Related source image'
      };
    }

    return {
      mode: 'empty',
      alt: (question && question.statement) || 'No media available'
    };
  }

  function renderRevealMedia(media, fallbackText) {
    const item = media || { mode: 'empty' };
    if (item.mode === 'video' && item.embedUrl) {
      return '<div class="reveal-media media-video">' +
        '<div class="reveal-media-frame">' +
          '<iframe src="' + escapeHtml(item.embedUrl) + '" title="' + escapeHtml(item.alt || 'Related video') + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>' +
        '</div>' +
      '</div>';
    }
    if (item.mode === 'image' && item.imageUrl) {
      return '<div class="reveal-media media-image">' +
        '<div class="reveal-media-frame">' +
          '<img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.alt || fallbackText || 'Related image') + '" loading="eager" referrerpolicy="no-referrer" onerror="this.parentNode.parentNode.classList.add(&quot;is-broken&quot;); this.remove();">' +
          '<div class="reveal-media-fallback"><div class="fallback-kicker">Related source</div><div class="fallback-copy">Open the source links below for the original article or patent.</div></div>' +
        '</div>' +
      '</div>';
    }
    return '<div class="reveal-media media-empty is-broken">' +
      '<div class="reveal-media-frame">' +
        '<div class="reveal-media-fallback"><div class="fallback-kicker">Reveal</div><div class="fallback-copy">Open the source links below for the full artifact.</div></div>' +
      '</div>' +
    '</div>';
  }

  window.addEventListener('pointerdown', function () {
    initAudio();
  }, { passive: true });

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
    playReady: playReady,
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
    sessionTemplate: sessionTemplate,
    reactionForPlayer: reactionForPlayer,
    renderReaction: renderReaction,
    resolveRevealMedia: resolveRevealMedia,
    renderRevealMedia: renderRevealMedia,
    correctEntries: correctEntries
  };
})();
