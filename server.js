import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

const localEnvPath = path.resolve('.env');
const parentEnvPath = path.resolve('..', '..', '.env');

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else if (fs.existsSync(parentEnvPath)) {
  dotenv.config({ path: parentEnvPath });
}

const port = Number(process.env.WORDDROP_PORT) || 3030;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const realtimeTranscribeModel =
  process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL
  || process.env.OPENAI_TRANSCRIBE_MODEL
  || 'gpt-4o-mini-transcribe';
const realtimeVadThreshold = Number(process.env.OPENAI_REALTIME_VAD_THRESHOLD) || 0.45;
const realtimeVadPrefixPaddingMs = Number(process.env.OPENAI_REALTIME_VAD_PREFIX_MS) || 200;
const realtimeVadSilenceMs = Number(process.env.OPENAI_REALTIME_VAD_SILENCE_MS) || 280;

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response);
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 30 * 1024 * 1024) {
        reject(new Error('Request body exceeds 30MB.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    request.on('error', reject);
  });
}

function decodeBase64Audio(dataUrlOrBase64) {
  if (dataUrlOrBase64.startsWith('data:')) {
    const match = dataUrlOrBase64.match(/^data:audio\/[a-zA-Z0-9+.-]+(?:;[a-zA-Z0-9=+.-]+)*;base64,(.+)$/);
    if (!match) {
      throw new Error('Malformed audio data URL.');
    }
    return Buffer.from(match[1], 'base64');
  }

  return Buffer.from(dataUrlOrBase64, 'base64');
}

function getAudioExtension(mimeType = '') {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  return 'webm';
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.js') return 'application/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.json') return 'application/json; charset=utf-8';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.wav') return 'audio/wav';
  return 'application/octet-stream';
}

function serveStaticFile(response, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const safeRelativePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.resolve('.', `.${safeRelativePath}`);
  const workspaceRoot = path.resolve('.');

  if (!filePath.startsWith(workspaceRoot)) {
    sendJson(response, 403, {
      success: false,
      error: 'Forbidden.',
    });
    return true;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  response.writeHead(200, { 'Content-Type': getContentType(filePath) });
  fs.createReadStream(filePath).pipe(response);
  return true;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') {
    setCorsHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      status: 'ok',
      port,
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
      realtimeModel: realtimeTranscribeModel,
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/test') {
    sendJson(response, 200, {
      success: true,
      message: 'WordDrop speech server is reachable.',
      port,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/realtime/transcription-session') {
    if (!process.env.OPENAI_API_KEY) {
      sendJson(response, 500, {
        success: false,
        error: 'OPENAI_API_KEY is not configured.',
      });
      return;
    }

    try {
      const rawBody = await readRequestBody(request);
      const body = JSON.parse(rawBody || '{}');
      const {
        sdp,
        language = 'en',
        prompt = '',
        model = realtimeTranscribeModel,
      } = body;

      if (!sdp || typeof sdp !== 'string') {
        sendJson(response, 400, {
          success: false,
          error: 'sdp is required.',
        });
        return;
      }

      const sessionConfig = {
        type: 'transcription',
        audio: {
          input: {
            noise_reduction: {
              type: 'near_field',
            },
            transcription: {
              model,
              language,
              ...(prompt ? { prompt } : {}),
            },
            turn_detection: {
              type: 'server_vad',
              threshold: realtimeVadThreshold,
              prefix_padding_ms: realtimeVadPrefixPaddingMs,
              silence_duration_ms: realtimeVadSilenceMs,
            },
          },
        },
      };

      const formData = new FormData();
      formData.set('sdp', sdp);
      formData.set('session', JSON.stringify(sessionConfig));

      const realtimeResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formData,
      });

      const realtimeAnswer = await realtimeResponse.text();
      if (!realtimeResponse.ok) {
        throw new Error(realtimeAnswer || `Realtime session failed (${realtimeResponse.status}).`);
      }

      sendJson(response, 200, {
        success: true,
        data: {
          sdp: realtimeAnswer,
          model,
          language,
        },
      });
      return;
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        error: error.message || 'Failed to create realtime transcription session.',
      });
      return;
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/transcribe') {
    if (!process.env.OPENAI_API_KEY) {
      sendJson(response, 500, {
        success: false,
        error: 'OPENAI_API_KEY is not configured.',
      });
      return;
    }

    try {
      const rawBody = await readRequestBody(request);
      const body = JSON.parse(rawBody || '{}');
      const {
        audioData,
        mimeType = 'audio/webm',
        language = 'en',
        prompt,
      } = body;

      if (!audioData || typeof audioData !== 'string') {
        sendJson(response, 400, {
          success: false,
          error: 'audioData is required.',
        });
        return;
      }

      const audioBuffer = decodeBase64Audio(audioData);
      if (audioBuffer.length === 0) {
        sendJson(response, 400, {
          success: false,
          error: 'Audio payload is empty.',
        });
        return;
      }

      if (audioBuffer.length > 25 * 1024 * 1024) {
        sendJson(response, 400, {
          success: false,
          error: 'Audio payload exceeds 25MB.',
        });
        return;
      }

      const extension = getAudioExtension(mimeType);
      const file = await toFile(
        audioBuffer,
        `worddrop-${Date.now()}.${extension}`,
        { type: mimeType },
      );

      const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
      const transcription = await openai.audio.transcriptions.create({
        file,
        model,
        language,
        response_format: 'json',
        ...(prompt ? { prompt } : {}),
      });

      sendJson(response, 200, {
        success: true,
        data: {
          transcript: transcription.text?.trim() || '',
          language,
          model,
        },
      });
      return;
    } catch (error) {
      sendJson(response, 500, {
        success: false,
        error: error.message || 'Failed to transcribe audio.',
      });
      return;
    }
  }

  if (request.method === 'GET' && serveStaticFile(response, url.pathname)) {
    return;
  }

  sendJson(response, 404, {
    success: false,
    error: 'Not found.',
  });
});

server.listen(port, () => {
  console.log(`WordDrop speech server running on http://localhost:${port}`);
});
