// Starts the API (Express, port 4000) and the web app (Vite, port 5173) together,
// with labelled output. Ctrl+C stops both. Works on Windows, macOS and Linux.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 19)) {
  console.error(`Node.js ${process.versions.node} is too old. Install Node.js 22 LTS or newer (20.19+ also works).`);
  process.exit(1);
}

if (!fs.existsSync(path.join(root, 'node_modules'))) {
  console.error('Dependencies are not installed yet. Run "npm install" in the project folder first.');
  process.exit(1);
}

if (!fs.existsSync(path.join(root, 'server', '.env'))) {
  console.log('\x1b[33mNote:\x1b[0m server/.env not found, so default settings are used (postgres://postgres:postgres@localhost:5432/infodemic).');
  console.log('      Copy server/.env.example to server/.env to change them.\n');
}

const tasks = [
  { name: 'server', color: '\x1b[35m', command: 'npm run dev --workspace server' },
  { name: 'client', color: '\x1b[36m', command: 'npm run dev --workspace client' },
];

const children = [];
let stopping = false;

function pipe(stream, out, label) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) out.write(`${label} ${line}\n`);
  });
  stream.on('end', () => {
    if (buffer) out.write(`${label} ${buffer}\n`);
  });
}

function kill(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone
    }
  }
}

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) kill(child);
  setTimeout(() => process.exit(code), 800);
}

console.log('Starting Infodemic…');
console.log('  API      http://localhost:4000/api/health');
console.log('  Web app  http://localhost:5173   (open this one)\n');

for (const task of tasks) {
  const label = `${task.color}${task.name.padEnd(6)} │\x1b[0m`;
  const child = spawn(task.command, {
    cwd: root,
    shell: true,
    detached: !isWindows, // own process group, so Ctrl+C can stop npm and everything it started
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
  });
  pipe(child.stdout, process.stdout, label);
  pipe(child.stderr, process.stderr, label);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.log(`${label} stopped (${signal || `exit code ${code}`}). Stopping the other process too.`);
    stopAll(code || 1);
  });
  children.push(child);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
