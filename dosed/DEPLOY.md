# Deploy runbook

## 1. Backend (Railway)

Root directory for the Railway service: `server/`
Builder: pinned to Dockerfile via `server/railway.json` (don't let Railway auto-detect — its Node buildpack skips the migration step baked into the Dockerfile's `CMD`).

Set these env vars in the Railway dashboard:

| Var | Value |
|---|---|
| `DATABASE_URL` | auto-filled if you attach Railway's Postgres plugin — don't set manually |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `NODE_ENV` | `production` |
| `APP_URL` | your app's deep link, e.g. `dosed://auth/` — used only inside verification/reset email text |
| `CORS_ORIGINS` | leave blank unless you add a web client |
| `R2_ACCESS_KEY_ID` | from the R2 API token you created |
| `R2_SECRET_ACCESS_KEY` | from the same token |
| `R2_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | `dosed-photos` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | optional — omit and emails log to stdout instead of sending |

Deploy, then check:
```
curl https://<your-railway-url>/healthz
# -> {"ok":true}
```
If that 404s or times out, the Dockerfile build likely didn't run — check Railway's build logs confirm `DOCKERFILE` builder was used, not Nixpacks.

## 2. Fill in the real API URL

Edit `eas.json` and replace every `REPLACE_WITH_YOUR_RAILWAY_URL` with the URL from step 1 (preview and production profiles).

## 3. Mobile app (EAS)

```bash
npm install -g eas-cli
eas login
eas init          # links this project to an EAS project, writes the real
                   # projectId into app.json's "updates.url" (replaces the
                   # REPLACE_AFTER_EAS_INIT placeholder) — run this once
eas build --platform all --profile production
```

For Android submission you'll also need a Google Play service account key saved at `google-service-account.json` (gitignored — never commit it). For iOS, fill in `appleId` / `appleTeamId` in `eas.json`; `ascAppId` can stay blank for the first submit, EAS will prompt.

```bash
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

## 4. Future updates

- JS-only change (no new native module, no `app.json` native config change) → `eas update --branch production --message "what changed"`, users get it on next app open, no store review. The `production` build profile is wired to the `production` channel (see `eas.json`), so this only reaches users running a build made from that profile — a `preview` build won't pick up a `production`-channel update, and vice versa.
- Anything touching native code, permissions, or `app.json`'s `plugins`/`ios`/`android` blocks → new `eas build` + `eas submit`, back through store review. `runtimeVersion.policy: "appVersion"` (set in `app.json`) means a native change requires bumping `version` too, or EAS Update will refuse to serve that update to the older runtime — this is what stops a JS-only OTA from accidentally reaching a build that needs a native rebuild.

## Quick order of operations

1. Deploy server to Railway with all env vars above, confirm `/healthz`.
2. Put that URL into `eas.json` (both `preview` and `production`).
3. `eas init` (once) to link the EAS project and fill in `app.json`'s `updates.url`.
4. `eas build --platform all --profile production`
5. `eas submit` for both stores.
6. Future JS-only fixes: `eas update --branch production --message "..."`.

## 5. CI: automated OTA pushes

`npx expo install expo-updates` was needed and is now in `package.json` — without it, `eas update` pushes bundles that no installed app ever checks for. `app/_layout.tsx` now calls `applyPendingUpdate()` (in `src/lib/updates.ts`) once at launch: checks, fetches, and reloads if a newer bundle exists. It's a no-op under `expo start` (dev) and silent on any failure (offline, unreachable) so a bad network check never blocks startup.

- **`eas-update-preview.yml`** — runs automatically on every push to `main`. Pushes to the `preview` channel only, which only your own internal test builds (the `preview` eas.json profile) receive. A typecheck failure blocks the push.
- **`eas-update-production.yml`** — manual only (`workflow_dispatch` from the GitHub Actions tab). You pick the exact commit/branch and confirm before it reaches real users. This is intentional — full auto-push to production skips the one human check that catches "this typo compiles but breaks the med schedule."

Setup, one-time:
1. `eas login` locally, then create an access token scoped to this project via the Expo dashboard → Access Tokens.
2. In GitHub: repo Settings → Secrets and variables → Actions → add `EXPO_TOKEN` with that value.

Recommended flow: merge to `main` → auto-lands on `preview` → install/verify on a `preview`-profile build → manually trigger the production workflow once you're confident → it lands on `production` and reaches real users on their next app open.
