const WORD_BANK = [
  {
    id: 'apple',
    word: 'Apple',
    pos: 'noun',
    zh: '苹果',
    image: './assets/apple.jpg',
  },
  {
    id: 'raven',
    word: 'Raven',
    pos: 'noun',
    zh: '乌鸦',
    image: './assets/raven.jpg',
  },
  {
    id: 'cottage',
    word: 'Cottage',
    pos: 'noun',
    zh: '小屋',
    image: './assets/cottage.jpg',
  },
  {
    id: 'moat',
    word: 'Moat',
    pos: 'noun',
    zh: '护城河',
    image: './assets/moat.png',
  },
  {
    id: 'hood',
    word: 'Hood',
    pos: 'noun',
    zh: '兜帽',
    image: './assets/hood.jpg',
  },
  {
    id: 'hazelnuts',
    word: 'Hazelnuts',
    pos: 'noun',
    zh: '榛子',
    image: './assets/hazelnuts.jpg',
  },
];

const ROUND_DURATION_MS = 4500;
const ROUND_DELAY_MS = 1300;
const TICK_MS = 50;

const state = {
  roundIndex: 0,
  score: 0,
  energy: 0,
  learned: 0,
  attempts: 0,
  hits: 0,
  streak: 0,
  progress: 0,
  currentRound: null,
  timer: null,
  nextRoundTimer: null,
  waitingNextRound: false,
};

const refs = {
  scoreValue: document.getElementById('scoreValue'),
  energyValue: document.getElementById('energyValue'),
  learnedValue: document.getElementById('learnedValue'),
  accuracyValue: document.getElementById('accuracyValue'),
  roundValue: document.getElementById('roundValue'),
  levelValue: document.getElementById('levelValue'),
  fallingWord: document.getElementById('fallingWord'),
  timerFill: document.getElementById('timerFill'),
  timerText: document.getElementById('timerText'),
  basketGrid: document.getElementById('basketGrid'),
  feedbackTitle: document.getElementById('feedbackTitle'),
  feedbackText: document.getElementById('feedbackText'),
  feedbackWord: document.getElementById('feedbackWord'),
  feedbackPos: document.getElementById('feedbackPos'),
  feedbackImage: document.getElementById('feedbackImage'),
  startButton: document.getElementById('startButton'),
  phoneFrame: document.querySelector('.phone-frame'),
};

function shuffle(list) {
  const clone = [...list];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[randomIndex]] = [clone[randomIndex], clone[index]];
  }
  return clone;
}

function getLevel() {
  if (state.streak >= 5) return 3;
  if (state.streak >= 2) return 2;
  return 1;
}

function getAccuracy() {
  if (!state.attempts) return '0%';
  return `${Math.round((state.hits / state.attempts) * 100)}%`;
}

function updateHeader() {
  refs.scoreValue.textContent = String(state.score);
  refs.energyValue.textContent = String(state.energy);
  refs.learnedValue.textContent = String(state.learned);
  refs.accuracyValue.textContent = getAccuracy();
  refs.roundValue.textContent = `${Math.min(state.roundIndex + 1, WORD_BANK.length)} / ${WORD_BANK.length}`;
  refs.levelValue.textContent = `LV${getLevel()}`;
}

function setFeedback(title, text, item) {
  refs.feedbackTitle.textContent = title;
  refs.feedbackText.textContent = text;
  refs.feedbackWord.textContent = `Word: ${item ? `${item.word} / ${item.zh}` : '--'}`;
  refs.feedbackPos.textContent = `POS: ${item ? item.pos : '--'}`;
  refs.feedbackImage.src = item ? item.image : './assets/apple.jpg';
  refs.feedbackImage.alt = item ? item.word : '当前反馈图片';
}

function speakWord(word) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function renderBaskets() {
  const { options, featuredIndex, revealIndex, chosenIndex, result } = state.currentRound;
  refs.basketGrid.innerHTML = '';

  options.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'basket-button';

    if (featuredIndex === index) {
      button.classList.add('is-featured');
    }

    if (revealIndex === index) {
      button.classList.add('is-correct');
    }

    if (result === 'wrong' && chosenIndex === index) {
      button.classList.add('is-wrong');
    }

    button.innerHTML = `
      <p class="basket-ascii">[ BASKET ${index + 1} ]</p>
      <img class="basket-image" src="${item.image}" alt="Option ${index + 1}" />
      <p class="basket-label">Choice ${index + 1}</p>
    `;
    button.addEventListener('click', () => handleChoice(index));
    refs.basketGrid.appendChild(button);
  });
}

function renderFallingWord() {
  if (!state.currentRound) return;
  refs.fallingWord.textContent = state.currentRound.target.word.toUpperCase();
  refs.fallingWord.style.top = `${10 + state.progress * 0.78}%`;
  refs.timerFill.style.transform = `scaleX(${Math.max(0, 1 - state.progress / 100)})`;
  refs.timerText.textContent = `${Math.max(0, ((100 - state.progress) / 100) * (ROUND_DURATION_MS / 1000)).toFixed(1)}s`;
}

function stopTimer() {
  if (state.timer) {
    window.clearInterval(state.timer);
    state.timer = null;
  }
}

function stopNextRoundTimer() {
  if (state.nextRoundTimer) {
    window.clearTimeout(state.nextRoundTimer);
    state.nextRoundTimer = null;
  }
}

function getDistractors(targetId) {
  const distractors = WORD_BANK.filter((item) => item.id !== targetId);
  return shuffle(distractors).slice(0, 2);
}

function buildRound(target) {
  const options = shuffle([target, ...getDistractors(target.id)]);
  return {
    target,
    options,
    featuredIndex: Math.floor(Math.random() * options.length),
    revealIndex: null,
    chosenIndex: null,
    result: null,
  };
}

function startRound() {
  if (state.roundIndex >= WORD_BANK.length) {
    finishGame();
    return;
  }

  state.progress = 0;
  state.waitingNextRound = false;
  state.currentRound = buildRound(WORD_BANK[state.roundIndex]);
  refs.phoneFrame.classList.remove('round-complete');

  updateHeader();
  setFeedback(
    '单词开始下落',
    '在时间结束前选中对应图片，命中后会朗读单词并加分。',
    state.currentRound.target,
  );
  renderBaskets();
  renderFallingWord();
  stopTimer();

  state.timer = window.setInterval(() => {
    state.progress += (TICK_MS / ROUND_DURATION_MS) * 100;
    renderFallingWord();
    if (state.progress >= 100) {
      handleTimeout();
    }
  }, TICK_MS);
}

function queueNextRound() {
  if (state.waitingNextRound) return;
  state.waitingNextRound = true;
  state.nextRoundTimer = window.setTimeout(() => {
    state.roundIndex += 1;
    state.nextRoundTimer = null;
    startRound();
  }, ROUND_DELAY_MS);
}

function revealRound(result, chosenIndex = null) {
  stopTimer();
  state.currentRound.result = result;
  state.currentRound.chosenIndex = chosenIndex;
  state.currentRound.revealIndex = state.currentRound.options.findIndex(
    (item) => item.id === state.currentRound.target.id,
  );
  refs.phoneFrame.classList.add('round-complete');
  renderBaskets();
}

function handleChoice(index) {
  if (!state.currentRound || state.waitingNextRound) return;

  state.attempts += 1;
  const selected = state.currentRound.options[index];
  const target = state.currentRound.target;

  if (selected.id === target.id) {
    state.hits += 1;
    state.streak += 1;
    const level = getLevel();
    state.score += 10 * level;
    state.energy += level;
    state.learned += 1;
    revealRound('correct', index);
    setFeedback('命中', `+${10 * level} 分，能量 +${level}。`, target);
    speakWord(target.word);
  } else {
    state.streak = 0;
    state.learned += 1;
    revealRound('wrong', index);
    setFeedback('选错了', `正确答案是 ${target.word} / ${target.zh}。`, target);
  }

  updateHeader();
  queueNextRound();
}

function handleTimeout() {
  if (!state.currentRound || state.waitingNextRound) return;
  state.attempts += 1;
  state.streak = 0;
  state.learned += 1;
  revealRound('timeout');
  setFeedback('超时', `这轮应该选 ${state.currentRound.target.word} / ${state.currentRound.target.zh}。`, state.currentRound.target);
  updateHeader();
  queueNextRound();
}

function finishGame() {
  stopTimer();
  stopNextRoundTimer();
  state.currentRound = null;
  refs.phoneFrame.classList.remove('round-complete');
  refs.fallingWord.textContent = 'FINISH';
  refs.fallingWord.style.top = '50%';
  refs.timerFill.style.transform = 'scaleX(0)';
  refs.timerText.textContent = '0.0s';
  refs.basketGrid.innerHTML = '';
  setFeedback(
    '最小版结束',
    `共完成 ${state.learned} 轮，命中 ${state.hits} 次，命中率 ${getAccuracy()}。点击下方按钮重新开始。`,
    WORD_BANK[Math.max(0, WORD_BANK.length - 1)],
  );
  updateHeader();
}

function resetGame() {
  stopTimer();
  stopNextRoundTimer();
  state.roundIndex = 0;
  state.score = 0;
  state.energy = 0;
  state.learned = 0;
  state.attempts = 0;
  state.hits = 0;
  state.streak = 0;
  state.progress = 0;
  state.currentRound = null;
  state.waitingNextRound = false;
  refs.phoneFrame.classList.remove('round-complete');
  startRound();
}

refs.startButton.addEventListener('click', resetGame);

window.addEventListener('keydown', (event) => {
  if (!state.currentRound || state.waitingNextRound) return;
  const optionIndex = Number(event.key) - 1;
  if (optionIndex >= 0 && optionIndex <= 2) {
    handleChoice(optionIndex);
  }
});

setFeedback('准备开始', '点击下方按钮后，单词会开始下落。', WORD_BANK[0]);
updateHeader();
refs.fallingWord.textContent = 'READY';
refs.fallingWord.style.top = '18%';
refs.timerFill.style.transform = 'scaleX(1)';
refs.timerText.textContent = `${(ROUND_DURATION_MS / 1000).toFixed(1)}s`;
