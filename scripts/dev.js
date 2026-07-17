import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const userProfileDir = path.resolve(rootDir, '.chrome-dev-profile');

console.log('[TubePark Dev] Starting Vite build in watch mode...');

// 1. Start Vite build watch
const viteProcess = spawn('npx', ['vite', 'build', '--watch'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

// 2. Launch Chrome with forced extension loading flags
function launchChrome() {
  console.log('[TubePark Dev] Launching Google Chrome with TubePark extension...');

  const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const args = [
    `--disable-extensions-except=${distDir}`,
    `--load-extension=${distDir}`,
    `--user-data-dir=${userProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'https://www.youtube.com',
  ];

  const chromeProcess = spawn(chromeExecutable, args, {
    detached: true,
    stdio: 'ignore',
  });

  chromeProcess.unref();
}

// Wait for initial build output before launching Chrome
const checkInterval = setInterval(() => {
  if (fs.existsSync(path.join(distDir, 'manifest.json'))) {
    clearInterval(checkInterval);
    setTimeout(launchChrome, 1000);
  }
}, 500);

process.on('SIGINT', () => {
  viteProcess.kill('SIGINT');
  process.exit(0);
});
