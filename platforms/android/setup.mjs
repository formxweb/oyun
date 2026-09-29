// Prepares the Android project: builds the game, (re)generates the Capacitor project, installs
// the native plugins and the Play libraries, and applies the manifest settings the game needs.
// Usage: VITE_API_URL=https://api.example PGS_PROJECT_ID=... PGS_SERVER_CLIENT_ID=... node setup.mjs
// PGS_* are public Play Games identifiers (not secrets); without them the game signs in as a guest.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const run = (cmd, cwd = here, env = {}) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
const cfg = JSON.parse(readFileSync(join(here, 'capacitor.config.json'), 'utf8'));
const pkgPath = cfg.appId.split('.');

const BILLING = 'com.android.billingclient:billing:8.3.0';
const GAMES = 'com.google.android.gms:play-services-games-v2:22.1.0';

if (!process.env.VITE_API_URL) console.warn('[android] VITE_API_URL is not set: the build will play offline only (no cloud, boards or store)');
run('npm run build', root, { VITE_STORE: 'google' });
if (!existsSync(join(here, 'android'))) run('npx cap add android');

const app = join(here, 'android', 'app');
const java = join(app, 'src', 'main', 'java');

// native plugins
const plugDir = join(java, 'games', 'vertigo', 'plugins');
mkdirSync(plugDir, { recursive: true });
for (const f of ['VertigoBillingPlugin.java', 'VertigoGamesPlugin.java']) copyFileSync(join(here, 'native', f), join(plugDir, f));
const actDir = join(java, ...pkgPath);
mkdirSync(actDir, { recursive: true });
writeFileSync(join(actDir, 'MainActivity.java'), readFileSync(join(here, 'native', 'MainActivity.java'), 'utf8').replace('__APP_PACKAGE__', cfg.appId));

// Play libraries
const gradle = join(app, 'build.gradle');
let g = readFileSync(gradle, 'utf8');
for (const dep of [BILLING, GAMES]) {
  const name = dep.split(':').slice(0, 2).join(':');
  if (g.includes(name)) g = g.replace(new RegExp(`implementation ["']${name}:[^"']+["']`), `implementation "${dep}"`);
  else g = g.replace(/dependencies\s*\{/, (m) => `${m}\n    implementation "${dep}"`);
}
writeFileSync(gradle, g);

// manifest: landscape game activity, Play Games project id
const manifestPath = join(app, 'src', 'main', 'AndroidManifest.xml');
let m = readFileSync(manifestPath, 'utf8');
if (!m.includes('android:screenOrientation')) m = m.replace(/<activity\b/, '<activity android:screenOrientation="sensorLandscape"');
if (!m.includes('com.google.android.gms.games.APP_ID') && process.env.PGS_PROJECT_ID) {
  m = m.replace(/<application\b([^>]*)>/, (x) => `${x}\n        <meta-data android:name="com.google.android.gms.games.APP_ID" android:value="@string/game_services_project_id" />`);
}
writeFileSync(manifestPath, m);

// public Play Games ids; games-ids.xml as exported from the Play Console (achievement ids)
const values = join(app, 'src', 'main', 'res', 'values');
mkdirSync(values, { recursive: true });
const esc = (s) => s.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));
const strings = [];
if (process.env.PGS_PROJECT_ID) strings.push(`    <string name="game_services_project_id" translatable="false">${esc(process.env.PGS_PROJECT_ID)}</string>`);
if (process.env.PGS_SERVER_CLIENT_ID) strings.push(`    <string name="server_client_id" translatable="false">${esc(process.env.PGS_SERVER_CLIENT_ID)}</string>`);
writeFileSync(join(values, 'vertigo_games.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${strings.join('\n')}\n</resources>\n`);
if (existsSync(join(here, 'games-ids.xml'))) copyFileSync(join(here, 'games-ids.xml'), join(values, 'games-ids.xml'));
else console.warn('[android] no games-ids.xml: Play Games achievements will not unlock until it is added');

run('npx cap sync android');
console.log('[android] ready: open platforms/android/android in Android Studio, or run ./gradlew bundleRelease there');
