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
    const match = dataUrlOrBase64.match(/^data:audio\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
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

  sendJson(response, 404, {
    success: false,
    error: 'Not found.',
  });
});

server.listen(port, () => {
  console.log(`WordDrop speech server running on http://localhost:${port}`);
});
