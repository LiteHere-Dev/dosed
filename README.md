# 🐾 Dosed

**Dosed** is an offline-first medication tracker designed for households managing medications for multiple pets.

The app keeps local data available even without an internet connection, while synchronizing data across devices when a connection is available.

Built with **Expo / React Native**, **SQLite**, **Node.js**, **Express**, and **PostgreSQL**.

---

## ✨ Features

### 🐶 Multi-Pet Medication Tracking
- Manage multiple pets from a single account
- Record medications for each pet
- Track medication doses and dose history
- Keep medication data available offline

### 📱 Offline-First

Dosed is designed around local-first data access.

- Local SQLite database is the source of truth for reads
- Core functionality continues working without an internet connection
- Changes are synchronized when connectivity returns
- Sync occurs after login, when the app returns to the foreground, and after local edits

### ☁️ Multi-Device Synchronization

A household can use the same account across multiple devices.

The sync system uses:

- `updatedAt` timestamps
- `deletedAt` tombstones
- Last-write-wins conflict resolution
- Soft deletes to prevent deleted records from reappearing

The synchronized entities currently include:

- Pets
- Medications
- Dose logs

### 🔐 Authentication & Security

Dosed includes several security protections beyond basic username/password authentication.

- 15-minute access tokens
- 60-day opaque refresh tokens
- SHA-256 hashing of refresh tokens in the database
- Refresh-token rotation
- Refresh-token reuse detection
- Automatic token-family revocation after reuse detection
- Per-account login lockout
- IP-based authentication rate limiting
- Password reset with session revocation
- Password-change session revocation
- Email enumeration-resistant password reset requests
- Individual session management
- Sign out of all devices
- Step-up authentication for high-impact account actions
- Input validation with Zod
- HTTP security headers through Helmet
- Structured logging with Pino

### 🧾 Security Audit Log

Security-sensitive account activity is recorded in an append-only audit trail.

Events include:

- Account registration
- Successful logins
- Failed logins
- Account lockouts
- Password changes
- Password resets
- Email verification
- Session revocation
- Refresh-token reuse detection

The audit table is protected by a PostgreSQL trigger that prevents updates and deletes.

Users can view recent account activity from:

**Settings → Recent Activity**

The API also exposes the account audit log.

### 📧 Email Verification & Password Recovery

Dosed supports email-based account functionality through SMTP.

Supported SMTP providers can include services such as:

- Resend
- Postmark
- Amazon SES
- Mailgun
- Other SMTP-compatible providers

When SMTP is not configured, email messages are logged to the server instead of being delivered.

### 🔔 Medication Notifications

The client uses Expo Notifications for medication reminders.

Notifications are scheduled ahead of time and refreshed as the application is used.

---

# 🏗️ Architecture

```text
┌───────────────────────────────┐
│        Expo / React Native    │
│                               │
│  app/                         │
│  src/                         │
│                               │
│  ┌─────────────────────────┐  │
│  │      Local SQLite       │  │
│  │   Source of truth       │  │
│  └────────────┬────────────┘  │
└───────────────┼───────────────┘
                │
                │ Sync / API
                ▼
┌───────────────────────────────┐
│        Node.js / Express      │
│                               │
│  Authentication               │
│  Account management           │
│  Sync API                     │
│  Security                     │
│  Audit logging                │
│  Email                        │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│          PostgreSQL           │
│                               │
│  Accounts                     │
│  Sessions                     │
│  Pets                         │
│  Medications                  │
│  Dose logs                    │
│  Audit events                 │
└───────────────────────────────┘
```

## 📁 Project Structure

```text
dosed/
├── app/                    # Expo Router screens
│
├── src/                    # Mobile application source
│   ├── database/           # Local SQLite database
│   ├── sync/               # Synchronization engine
│   ├── api/                # API client
│   ├── components/         # Reusable UI components
│   └── theme/              # Application styling/theme
│
├── server/                 # Node.js synchronization backend
│   ├── src/
│   ├── Dockerfile
│   └── ...
│
├── package.json
├── app.json
└── ...
```

---

# 🚀 Getting Started

## Requirements

### Client

- Node.js
- npm
- Expo
- iOS or Android device/emulator

### Server

- Node.js
- PostgreSQL

Docker can also be used to run the server and PostgreSQL together.

---

# 📱 Running the Client

Clone the repository:

```bash
git clone https://github.com/LiteHere-Dev/dosed.git
cd dosed
```

Install dependencies:

```bash
npm install
```

Align Expo dependencies:

```bash
npx expo install --fix
```

Create your local environment file:

```bash
cp .env.example .env.local
```

Configure the API URL in `.env.local`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000
```

Start Expo:

```bash
npx expo start
```

You can also launch directly with:

```bash
npm run android
```

or:

```bash
npm run ios
```

---

# 🖥️ Running the Server

Enter the server directory:

```bash
cd server
```

Install dependencies:

```bash
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

At minimum, configure:

```env
JWT_SECRET=your-secret-here
```

Run the database and API using Docker:

```bash
docker compose up --build
```

The API will be available on:

```text
http://localhost:3000
```

---

## Running Without Docker

Install dependencies:

```bash
npm install
```

Run database migrations:

```bash
npm run migrate
```

Start the development server:

```bash
npm run dev
```

---

# 🧪 Self Check

Dosed includes a security-focused end-to-end self-check.

Run:

```bash
npm run selfcheck
```

The test covers the authentication flow, including:

```text
Register
   ↓
Authenticate
   ↓
Sync
   ↓
Refresh token
   ↓
Refresh-token rotation
   ↓
Reuse detection
```

---

# 🔄 Synchronization

Dosed uses a local-first synchronization model.

Each synchronized record contains:

```text
updatedAt
deletedAt
```

When devices synchronize, changes are merged using **last-write-wins based on `updatedAt`**.

Deletes are represented as tombstones rather than immediately removing the record.

This means:

```text
Device A
   │
   │ Delete medication
   ▼
deletedAt = timestamp
   │
   ▼
Sync server
   │
   ▼
Device B
   │
   └── Medication is removed locally
```

This prevents deleted records from unexpectedly returning during synchronization.

---

# 🔐 Authentication Model

Access tokens are intentionally short-lived:

```text
Access token
15 minutes
```

Refresh tokens have a longer lifetime:

```text
Refresh token
60 days
```

Refresh tokens are opaque random values rather than JWTs.

Only their SHA-256 hashes are stored in the database.

### Refresh Token Rotation

Every refresh operation replaces the existing refresh token.

```text
Refresh Token A
       │
       ▼
Refresh
       │
       ├── Token A → used
       │
       └── Token B → issued
```

If a previously-used refresh token is presented again, Dosed treats this as possible token theft and revokes the entire token family.

---

# 🛡️ Account Protection

Dosed uses multiple layers of authentication protection.

### Login Lockout

Five failed login attempts trigger a temporary account lockout.

```text
5 failed attempts
        ↓
15 minute lockout
```

### Rate Limiting

Authentication endpoints also use IP-based rate limiting.

This provides two separate protections:

```text
Many accounts ← IP rate limiting

One account ← Account lockout
```

### Password Reset

Password resets:

- Do not reveal whether an email exists
- Revoke existing sessions
- Require the user to authenticate again

---

# 📋 API

The backend provides API endpoints for:

- Authentication
- Account management
- Sessions
- Password recovery
- Email verification
- Synchronization
- Audit logs

Example audit endpoint:

```text
GET /api/account/audit-log
```

Session management includes endpoints for listing and revoking sessions.

---

# 🧰 Technology Stack

## Mobile

| Technology | Purpose |
|---|---|
| Expo | Mobile application platform |
| React Native | Application UI |
| Expo Router | Navigation |
| SQLite | Local database |
| Expo Notifications | Medication reminders |
| Expo Secure Store | Secure local storage |
| TypeScript | Application development |

## Backend

| Technology | Purpose |
|---|---|
| Node.js | Server runtime |
| Express | HTTP API |
| PostgreSQL | Persistent database |
| `pg` | PostgreSQL client |
| bcryptjs | Password hashing |
| JSON Web Token | Access-token authentication |
| Zod | Input validation |
| Helmet | HTTP security headers |
| express-rate-limit | Rate limiting |
| Pino | Structured logging |
| Nodemailer | Email delivery |

---

# 🚧 Current Limitations

Dosed is actively developing and is not intended to be described as completely "bulletproof."

Current limitations include:

- No SMS/phone verification
- No 2FA
- No passkey authentication
- Password hashing currently uses bcryptjs rather than Argon2id
- No dependency vulnerability scanning in CI
- No built-in automated PostgreSQL backup system
- No external monitoring/alerting configured by default
- No dedicated DDoS mitigation
- No professional security audit or penetration test
- No background synchronization while the application is completely closed
- Medication times currently use text input rather than a dedicated time picker
- Push notifications are scheduled 14 days ahead

These limitations are documented in the project itself and should be considered before deploying Dosed for real users or sensitive data.

---

# 🗺️ Potential Future Improvements

Some possible future additions include:

- 📱 SMS verification
- 🔐 Two-factor authentication
- 🔑 Passkeys / WebAuthn
- 🔵 Google / Apple sign-in
- 🛡️ Dependency vulnerability scanning
- 💾 Automated database backups
- 📊 Monitoring and alerting
- 🌐 WAF / infrastructure-level protection
- 🔄 Background synchronization
- ⏰ Dedicated medication time picker
- 🔔 More advanced notification scheduling
- 🏥 Veterinary clinic / staff accounts
- 📈 Medication adherence statistics
- 📄 Exportable medication reports

---

# ☁️ Deployment

The backend is containerized and can be deployed to a variety of hosting providers.

A simple deployment architecture is:

```text
                Internet
                   │
                   ▼
          ┌─────────────────┐
          │   Dosed API     │
          │ Node / Express  │
          └────────┬────────┘
                   │
                   ▼
          ┌─────────────────┐
          │   PostgreSQL    │
          └─────────────────┘
```

The server Docker image can be deployed to platforms such as:

- Railway
- Render
- Fly.io
- VPS infrastructure
- Other Docker-compatible hosts

For production deployments, configure:

```env
NODE_ENV=production
DATABASE_URL=...
JWT_SECRET=...
```

SMTP variables should also be configured if real verification and password-reset emails are required.

---

# ⚠️ Production Security

Before using Dosed with real users or sensitive information, consider:

- Managed PostgreSQL backups
- Database recovery testing
- Dependency vulnerability scanning
- External monitoring
- WAF / DDoS protection
- Security review
- Penetration testing
- Secret management
- Production logging and alerting
- Proper HTTPS configuration

Dosed contains several security mechanisms, but application security is an ongoing process rather than a finished state.

---

# 🤝 Contributing

Contributions, bug reports, and feature requests are welcome.

Before opening a pull request:

1. Create a fork
2. Create a feature branch
3. Make your changes
4. Test both client and server functionality
5. Open a pull request with a clear description of the changes

---

# 📄 License

See the repository's license file for licensing information.

---

# 🐾 About

Dosed is built around a simple idea:

> **Medication tracking should still work when the internet doesn't.**

Local-first storage keeps the core experience available offline, while the synchronization backend allows households to keep their pet medication data consistent across devices.

**Dosed**  
Built by [LiteHere-Dev](https://github.com/LiteHere-Dev)
