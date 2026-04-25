const API_BASE_URL = window.location.origin.startsWith('http')
  ? window.location.origin
  : 'http://localhost:3030';

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

const state = {
  transcriber: null,
  finalTranscripts: [],
};

function appendLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  refs.eventLog.textContent = `[${timestamp}] ${message}\n${refs.eventLog.textContent}`.trim();
}

function setStatus(text) {
  refs.recognitionStatus.textContent = `Status: ${text}`;
  appendLog(text);
}

async function checkBackend() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) return `http ${response.status}`;
    const result = await response.json();
    return result?.status === 'ok'
      ? `reachable on ${result.port} (${result.realtimeModel || result.model})`
      : 'unhealthy';
  } catch {
    return 'unreachable';
  }
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
  const backend = await checkBackend();
  const items = [
    ['WebRTC', window.RTCPeerConnection ? 'supported' : 'not supported'],
    ['Protocol', window.location.protocol || 'unknown'],
    ['Secure Context', window.isSecureContext ? 'yes' : 'no'],
    ['Mic Permission', permission],
    ['Backend', backend],
    ['User Agent', navigator.userAgent],
  ];

  refs.statusList.innerHTML = items.map(([label, value]) => `
    <div class="status-item">
      <span>${label}</span>
      <span>${value}</span>
    </div>
  `).join('');
}

function buildTranscriber() {
  return new window.WordDropRealtimeTranscriber({
    apiBaseUrl: API_BASE_URL,
    language: refs.languageSelect.value,
    prompt: 'Transcribe the speech accurately in the original language.',
    onStatus: setStatus,
    onEvent: appendLog,
    onInterim: (text) => {
      refs.interimOutput.value = text;
    },
    onFinal: (text) => {
      if (text) {
        state.finalTranscripts.push(text);
      }
      refs.interimOutput.value = '';
      refs.finalOutput.value = state.finalTranscripts.join('\n');
      setStatus(text ? 'realtime transcription turn completed' : 'no speech captured');
    },
    onError: (error) => {
      setStatus(`error: ${error.message || 'realtime transcription failed'}`);
    },
  });
}

async function startRealtimeTest() {
  if (!window.WordDropRealtimeTranscriber?.isSupported()) {
    setStatus('error: realtime WebRTC transcription is not supported in this browser');
    return;
  }

  if (state.transcriber?.isActive || state.transcriber?.isStarting) {
    setStatus('realtime transcription is already running');
    return;
  }

  refs.interimOutput.value = '';
  refs.finalOutput.value = '';
  state.finalTranscripts = [];
  state.transcriber = buildTranscriber();

  try {
    await state.transcriber.start({
      language: refs.languageSelect.value,
      prompt: 'Transcribe the speech accurately in the original language.',
    });
  } catch (error) {
    state.transcriber = null;
    setStatus(`error: ${error.message || 'failed to start realtime transcription'}`);
  }
}

async function stopRealtimeTest() {
  if (!state.transcriber) {
    setStatus('no active realtime transcription session');
    return;
  }

  try {
    await state.transcriber.stop();
  } finally {
    state.transcriber = null;
  }
}

refs.refreshStatusButton.addEventListener('click', refreshStatus);
refs.startButton.addEventListener('click', startRealtimeTest);
refs.stopButton.addEventListener('click', stopRealtimeTest);
refs.languageSelect.addEventListener('change', () => {
  setStatus(`language set to ${refs.languageSelect.value}`);
});

refreshStatus();
setStatus('idle');
