const API_BASE_URL = 'http://localhost:3030';
const WORDDROP_TRANSCRIBE_URL = `${API_BASE_URL}/api/transcribe`;

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
  mediaRecorder: null,
  mediaStream: null,
  audioChunks: [],
};

function appendLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  refs.eventLog.textContent = `[${timestamp}] ${message}\n${refs.eventLog.textContent}`.trim();
}

function setStatus(text) {
  refs.recognitionStatus.textContent = `Status: ${text}`;
  appendLog(text);
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
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

async function checkBackend() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/test`);
    return response.ok ? 'reachable' : `http ${response.status}`;
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
    ['MediaRecorder', window.MediaRecorder ? 'supported' : 'not supported'],
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

function releaseAudioStream() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    throw new Error('Browser recording is not supported.');
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
      setStatus(`chunk received: ${event.data.size} bytes`);
    }
  });

  recorder.start();
  setStatus('recording... click Stop to transcribe');
}

async function transcribeBlob(audioBlob) {
  const response = await fetch(WORDDROP_TRANSCRIBE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audioData: await blobToDataUrl(audioBlob),
      mimeType: audioBlob.type || 'audio/webm',
      language: refs.languageSelect.value.startsWith('zh') ? 'zh' : 'en',
      prompt: 'Transcribe the speech accurately in the original language.',
    }),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data?.transcript?.trim() || '';
}

async function stopRecording() {
  if (!state.mediaRecorder) {
    setStatus('no active recording');
    return;
  }

  const recorder = state.mediaRecorder;
  setStatus('stopping recorder...');

  recorder.addEventListener('stop', async () => {
    try {
      const audioBlob = new Blob(state.audioChunks, { type: recorder.mimeType || 'audio/webm' });
      refs.interimOutput.value = `Recorded ${audioBlob.size} bytes`;
      state.audioChunks = [];
      state.mediaRecorder = null;
      releaseAudioStream();

      if (audioBlob.size === 0) {
        throw new Error('Recorded audio is empty.');
      }

      setStatus('uploading to backend...');
      const transcript = await transcribeBlob(audioBlob);
      refs.finalOutput.value = transcript || '(empty transcript)';
      refs.interimOutput.value = '';
      setStatus('OpenAI transcription completed');
    } catch (error) {
      refs.finalOutput.value = '';
      refs.interimOutput.value = '';
      setStatus(`error: ${error.message || 'transcription failed'}`);
    }
  }, { once: true });

  recorder.stop();
}

refs.refreshStatusButton.addEventListener('click', refreshStatus);
refs.startButton.addEventListener('click', async () => {
  refs.finalOutput.value = '';
  refs.interimOutput.value = '';

  try {
    await startRecording();
  } catch (error) {
    setStatus(`error: ${error.message || 'failed to start'}`);
  }
});
refs.stopButton.addEventListener('click', stopRecording);
refs.languageSelect.addEventListener('change', () => {
  setStatus(`language set to ${refs.languageSelect.value}`);
});

refreshStatus();
setStatus('idle');
