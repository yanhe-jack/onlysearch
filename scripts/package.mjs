import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

if (!existsSync(distDir)) {
  console.error('❌ Build output not found. Please run "npm run build" first.');
  process.exit(1);
}

const releaseDir = path.join(projectRoot, 'release');
mkdirSync(releaseDir, { recursive: true });

const archivePath = path.join(releaseDir, 'focus-unlock-assistant.tar.gz');

if (existsSync(archivePath)) {
  rmSync(archivePath);
}

const tarResult = spawnSync('tar', ['-czf', archivePath, '-C', distDir, '.'], {
  stdio: 'inherit',
});

if (tarResult.error) {
  console.error('❌ Failed to create package:', tarResult.error.message);
  process.exit(1);
}

if (tarResult.status !== 0) {
  console.error('❌ tar command exited with code', tarResult.status);
  process.exit(tarResult.status ?? 1);
}

console.log(`✅ Package created at ${archivePath}`);
console.log('解压后打开 dist/index.html 即可体验。');
