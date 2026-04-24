const refs = {
  statusList: document.getElementById('statusList'),
  refreshStatusButton: document.getElementById('refreshStatusButton'),
  languageSelect: document.getElementById('languageSelect'),
  startButton: document.getElementById('startRecognitionButton'),
  stopButton: document.getElementById('stopRecognitionButton'),
  recognitionStatus: document.getElementById('recognitionStatus'),
  interimOutput: document.getElementById('interimOutput'),
  finalOutput: document.getElementById('finalOutput'),
  eventLog: document.getElementById('eventLog'),
};

const RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  recognition: null,
  finalText: '',
  interimText: '',
};

function appendLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  refs.eventLog.textContent = `[${timestamp}] ${message}\n${refs.eventLog.textContent}`.trim();
}

function setStatus(text) {
  refs.recognitionStatus.textContent = `Status: ${text}`;
  appendLog(text);
}

function renderText() {
  refs.interimOutput.value = state.interimText;
  refs.finalOutput.value = state.finalText;
}

async function getPermissionState() {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    return result.state;
  } catch {
    return 'unknown';
  }
}

async function refreshStatus() {
  const permission = await getPermissionState();
  const items = [
    ['API', RecognitionClass ? 'supported' : 'not supported'],
    ['Protocol', window.location.protocol || 'unknown'],
    ['Secure Context', window.isSecureContext ? 'yes' : 'no'],
    ['Mic Permission', permission],
    ['User Agent', navigator.userAgent],
  ];

  refs.statusList.innerHTML = items.map(([label, value]) => `
    <div class="status-item">
      <span>${label}</span>
      <span>${value}</span>
    </div>
  `).join('');
}

function stopRecognition() {
  if (state.recognition) {
    state.recognition.stop();
  }
}

function buildRecognition() {
  if (!RecognitionClass) {
    setStatus('SpeechRecognition not supported in this browser');
    return null;
  }

  const recognition = new RecognitionClass();
  recognition.lang = refs.languageSelect.value;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => setStatus('recognition started');
  recognition.onaudiostart = () => setStatus('microphone audio started');
  recognition.onsoundstart = () => setStatus('sound detected');
  recognition.onspeechstart = () => setStatus('speech detected');
  recognition.onspeechend = () => setStatus('speech ended');
  recognition.onsoundend = () => setStatus('sound ended');
  recognition.onaudioend = () => setStatus('audio ended');
  recognition.onnomatch = () => setStatus('no match');

  recognition.onresult = (event) => {
    let finalText = state.finalText;
    let interimText = '';

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0]?.transcript || '';
      if (result.isFinal) {
        finalText += `${text} `;
      } else {
        interimText += text;
      }
    }

    state.finalText = finalText.trim();
    state.interimText = interimText.trim();
    renderText();
    setStatus(`result received${state.interimText ? ' (interim)' : ' (final)'}`);
  };

  recognition.onerror = (event) => {
    setStatus(`error: ${event.error || 'unknown'}`);
  };

  recognition.onend = () => {
    setStatus('recognition ended');
  };

  return recognition;
}

refs.refreshStatusButton.addEventListener('click', refreshStatus);

refs.startButton.addEventListener('click', () => {
  state.finalText = '';
  state.interimText = '';
  renderText();

  state.recognition = buildRecognition();
  if (!state.recognition) return;

  try {
    state.recognition.start();
  } catch (error) {
    setStatus(`start failed: ${error.name || 'error'}`);
  }
});

refs.stopButton.addEventListener('click', stopRecognition);
refs.languageSelect.addEventListener('change', () => {
  setStatus(`language set to ${refs.languageSelect.value}`);
});

refreshStatus();
setStatus('idle');
