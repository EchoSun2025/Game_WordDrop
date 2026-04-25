const STORAGE_KEYS = {
  pack: 'worddrop.importedPack',
  mode: 'worddrop.mode',
};

const API_BASE_URL = window.location.origin.startsWith('http')
  ? window.location.origin
  : 'http://localhost:3030';
const WORDDROP_TRANSCRIBE_URL = `${API_BASE_URL}/api/transcribe`;

const MODE_CONFIG = {
  image: {
    label: '图像匹配',
    durationMs: 4500,
    intro: '在时间结束前选中正确图片。',
    minimumWords: 3,
  },
  sentence: {
    label: '句子匹配',
    durationMs: 9000,
    intro: '选择或朗读与当前单词匹配的句子。',
    minimumWords: 3,
  },
  builder: {
    label: '限时造句',
    durationMs: 15000,
    intro: '说出或输入一个包含目标词的完整句子。',
    minimumWords: 1,
  },
};

const DEFAULT_PACK = {
  name: 'Starter Pack',
  words: [
    {
      word: 'Apple',
      zh: '苹果',
      pos: 'noun',
      definition: 'a round fruit with red or green skin',
      example: 'I eat an apple every day.',
      context: 'She polished the apple before putting it into the basket.',
      image: './assets/apple.jpg',
    },
    {
      word: 'Raven',
      zh: '乌鸦',
      pos: 'noun',
      definition: 'a large black bird',
      example: 'A raven landed on the old gate.',
      context: 'The raven watched the valley from the tower.',
      image: './assets/raven.jpg',
    },
    {
      word: 'Cottage',
      zh: '小屋',
      pos: 'noun',
      definition: 'a small house, usually in the countryside',
      example: 'They spent the weekend in a stone cottage.',
      context: 'Smoke curled above the cottage beside the hill.',
      image: './assets/cottage.jpg',
    },
    {
      word: 'Moat',
      zh: '护城河',
      pos: 'noun',
      definition: 'a deep ditch filled with water around a castle',
      example: 'The castle stood behind a wide moat.',
      context: 'Moonlight shimmered on the moat around the tower.',
      image: './assets/moat.png',
    },
    {
      word: 'Hood',
      zh: '兜帽',
      pos: 'noun',
      definition: 'a covering for the head attached to a coat',
      example: 'She pulled her hood over her hair.',
      context: 'Rain tapped softly on the hood of his cloak.',
      image: './assets/hood.jpg',
    },
    {
      word: 'Hazelnuts',
      zh: '榛子',
      pos: 'noun',
      definition: 'small round brown nuts',
      example: 'The squirrel hid hazelnuts in the leaves.',
      context: 'A bowl of hazelnuts waited on the wooden table.',
      image: './assets/hazelnuts.jpg',
    },
  ],
};

const state = {
  pack: null,
  mode: localStorage.getItem(STORAGE_KEYS.mode) || 'image',
  roundIndex: 0,
  score: 0,
  energy: 0,
  played: 0,
  attempts: 0,
  hits: 0,
  streak: 0,
  progress: 0,
  currentRound: null,
  sessionWords: [],
  timer: null,
  nextRoundTimer: null,
  waitingNextRound: false,
  lastTranscript: 'Voice: off',
  lastInterimTranscript: '',
  isListening: false,
  isTranscribing: false,
  voiceTranscriber: null,
  voicePurpose: null,
  mediaRecorder: null,
  mediaStream: null,
  audioChunks: [],
};

const refs = {
  scoreValue: document.getElementById('scoreValue'),
  energyValue: document.getElementById('energyValue'),
  learnedValue: document.getElementById('learnedValue'),
  accuracyValue: document.getElementById('accuracyValue'),
  roundValue: document.getElementById('roundValue'),
  levelValue: document.getElementById('levelValue'),
  modeValue: document.getElementById('modeValue'),
  packName: document.getElementById('packName'),
  packMeta: document.getElementById('packMeta'),
  fallingWord: document.getElementById('fallingWord'),
  timerFill: document.getElementById('timerFill'),
  timerText: document.getElementById('timerText'),
  challengePanel: document.getElementById('challengePanel'),
  feedbackTitle: document.getElementById('feedbackTitle'),
  feedbackText: document.getElementById('feedbackText'),
  feedbackTranscript: document.getElementById('feedbackTranscript'),
  feedbackWord: document.getElementById('feedbackWord'),
  feedbackPos: document.getElementById('feedbackPos'),
  feedbackImage: document.getElementById('feedbackImage'),
  startButton: document.getElementById('startButton'),
  importFile: document.getElementById('importFile'),
  resetPackButton: document.getElementById('resetPackButton'),
  phoneFrame: document.querySelector('.phone-frame'),
  hintText: document.getElementById('hintText'),
  modeButtons: Array.from(document.querySelectorAll('.mode-button')),
};

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shuffle(list) {
  const clone = [...list];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[randomIndex]] = [clone[randomIndex], clone[index]];
  }
  return clone;
}

function getLevel() {
  if (state.streak >= 6) return 3;
  if (state.streak >= 3) return 2;
  return 1;
}

function getAccuracy() {
  if (!state.attempts) return '0%';
  return `${Math.round((state.hits / state.attempts) * 100)}%`;
}

function speakWord(word) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.96;
  window.speechSynthesis.speak(utterance);
}

function setTranscript(text) {
  state.lastTranscript = text;
  refs.feedbackTranscript.textContent = text;
}

function setListeningState(nextState) {
  state.isListening = nextState;
  renderChallengePanel();
}

function setTranscribingState(nextState) {
  state.isTranscribing = nextState;
  renderChallengePanel();
}

function getSupportedAudioMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];

  return candidates.find((mimeType) => window.MediaRecorder?.isTypeSupported?.(mimeType)) || '';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read audio blob.'));
    reader.readAsDataURL(blob);
  });
}

async function transcribeRecordedAudio(audioBlob, language = 'en', prompt = '') {
  const audioData = await blobToDataUrl(audioBlob);
  let response;
  try {
    response = await fetch(WORDDROP_TRANSCRIBE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioData,
        mimeType: audioBlob.type || 'audio/webm',
        language,
        prompt,
      }),
    });
  } catch (error) {
    if (error.message === 'Failed to fetch') {
      throw new Error('WordDrop speech server is not reachable on http://localhost:3030.');
    }
    throw error;
  }

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || `Transcription failed (${response.status})`);
  }

  return result.data?.transcript?.trim() || '';
}

function releaseAudioStream() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
  }
}

async function startAudioCapture() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support microphone recording.');
  }

  const mimeType = getSupportedAudioMimeType();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

  state.audioChunks = [];
  state.mediaStream = stream;
  state.mediaRecorder = recorder;

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) {
      state.audioChunks.push(event.data);
    }
  });

  recorder.start();
}

async function stopAudioCaptureAndTranscribe({ language = 'en', prompt = '' } = {}) {
  const recorder = state.mediaRecorder;
  if (!recorder) {
    throw new Error('No active recording.');
  }

  return new Promise((resolve, reject) => {
    recorder.addEventListener('stop', async () => {
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(state.audioChunks, { type: mimeType });
        state.audioChunks = [];
        state.mediaRecorder = null;
        releaseAudioStream();

        if (audioBlob.size === 0) {
          throw new Error('Recorded audio is empty.');
        }

        setTranscribingState(true);
        const transcript = await transcribeRecordedAudio(audioBlob, language, prompt);
        setTranscribingState(false);
        resolve(transcript);
      } catch (error) {
        setTranscribingState(false);
        reject(error);
      }
    }, { once: true });

    recorder.stop();
  });
}

function normalizeEntry(raw, index) {
  const images = Array.isArray(raw.images)
    ? raw.images
    : Array.isArray(raw.emojiImagePath)
      ? raw.emojiImagePath
      : raw.image
        ? [raw.image]
        : raw.imagePath
          ? [raw.imagePath]
          : raw.emojiImagePath
            ? [raw.emojiImagePath]
            : [];

  const word = String(raw.word || raw.text || '').trim();
  const baseForm = String(raw.baseForm || word).trim();
  const wordForms = Array.isArray(raw.wordForms) ? raw.wordForms : [];
  const acceptedForms = Array.from(
    new Set(
      [word, baseForm, ...wordForms]
        .map((item) => normalizeText(item))
        .filter(Boolean),
    ),
  );

  return {
    id: String(raw.id || `${normalizeText(word)}-${index}`),
    word,
    baseForm,
    zh: String(raw.zh || raw.chinese || '').trim() || '未提供中文',
    definition: String(raw.definition || '').trim() || 'No definition provided.',
    pos: String(raw.pos || raw.partOfSpeech || 'unknown').trim() || 'unknown',
    example: String(raw.example || '').trim(),
    context: String(raw.context || raw.sentenceContext || raw.sentence || '').trim(),
    sentenceTranslation: String(raw.sentenceTranslation || raw.translation || '').trim(),
    image: String(images[0] || '').trim(),
    images: images.map((item) => String(item).trim()).filter(Boolean),
    wordForms,
    acceptedForms,
  };
}

function normalizePack(input, fallbackName = 'Imported Pack') {
  const pack = Array.isArray(input)
    ? { words: input, name: fallbackName }
    : Array.isArray(input?.words)
      ? input
      : Array.isArray(input?.data?.words)
        ? { ...input, words: input.data.words }
        : null;

  if (!pack) {
    throw new Error('JSON 格式不正确，需要是数组或 { words: [] }。');
  }

  const words = pack.words
    .map((item, index) => normalizeEntry(item, index))
    .filter((item) => item.word && item.image);

  if (words.length === 0) {
    throw new Error('没有可用词条。每个词至少需要 word 和 image。');
  }

  return {
    name: pack.name || pack.packName || fallbackName,
    words,
  };
}

function saveImportedPack(pack) {
  localStorage.setItem(STORAGE_KEYS.pack, JSON.stringify(pack));
}

function loadInitialPack() {
  const stored = localStorage.getItem(STORAGE_KEYS.pack);
  if (!stored) {
    return normalizePack(DEFAULT_PACK, DEFAULT_PACK.name);
  }

  try {
    return normalizePack(JSON.parse(stored), 'Imported Pack');
  } catch {
    localStorage.removeItem(STORAGE_KEYS.pack);
    return normalizePack(DEFAULT_PACK, DEFAULT_PACK.name);
  }
}

function getPlayableWords(mode) {
  const words = state.pack.words;
  if (mode === 'image') {
    return words.filter((item) => item.image);
  }
  if (mode === 'sentence') {
    return words.filter((item) => getSentenceSource(item) && item.image);
  }
  return words.filter((item) => (item.context || item.example || item.definition) && item.image);
}

function updatePackMeta() {
  const imageCount = getPlayableWords('image').length;
  const sentenceCount = getPlayableWords('sentence').length;
  const builderCount = getPlayableWords('builder').length;
  refs.packName.textContent = state.pack.name;
  refs.packMeta.textContent = `${state.pack.words.length} words · 图像 ${imageCount} · 句子 ${sentenceCount} · 造句 ${builderCount}`;
}

function updateHeader() {
  refs.scoreValue.textContent = String(state.score);
  refs.energyValue.textContent = String(state.energy);
  refs.learnedValue.textContent = String(state.played);
  refs.accuracyValue.textContent = getAccuracy();
  refs.roundValue.textContent = `${Math.min(state.roundIndex + (state.currentRound ? 1 : 0), state.sessionWords.length)} / ${state.sessionWords.length || 0}`;
  refs.levelValue.textContent = `LV${getLevel()}`;
  refs.modeValue.textContent = MODE_CONFIG[state.mode].label;
}

function setFeedback(title, text, item, extraTranscript) {
  refs.feedbackTitle.textContent = title;
  refs.feedbackText.textContent = text;
  refs.feedbackWord.textContent = `Word: ${item ? `${item.word} / ${item.zh}` : '--'}`;
  refs.feedbackPos.textContent = `POS: ${item ? item.pos : '--'}`;
  refs.feedbackImage.src = item?.image || './assets/apple.jpg';
  refs.feedbackImage.alt = item?.word || '当前反馈图片';
  if (extraTranscript) {
    setTranscript(extraTranscript);
  }
}

function renderTimer() {
  if (!state.currentRound) {
    refs.timerFill.style.transform = 'scaleX(1)';
    refs.timerText.textContent = '0.0s';
    return;
  }

  const durationMs = MODE_CONFIG[state.mode].durationMs;
  const secondsLeft = Math.max(0, ((100 - state.progress) / 100) * (durationMs / 1000));
  refs.timerFill.style.transform = `scaleX(${Math.max(0, 1 - state.progress / 100)})`;
  refs.timerText.textContent = `${secondsLeft.toFixed(1)}s`;
}

function renderFallingWord() {
  if (!state.currentRound) {
    refs.fallingWord.textContent = 'READY';
    refs.fallingWord.style.top = '18%';
    renderTimer();
    return;
  }

  refs.fallingWord.textContent = state.currentRound.target.word.toUpperCase();
  refs.fallingWord.style.top = `${12 + state.progress * 0.74}%`;
  renderTimer();
}

function getSentenceSource(item) {
  return item.example || item.context || '';
}

function getSentenceHint(item) {
  if (item.sentenceTranslation) return item.sentenceTranslation;
  return `${item.zh} · ${item.definition}`;
}

function maskSentence(sentence, forms) {
  let masked = sentence;
  const orderedForms = [...forms].sort((left, right) => right.length - left.length);
  orderedForms.forEach((form) => {
    const escaped = escapeRegExp(form);
    masked = masked.replace(new RegExp(`\\b${escaped}\\b`, 'ig'), '_____');
  });
  return masked;
}

function sampleOthers(pool, currentId, count) {
  return shuffle(pool.filter((item) => item.id !== currentId)).slice(0, count);
}

function buildImageRound(target) {
  const options = shuffle([target, ...sampleOthers(getPlayableWords('image'), target.id, 2)]);
  return {
    type: 'image',
    target,
    options,
    featuredIndex: Math.floor(Math.random() * options.length),
    revealIndex: null,
    chosenIndex: null,
    result: null,
  };
}

function buildSentenceRound(target) {
  const pool = getPlayableWords('sentence');
  const options = shuffle([target, ...sampleOthers(pool, target.id, 2)]).map((item) => ({
    id: item.id,
    item,
    fullSentence: getSentenceSource(item),
    maskedSentence: maskSentence(getSentenceSource(item), item.acceptedForms),
    translation: getSentenceHint(item),
  }));

  return {
    type: 'sentence',
    target,
    options,
    revealIndex: null,
    chosenIndex: null,
    result: null,
  };
}

function buildBuilderRound(target) {
  return {
    type: 'builder',
    target,
    result: null,
    submittedText: '',
  };
}

function buildRound(target) {
  if (state.mode === 'image') return buildImageRound(target);
  if (state.mode === 'sentence') return buildSentenceRound(target);
  return buildBuilderRound(target);
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

function stopListening() {
  if (state.voiceTranscriber) {
    state.voiceTranscriber.stop({ silent: true }).catch(() => {});
    state.voiceTranscriber = null;
  }
  state.voicePurpose = null;
  state.isListening = false;
  state.isTranscribing = false;
  state.lastInterimTranscript = '';
  releaseAudioStream();
  renderChallengePanel();
}

function scoreSentenceMatch(transcript, sentence) {
  const left = normalizeText(transcript).split(' ').filter(Boolean);
  const right = normalizeText(sentence).split(' ').filter(Boolean);
  if (!left.length || !right.length) return 0;

  const rightSet = new Set(right);
  let hits = 0;
  left.forEach((token) => {
    if (rightSet.has(token)) hits += 1;
  });

  return hits / Math.max(right.length, left.length);
}

function evaluateBuilderSubmission(text, target) {
  const normalized = normalizeText(text);
  const tokens = normalized.split(' ').filter(Boolean);
  const containsTarget = target.acceptedForms.some((form) => normalized.includes(form));
  const punctuationBonus = /[.!?]$/.test(text.trim()) ? 1 : 0;

  if (!containsTarget) {
    return {
      valid: false,
      message: `句子里需要包含 ${target.word} 或它的词形变化。`,
    };
  }

  if (tokens.length < 4) {
    return {
      valid: false,
      message: '句子太短了，至少写 4 个单词。',
    };
  }

  const bonus = Math.min(3, Math.floor(tokens.length / 4)) + punctuationBonus;
  return {
    valid: true,
    bonus,
    message: `造句通过。长度 ${tokens.length} 词。`,
  };
}

function revealRound(result, chosenIndex = null) {
  stopTimer();
  stopListening();
  if (state.currentRound) {
    state.currentRound.result = result;
    state.currentRound.chosenIndex = chosenIndex;
    if (state.currentRound.type !== 'builder') {
      state.currentRound.revealIndex = state.currentRound.options.findIndex((option) => {
        const item = option.item || option;
        return item.id === state.currentRound.target.id;
      });
    }
  }
  refs.phoneFrame.classList.add('round-complete');
  renderChallengePanel();
}

function applyReward(basePoints) {
  const level = getLevel();
  state.score += basePoints * level;
  state.energy += level;
}

function handleImageChoice(index) {
  if (!state.currentRound || state.waitingNextRound) return;
  state.attempts += 1;
  const selected = state.currentRound.options[index];
  const target = state.currentRound.target;

  if (selected.id === target.id) {
    state.hits += 1;
    state.streak += 1;
    applyReward(10);
    revealRound('correct', index);
    setFeedback('命中', `图片匹配成功。得分 +${10 * getLevel()}。`, target);
    speakWord(target.word);
  } else {
    state.streak = 0;
    revealRound('wrong', index);
    setFeedback('选错了', `正确图片对应 ${target.word} / ${target.zh}。`, target);
  }

  state.played += 1;
  updateHeader();
  queueNextRound();
}

function handleSentenceChoice(index, transcript = '') {
  if (!state.currentRound || state.waitingNextRound) return;
  state.attempts += 1;
  const selected = state.currentRound.options[index];
  const target = state.currentRound.target;

  if (selected.item.id === target.id) {
    state.hits += 1;
    state.streak += 1;
    applyReward(12);
    revealRound('correct', index);
    setFeedback(
      '句子匹配成功',
      `${selected.fullSentence} ｜ 中文提示：${selected.translation}`,
      target,
      transcript ? `Voice: ${transcript}` : state.lastTranscript,
    );
    speakWord(target.word);
  } else {
    state.streak = 0;
    revealRound('wrong', index);
    const correct = state.currentRound.options.find((option) => option.item.id === target.id);
    setFeedback(
      '句子选错了',
      `正确句子是：${correct.fullSentence} ｜ 中文提示：${correct.translation}`,
      target,
      transcript ? `Voice: ${transcript}` : state.lastTranscript,
    );
  }

  state.played += 1;
  updateHeader();
  queueNextRound();
}

function handleBuilderSubmit(text, transcript = '') {
  if (!state.currentRound || state.waitingNextRound) return;
  const target = state.currentRound.target;
  const result = evaluateBuilderSubmission(text, target);
  state.attempts += 1;
  state.currentRound.submittedText = text;

  if (result.valid) {
    state.hits += 1;
    state.streak += 1;
    applyReward(14 + result.bonus);
    revealRound('correct');
    setFeedback(
      '造句通过',
      `${result.message} 你的句子：${text}`,
      target,
      transcript ? `Voice: ${transcript}` : state.lastTranscript,
    );
    speakWord(target.word);
  } else {
    state.streak = 0;
    revealRound('wrong');
    setFeedback(
      '造句未通过',
      `${result.message} 参考语境：${getSentenceSource(target) || target.definition}`,
      target,
      transcript ? `Voice: ${transcript}` : state.lastTranscript,
    );
  }

  state.played += 1;
  updateHeader();
  queueNextRound();
}

function handleTimeout() {
  if (!state.currentRound || state.waitingNextRound) return;
  state.attempts += 1;
  state.streak = 0;
  state.played += 1;

  revealRound('timeout');
  if (state.mode === 'sentence') {
    const correct = state.currentRound.options.find((option) => option.item.id === state.currentRound.target.id);
    setFeedback('超时', `正确句子是：${correct.fullSentence}`, state.currentRound.target);
  } else if (state.mode === 'builder') {
    setFeedback(
      '超时',
      `可以参考：${getSentenceSource(state.currentRound.target) || state.currentRound.target.definition}`,
      state.currentRound.target,
    );
  } else {
    setFeedback('超时', `正确答案是 ${state.currentRound.target.word} / ${state.currentRound.target.zh}。`, state.currentRound.target);
  }

  updateHeader();
  queueNextRound();
}

function queueNextRound() {
  if (state.waitingNextRound) return;
  state.waitingNextRound = true;
  state.nextRoundTimer = window.setTimeout(() => {
    state.nextRoundTimer = null;
    state.roundIndex += 1;
    startRound();
  }, 1300);
}

function renderImagePanel() {
  const { options, featuredIndex, revealIndex, chosenIndex, result } = state.currentRound;
  return `
    <div class="challenge-card">
      <div class="basket-grid">
        ${options.map((item, index) => `
          <button class="basket-button ${featuredIndex === index ? 'is-featured' : ''} ${revealIndex === index ? 'is-correct' : ''} ${result === 'wrong' && chosenIndex === index ? 'is-wrong' : ''}" data-choice="${index}" type="button">
            <p class="basket-ascii">[ BASKET ${index + 1} ]</p>
            <img class="basket-image" src="${escapeHtml(item.image)}" alt="Choice ${index + 1}" />
            <p class="basket-label">Choice ${index + 1}</p>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderSentencePanel() {
  const { options, revealIndex, chosenIndex, result } = state.currentRound;
  return `
    <div class="challenge-card">
      <div class="sentence-stack">
        ${options.map((option, index) => `
          <button class="sentence-option ${revealIndex === index ? 'is-correct' : ''} ${result === 'wrong' && chosenIndex === index ? 'is-wrong' : ''}" data-choice="${index}" type="button">
            <span class="sentence-index">0${index + 1}</span>
            <div>
              <p class="sentence-text">${escapeHtml(revealIndex === index ? option.fullSentence : option.maskedSentence)}</p>
              <p class="sentence-translation">${escapeHtml(option.translation)}</p>
            </div>
          </button>
        `).join('')}
      </div>
      <div class="voice-row">
        <button class="voice-button ${state.isListening ? 'is-listening' : ''}" id="sentenceVoiceButton" type="button">
          ${state.isTranscribing ? '识别中...' : state.isListening ? '停止并识别' : '开始录音匹配'}
        </button>
      </div>
    </div>
  `;
}

function renderBuilderPanel() {
  const target = state.currentRound.target;
  const submitted = state.currentRound.submittedText || '';
  return `
    <div class="builder-panel">
      <p class="tiny-label">PROMPT</p>
      <p class="builder-prompt">用 <strong>${escapeHtml(target.word)}</strong> 造一个完整句子。可以打字，也可以点击录音按钮口述。</p>
      <textarea id="builderTextarea" class="builder-textarea" placeholder="Type your sentence here...">${escapeHtml(submitted)}</textarea>
      <div class="builder-actions">
        <button class="voice-button ${state.isListening ? 'is-listening' : ''}" id="builderVoiceButton" type="button">
          ${state.isTranscribing ? '识别中...' : state.isListening ? '停止并识别' : '开始录音'}
        </button>
        <button class="builder-submit" id="builderSubmitButton" type="button">提交句子</button>
      </div>
      <p class="builder-helper">判定规则：必须包含目标词或其词形变化，且句子至少 4 个词。</p>
    </div>
  `;
}

function renderEmptyState(message) {
  refs.challengePanel.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderChallengePanel() {
  if (!state.currentRound) {
    renderEmptyState(MODE_CONFIG[state.mode].intro);
    return;
  }

  if (state.mode === 'image') {
    refs.challengePanel.innerHTML = renderImagePanel();
  } else if (state.mode === 'sentence') {
    refs.challengePanel.innerHTML = renderSentencePanel();
  } else {
    refs.challengePanel.innerHTML = renderBuilderPanel();
  }

  if (state.mode === 'image' || state.mode === 'sentence') {
    refs.challengePanel.querySelectorAll('[data-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-choice'));
        if (state.mode === 'image') {
          handleImageChoice(index);
        } else {
          handleSentenceChoice(index);
        }
      });
    });
  }

  if (state.mode === 'sentence') {
    const voiceButton = document.getElementById('sentenceVoiceButton');
    voiceButton?.addEventListener('click', () => {
      toggleRecognition('sentence');
    });
  }

  if (state.mode === 'builder') {
    document.getElementById('builderSubmitButton')?.addEventListener('click', () => {
      const text = document.getElementById('builderTextarea').value.trim();
      handleBuilderSubmit(text);
    });
    document.getElementById('builderVoiceButton')?.addEventListener('click', () => {
      toggleRecognition('builder');
    });
  }
}

function startRound() {
  if (state.roundIndex >= state.sessionWords.length) {
    finishSession();
    return;
  }

  const target = state.sessionWords[state.roundIndex];
  state.progress = 0;
  state.waitingNextRound = false;
  state.currentRound = buildRound(target);
  refs.phoneFrame.classList.remove('round-complete');
  setTranscript(state.isListening ? 'Voice: listening live...' : 'Voice: realtime ready');
  setFeedback('新一轮开始', MODE_CONFIG[state.mode].intro, target);
  updateHeader();
  renderFallingWord();
  renderChallengePanel();
  stopTimer();

  state.timer = window.setInterval(() => {
    state.progress += (50 / MODE_CONFIG[state.mode].durationMs) * 100;
    renderFallingWord();
    if (state.progress >= 100) {
      handleTimeout();
    }
  }, 50);
}

function finishSession() {
  stopTimer();
  stopNextRoundTimer();
  stopListening();
  state.currentRound = null;
  refs.phoneFrame.classList.remove('round-complete');
  refs.fallingWord.textContent = 'FINISH';
  refs.fallingWord.style.top = '50%';
  refs.timerFill.style.transform = 'scaleX(0)';
  refs.timerText.textContent = '0.0s';
  renderEmptyState(`本轮结束。当前模式：${MODE_CONFIG[state.mode].label}`);
  setFeedback(
    '本轮结束',
    `完成 ${state.played} 轮，命中 ${state.hits} 次，命中率 ${getAccuracy()}。点击下方按钮重新开始。`,
    state.sessionWords[state.sessionWords.length - 1] || state.pack.words[0],
  );
  updateHeader();
}

function resetSessionState() {
  stopTimer();
  stopNextRoundTimer();
  stopListening();
  state.roundIndex = 0;
  state.score = 0;
  state.energy = 0;
  state.played = 0;
  state.attempts = 0;
  state.hits = 0;
  state.streak = 0;
  state.progress = 0;
  state.currentRound = null;
  state.sessionWords = [];
  state.waitingNextRound = false;
  refs.phoneFrame.classList.remove('round-complete');
  renderFallingWord();
  updateHeader();
}

function startSession() {
  resetSessionState();

  const pool = shuffle(getPlayableWords(state.mode));
  if (pool.length < MODE_CONFIG[state.mode].minimumWords) {
    state.sessionWords = [];
    state.currentRound = null;
    updateHeader();
    renderFallingWord();
    renderEmptyState(`当前数据包不足以运行 ${MODE_CONFIG[state.mode].label}。`);
    setFeedback('数据不足', '请导入更多带图片和句子的词条。', state.pack.words[0]);
    return;
  }

  state.roundIndex = 0;
  state.score = 0;
  state.energy = 0;
  state.played = 0;
  state.attempts = 0;
  state.hits = 0;
  state.streak = 0;
  state.progress = 0;
  state.sessionWords = pool;
  startRound();
}

function setMode(mode) {
  state.mode = mode;
  localStorage.setItem(STORAGE_KEYS.mode, mode);
  refs.modeButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === mode);
  });
  resetSessionState();
  renderChallengePanel();
  setFeedback('模式已切换', MODE_CONFIG[mode].intro, state.pack.words[0]);
}

async function toggleRecognition(purpose) {
  if (!window.WordDropRealtimeTranscriber?.isSupported()) {
    setTranscript('Voice: realtime transcription not supported');
    return;
  }

  if (state.isListening || state.isTranscribing) {
    stopListening();
    setTranscript('Voice: realtime transcription stopped');
    return;
  }

  try {
    const transcriber = new window.WordDropRealtimeTranscriber({
      apiBaseUrl: API_BASE_URL,
      language: 'en',
      prompt: 'Transcribe the spoken English sentence accurately in real time.',
      onStatus: (text) => {
        if (state.isListening || state.isTranscribing) {
          setTranscript(`Voice: ${text}`);
        }
      },
      onInterim: (text) => {
        state.lastInterimTranscript = text;
        setTranscript(text ? `Voice live: ${text}` : 'Voice: processing speech...');
      },
      onFinal: async (transcript) => {
        const finalText = transcript || '';
        const currentPurpose = state.voicePurpose;
        const activeTranscriber = state.voiceTranscriber;

        state.lastInterimTranscript = '';
        state.voiceTranscriber = null;
        state.voicePurpose = null;
        setListeningState(false);
        setTranscribingState(false);
        setTranscript(`Voice final: ${finalText || 'no speech captured'}`);

        if (activeTranscriber) {
          await activeTranscriber.stop({ silent: true });
        }

        if (!finalText) return;

        if (currentPurpose === 'sentence' && state.mode === 'sentence' && state.currentRound) {
          let bestIndex = 0;
          let bestScore = -1;
          state.currentRound.options.forEach((option, index) => {
            const score = scoreSentenceMatch(finalText, option.fullSentence);
            if (score > bestScore) {
              bestScore = score;
              bestIndex = index;
            }
          });
          handleSentenceChoice(bestIndex, finalText);
          return;
        }

        if (currentPurpose === 'builder' && state.mode === 'builder') {
          const textarea = document.getElementById('builderTextarea');
          if (textarea) {
            textarea.value = finalText;
          }
        }
      },
      onError: (error) => {
        state.voiceTranscriber = null;
        state.voicePurpose = null;
        setListeningState(false);
        setTranscribingState(false);
        setTranscript(`Voice error: ${error.message || 'failed to start realtime transcription'}`);
      },
    });

    state.voiceTranscriber = transcriber;
    state.voicePurpose = purpose;
    setTranscribingState(true);
    setTranscript('Voice: connecting realtime transcription...');
    await transcriber.start({
      language: 'en',
      prompt: 'Transcribe the spoken English sentence accurately in real time.',
    });
    state.lastInterimTranscript = '';
    setTranscribingState(false);
    setListeningState(true);
    setTranscript('Voice: listening live...');
  } catch (error) {
    state.voiceTranscriber = null;
    state.voicePurpose = null;
    setListeningState(false);
    setTranscribingState(false);
    setTranscript(`Voice error: ${error.message || error.name || 'failed to start realtime transcription'}`);
  }
}

function setupRecognition() {
  if (!window.WordDropRealtimeTranscriber?.isSupported()) {
    setTranscript('Voice: realtime transcription not supported');
    return;
  }

  setTranscript('Voice: OpenAI realtime transcription ready');
}

function handleImport(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const pack = normalizePack(parsed, file.name.replace(/\.json$/i, ''));
      state.pack = pack;
      saveImportedPack(pack);
      resetSessionState();
      updatePackMeta();
      setFeedback('导入成功', `${pack.name} 已载入。点开始即可进入当前模式。`, pack.words[0]);
      renderChallengePanel();
    } catch (error) {
      setFeedback('导入失败', error.message || '无法解析 JSON。', state.pack.words[0]);
    }
    refs.importFile.value = '';
  };
  reader.readAsText(file, 'utf-8');
}

function handleResetPack() {
  localStorage.removeItem(STORAGE_KEYS.pack);
  state.pack = normalizePack(DEFAULT_PACK, DEFAULT_PACK.name);
  resetSessionState();
  updatePackMeta();
  setFeedback('已恢复内置包', '当前数据已切回内置 Starter Pack。', state.pack.words[0]);
  renderChallengePanel();
}

refs.modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setMode(button.dataset.mode);
  });
});

refs.startButton.addEventListener('click', startSession);
refs.importFile.addEventListener('change', handleImport);
refs.resetPackButton.addEventListener('click', handleResetPack);

window.addEventListener('keydown', (event) => {
  if (!state.currentRound || state.waitingNextRound) return;

  if ((state.mode === 'image' || state.mode === 'sentence') && ['1', '2', '3'].includes(event.key)) {
    const choice = Number(event.key) - 1;
    if (state.mode === 'image') {
      handleImageChoice(choice);
    } else {
      handleSentenceChoice(choice);
    }
  }

  if (state.mode === 'builder' && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    const textarea = document.getElementById('builderTextarea');
    handleBuilderSubmit(textarea?.value?.trim() || '');
  }
});

state.pack = loadInitialPack();
setupRecognition();
setMode(state.mode);
updatePackMeta();
updateHeader();
renderFallingWord();
renderChallengePanel();
setFeedback('准备开始', '先选择模式，再点开始。导入 JSON 后会自动切换到你的词包。', state.pack.words[0]);
