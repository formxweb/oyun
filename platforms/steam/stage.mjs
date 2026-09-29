// Builds the game for Steam and copies it into ./app for Electron.
// VITE_API_URL must point at the production backend; no secret goes into this build.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
if (!process.env.VITE_API_URL) console.warn('[stage] VITE_API_URL is not set: the build will play offline only (no cloud, boards or store)');
execSync('npm run build', { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_STORE: 'steam' } });
const out = join(here, 'app');
if (existsSync(out)) rmSync(out, { recursive: true });
cpSync(join(root, 'dist'), out, { recursive: true });
console.log('[stage] game copied to platforms/steam/app');
