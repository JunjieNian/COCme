import { closeSync, existsSync, openSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptsDir);

function isPortOpen(port) {
  return new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.setTimeout(750);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    const closed = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once('error', closed);
    socket.once('timeout', closed);
  });
}

function spawnDetached(command, args, cwd, logName) {
  const logPath = join(projectRoot, logName);
  const logFd = openSync(logPath, 'a');
  const child = spawn(command, args, {
    cwd,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });
  child.unref();
  closeSync(logFd);
  return { pid: child.pid, logPath };
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

const started = [];

if (!(await isPortOpen(8188))) {
  const comfyRoot = join(projectRoot, 'ComfyUI');
  const comfyPython = join(comfyRoot, '.venv-codex', 'Scripts', 'python.exe');
  const modelPath = join(comfyRoot, 'models', 'checkpoints', 'sd_turbo.safetensors');
  if (!existsSync(comfyPython) || !existsSync(modelPath)) {
    throw new Error('ComfyUI environment or SD-Turbo model is missing.');
  }
  started.push({
    service: 'comfyui',
    port: 8188,
    ...spawnDetached(
      comfyPython,
      [
        'main.py',
        '--listen',
        '127.0.0.1',
        '--port',
        '8188',
        '--lowvram',
        '--reserve-vram',
        '1.0',
        '--disable-auto-launch',
      ],
      comfyRoot,
      'comfyui.log',
    ),
  });
}

if (!(await isPortOpen(3000))) {
  const nextBin = join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!existsSync(nextBin)) throw new Error('Next.js is not installed. Run npm install first.');
  started.push({
    service: 'next',
    port: 3000,
    ...spawnDetached(
      process.execPath,
      [nextBin, 'start', '-p', '3000', '-H', '127.0.0.1'],
      projectRoot,
      'next.log',
    ),
  });
}

const results = [];
for (const service of started) {
  results.push({
    ...service,
    ready: await waitForPort(service.port, service.service === 'comfyui' ? 120_000 : 30_000),
  });
}

console.log(JSON.stringify({
  started: results,
  next: await isPortOpen(3000),
  comfyui: await isPortOpen(8188),
}));
