# Dosed — multi-pet medication tracker

Offline-first Expo/React Native app with a cloud-hosted sync server, so
the same account works across iOS, Android, and however many devices a
household has. Local SQLite is still the source of truth for reads — the
app works fully offline and syncs opportunistically.

## About that install error

`Error: The required package 'expo-asset' cannot be found` means the
`node_modules` install is incomplete/inconsistent, not that a package is
missing from `package.json`. Fix with a clean install:

```
cd dosed
rm -rf node_modules package-lock.json
npm install
npx expo install --fix   # aligns every Expo package to a mutually-compatible set
npx expo start
```

This project's `package.json` uses `"*"` for most Expo packages on
purpose — `expo install --fix` is the source of truth for versions, not
hand-picked numbers in this file.

## Project layout

```
app/            expo-router screens (client)
src/            client source (db, sync engine, api client, theme, components)
server/         the cloud sync server (Node/Express/PostgreSQL) — separate deploy
```

## Running the client

```
cd dosed
npm install && npx expo install --fix
cp .env.example .env.local        # point EXPO_PUBLIC_API_URL at your server
npx expo start
```

## Running the server locally

```
cd server
cp .env.example .env              # fill in JWT_SECRET at minimum
docker compose up --build         # Postgres + API on :3000
npm run selfcheck                 # register -> sync round trip -> refresh rotation, end to end
```

Or without Docker: `npm install && npm run migrate && npm run dev`.

## Deploying

Railway is the least-friction option: build from `server/Dockerfile`,
attach its managed Postgres plugin (sets `DATABASE_URL` automatically),
set `JWT_SECRET` (`openssl rand -hex 32`) and `NODE_ENV=production`.
Render, Fly.io, or a VPS with `docker compose` work the same way — the
Dockerfile is host-agnostic. The container's `CMD` runs migrations then
starts the server, so there's no separate migration step in CI/CD.

To actually deliver verification/reset emails, set `SMTP_HOST`,
`SMTP_USER`, `SMTP_PASS` to any provider that speaks SMTP (Resend,
Postmark, SES, Mailgun, ...). Unset, those emails are logged to stdout
instead of sent — the whole flow still works, it just won't reach a real
inbox until you plug in a provider.

## Accounts

Sign-up collects **email**, **username**, and an **optional phone
number**; sign-in accepts either email or username. All three are
unique per account. Phone is stored but not currently used for anything
(no SMS OTP — see "Not done" below) — it's there for account recovery
contact info and to have the field ready when/if SMS verification gets
added.

## Auth model — how the hardening actually works

- **Short-lived access tokens (15 min), long-lived opaque refresh tokens
  (60 days).** The access token is what's sent on every request, so its
  blast radius if intercepted is small. The refresh token is a random
  string, not a JWT — the database stores only its SHA-256 hash, so a
  database dump alone doesn't hand out usable tokens.
- **Refresh token rotation with reuse detection.** Every time a refresh
  token is exchanged, it's replaced with a new one and marked used. If a
  *used* (already-rotated) refresh token is ever presented again, that's
  treated as theft — the entire token family for that session is revoked
  immediately, forcing a fresh login. This is what makes a stolen refresh
  token a one-time-use liability instead of a 60-day standing backdoor.
  `server/src/selfcheck.ts` has a runnable test for exactly this.
- **Per-account lockout**: 5 failed logins locks the account for 15
  minutes. Combined with the existing per-IP rate limit on `/api/auth/*`
  — the rate limit stops one IP spraying many accounts, the lockout stops
  many IPs hammering one account.
- **Password reset revokes every session.** Resetting or changing a
  password immediately signs out every device on the account — the
  moment someone resets a password is often exactly the moment every
  existing session should be considered suspect.
- **Email enumeration resistance.** `/api/account/request-password-reset`
  always returns success regardless of whether the email exists, so it
  can't be used to check which emails are registered.
- **Sessions are listable and individually revocable** (`GET
  /api/auth/sessions`, `DELETE /api/auth/sessions/:id`) plus a "sign out
  everywhere" (`POST /api/auth/logout-all`), surfaced in the app's
  Settings screen.

## How sync works

Every synced row (`pets`, `medications`, `dose_logs`) carries `updatedAt`
and `deletedAt`. Push/pull merge with **last-write-wins by `updatedAt`**
in both directions, and deletes are soft (tombstoned, not removed) so a
delete on one device propagates instead of reappearing. Sync runs after
login, on app foreground, and as fire-and-forget after every local edit.
There's no background sync task for a fully-closed app — add
`expo-background-fetch` if that gap matters for you.

## What's genuinely covered now vs. what "bulletproof" would actually take

Real refresh-token rotation with reuse detection, per-account lockout,
password reset/change that revokes sessions, email verification,
enumeration-resistant reset requests, structured logging, rate limiting,
input validation, and a runnable test for the security-critical logic.
That is a legitimately solid baseline. It is not the same thing as
"bulletproof" — that phrase doesn't have a finish line, and anyone who
tells you their app has reached it is selling something. Concretely
still missing, in roughly the order I'd add it:

- **SMS/phone verification.** The `phone` field is stored but unverified
  — actually verifying it needs a paid SMS provider (Twilio, Vonage) and
  an account with them, which isn't something I can wire up without your
  credentials. The code has one obvious seam for it: mirror
  `lib/mailer.ts`'s pattern (real send if configured, log otherwise) as
  `lib/sms.ts`, add an OTP table like the email/reset ones, done.
- **2FA / passkeys.** Not implemented. Passkeys (WebAuthn) are the
  current best practice over TOTP if you add this later.
- **Argon2id instead of bcrypt.** bcrypt (via `bcryptjs`, pure JS, no
  native build step) is still considered fine, but Argon2id is the more
  modern recommendation if you want to move off it.
- **Basic fixed-window lockout, not exponential backoff, and it doesn't
  correlate with IP.** A distributed slow-drip attack across many IPs
  against one account, or credential stuffing across many accounts each
  just under the lockout threshold, isn't caught by what's here. A proper
  WAF (Cloudflare, AWS WAF) in front of the API is the real answer to
  that class of problem, not more application code.
- **No dependency vulnerability scanning in CI** (Dependabot/Snyk),
  **no automated Postgres backups** (turn on your host's managed-Postgres
  backup feature — don't roll your own), **no monitoring/alerting**
  wired to anything (pino logs structured JSON to stdout, which most
  hosts capture and let you search, but nothing pages anyone).
- **No DDoS mitigation** beyond the application-level rate limits — that's
  infrastructure (Cloudflare/host-level), not something an Express app
  can meaningfully provide on its own.
- **No security audit / pentest.** Nothing here has been reviewed by
  anyone but me. Treat this as a strong starting point for a real
  product, not as a substitute for one before you have real users' data
  on the line.

## Immutable audit trail + step-up authentication

Two patterns worth calling out because they map directly onto real
attacks, not just checkbox compliance:

- **`security_audit_log`** records every security-relevant event
  (register, login success/failure, lockout, password change/reset,
  email verification, session revocation, and — importantly —
  `refresh_reuse_detected`, the token-theft signal from the refresh
  rotation logic). It's append-only enforced by a **database trigger**
  that rejects any `UPDATE`/`DELETE` on the table outright, not just "the
  app code happens not to call those" — that holds even if the app's own
  DB credential were compromised. The last 50 events per account are
  visible in Settings → Recent activity, and readable via `GET
  /api/account/audit-log`.
- **Step-up re-authentication ("sudo mode") on sign-out-everywhere.**
  `POST /api/auth/logout-all` now requires the current password in the
  request body, not just a valid access token. The reasoning: an access
  token proves "this device had a valid token a few minutes ago," not
  "the account owner is the one holding the device right now" — a phone
  left unlocked on a table has a valid access token. High-blast-radius
  actions (this one revokes every session on the account) should cost
  more than that. Password change already had this property from the
  start (it always required the current password); this brings
  sign-out-everywhere in line with it.

## On the OAuth2/OIDC/SAML/passkey reference material

That's genuinely good context for where this could go, and it's worth
being specific about which parts apply and which don't:

- **"Sign in with Google/Apple" (OIDC)** is a real, worthwhile addition —
  it removes password-related risk for users who choose it entirely
  (no password to phish, reuse, or leak) and is standard on both
  platforms' app store guidelines for social-login apps. I didn't wire
  it up because it needs *your* OAuth client IDs from the Google Cloud
  Console and Apple Developer portal — those are tied to your developer
  accounts and can't be generated on your behalf. `expo-auth-session` is
  the standard library for it in an Expo app when you're ready; it's a
  clean addition on top of the current token system (the server would
  issue its own access/refresh pair after verifying the Google/Apple ID
  token, same as it does after a password login now).
- **FIDO2/WebAuthn passkeys** are the modern replacement for passwords
  entirely, and are the right long-term direction — but real support
  needs a dedicated library (`@simplewebauthn/server` on the backend,
  plus platform passkey APIs on the client) and is enough surface area
  to be its own project rather than something to bolt on alongside
  everything else in this pass.
- **SAML 2.0 and LDAP** are enterprise-SSO and corporate-directory
  patterns (image 1's "large corporations," "employees," "corporate
  directory") — not relevant to a consumer app with individual accounts
  like this one. They'd matter if this ever became something a vet
  clinic's *staff* logged into with their employer-issued credentials,
  not for pet owners.
- **The admin-impersonation architecture (image 2)** is a support/admin
  tool for a different kind of product — an internal panel where an
  employee (Finance/School Portal staff) temporarily acts as a customer
  for support purposes. Dosed has no admin panel or staff-impersonation
  feature, so most of that document doesn't have a corresponding surface
  here. The two ideas from it that *do* generalize — an immutable audit
  log, and step-up re-authentication before a high-privilege action —
  are the two implemented above.

## Other known limitations

- Time-of-day entry for medications is a plain `"08:00, 20:00"` text
  field, not a picker UI.
- `npm install` versions in the client are pinned loosely on purpose —
  run `npx expo install --check` after cloning.
- `babel.config.js`'s reanimated plugin path may need updating: newer
  `react-native-reanimated` majors moved worklet compilation into a
  separate `react-native-worklets` package with its own babel plugin.
  Check that package's current docs if `expo start` complains about it.
- Push notifications are scheduled 14 days ahead; a device offline that
  long needs one reopen to get its next batch queued. Unrelated to sync.
