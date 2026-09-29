import { createGameServer } from './app';
import { Db } from './db';
import { GooglePlayApi, SteamWebApi } from './platforms';

/**
 * Entry point: `npm run server`. Configuration comes only from the environment (see
 * server/.env.example); platform credentials never ship in any client build.
 */
const env = process.env;
const port = Number(env.PORT ?? 8787);
const db = new Db(env.DATA_DIR ?? new URL('./data', import.meta.url).pathname);

const steam =
  env.STEAM_WEB_API_KEY && env.STEAM_APP_ID
    ? new SteamWebApi({ apiKey: env.STEAM_WEB_API_KEY, appId: env.STEAM_APP_ID, sandbox: env.STEAM_SANDBOX === '1', identity: env.STEAM_AUTH_IDENTITY ?? 'vertigo' })
    : null;

const google =
  env.GOOGLE_PACKAGE_NAME && env.GOOGLE_SERVICE_ACCOUNT
    ? new GooglePlayApi({
        packageName: env.GOOGLE_PACKAGE_NAME,
        serviceAccount: env.GOOGLE_SERVICE_ACCOUNT,
        oauthClientId: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        oauthClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      })
    : null;

const app = createGameServer({ db, steam, google, corsOrigin: env.CORS_ORIGIN ?? '*', tokenDays: Number(env.TOKEN_DAYS ?? 90) });

app.server.listen(port, () => {
  console.log(`[vertigo] listening on :${port}  steam=${steam ? (env.STEAM_SANDBOX === '1' ? 'sandbox' : 'live') : 'off'}  google=${google ? 'on' : 'off'}`);
});

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    console.log('[vertigo] shutting down, saving state');
    app.close().then(() => process.exit(0));
  });
}
