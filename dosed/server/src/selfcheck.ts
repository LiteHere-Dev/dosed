// End-to-end checks against a live server. Run:
// `API_URL=http://localhost:3000 npm run selfcheck`
//
// Covers: register (with username/phone) -> sync round trip with
// last-write-wins, and separately, refresh-token rotation + reuse
// detection — the two pieces of logic in this codebase subtle enough
// that "looks right" isn't good enough on its own.
const API = process.env.API_URL ?? "http://localhost:3000";

async function main() {
  await checkSyncRoundTrip();
  await checkRefreshRotationAndReuseDetection();
  await checkAuditLog();
  console.log("selfcheck: OK");
}

async function checkSyncRoundTrip() {
  const stamp = Date.now();
  const register = await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `selfcheck+${stamp}@example.com`,
      username: `selfcheck_${stamp}`,
      password: "correct horse battery",
    }),
  });
  assert(register.ok, `register failed: ${await register.text()}`);
  const { accessToken } = await register.json();
  const auth = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };

  const petId = crypto.randomUUID();
  const t0 = new Date(Date.now() - 10_000).toISOString();
  const push1 = await fetch(`${API}/api/sync/push`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ pets: [{ id: petId, name: "Biscuit", species: "Dog", breed: null, weightKg: 12, photoUri: null, notes: null, createdAt: t0, updatedAt: t0, deletedAt: null }] }),
  });
  assert(push1.ok, "initial push failed");

  const tNewer = new Date().toISOString();
  await fetch(`${API}/api/sync/push`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ pets: [{ id: petId, name: "Biscuit II", species: "Dog", breed: null, weightKg: 12, photoUri: null, notes: null, createdAt: t0, updatedAt: tNewer, deletedAt: null }] }),
  });
  const tStale = new Date(Date.now() - 20_000).toISOString();
  await fetch(`${API}/api/sync/push`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ pets: [{ id: petId, name: "Should not stick", species: "Dog", breed: null, weightKg: 12, photoUri: null, notes: null, createdAt: t0, updatedAt: tStale, deletedAt: null }] }),
  });

  const pull = await fetch(`${API}/api/sync/pull?since=1970-01-01T00:00:00.000Z`, { headers: auth });
  const pulled = await pull.json();
  assert(pulled.pets[0].name === "Biscuit II", `last-write-wins broken, got "${pulled.pets[0].name}"`);
}

async function checkRefreshRotationAndReuseDetection() {
  const stamp = Date.now();
  const register = await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `selfcheck-refresh+${stamp}@example.com`,
      username: `selfcheck_refresh_${stamp}`,
      password: "correct horse battery",
    }),
  });
  const { refreshToken: r0 } = await register.json();

  // A valid rotation: exchanging r0 should succeed and yield a new pair.
  const refresh1 = await fetch(`${API}/api/auth/refresh`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: r0 }),
  });
  assert(refresh1.ok, "first refresh should succeed");
  const { refreshToken: r1, accessToken: a1 } = await refresh1.json();
  assert(!!r1 && !!a1, "refresh did not return a new token pair");

  // Reusing r0 (already rotated away) must fail AND must revoke r1 too —
  // that's the actual security property, not just "old token rejected".
  const reuse = await fetch(`${API}/api/auth/refresh`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: r0 }),
  });
  assert(reuse.status === 401, "reused refresh token should be rejected");

  const afterReuse = await fetch(`${API}/api/auth/refresh`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: r1 }),
  });
  assert(afterReuse.status === 401, "reuse detection should have revoked the whole token family, but r1 still worked");
}

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("selfcheck FAILED:", msg); process.exit(1); }
}

async function checkAuditLog() {
  const stamp = Date.now();
  const email = `selfcheck-audit+${stamp}@example.com`;
  const password = "correct horse battery";
  await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, username: `selfcheck_audit_${stamp}`, password }),
  });
  const login = await fetch(`${API}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  });
  const { accessToken } = await login.json();

  const log = await fetch(`${API}/api/account/audit-log`, { headers: { authorization: `Bearer ${accessToken}` } });
  const { events } = await log.json();
  assert(events.some((e: any) => e.eventType === "register"), "audit log missing register event");
  assert(events.some((e: any) => e.eventType === "login_success"), "audit log missing login_success event");
}

main().catch((err) => { console.error("selfcheck FAILED:", err); process.exit(1); });
