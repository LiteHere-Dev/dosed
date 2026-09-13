import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";

const ACCESS_KEY = "dosed_access_token";
const REFRESH_KEY = "dosed_refresh_token";

// Set EXPO_PUBLIC_API_URL in your environment (e.g. an .env file loaded by
// app.config, or an EAS build profile). EXPO_PUBLIC_ vars are inlined into
// the JS bundle at build time — fine for a base URL, never put a secret
// behind this prefix.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

// "Stay signed in" support: when the person unchecks it at login/register,
// tokens live only in these module-level variables for the lifetime of the
// JS process, never written to SecureStore. Killing the app clears them
// automatically (they're just JS variables), so the next cold start finds
// nothing persisted and lands back on the login screen — no separate
// "forget me" cleanup path needed. When checked (the default), tokens are
// written to SecureStore as before and survive app restarts.
let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

async function getTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  // Memory values take priority within the same process — they're the ones
  // this login/register call actually just set, if session-only was chosen.
  return {
    accessToken: memoryAccessToken ?? accessToken,
    refreshToken: memoryRefreshToken ?? refreshToken,
  };
}
async function storeTokens(accessToken: string, refreshToken: string, persist: boolean) {
  if (persist) {
    memoryAccessToken = null;
    memoryRefreshToken = null;
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
    ]);
  } else {
    memoryAccessToken = accessToken;
    memoryRefreshToken = refreshToken;
    // Clear out anything persisted from an earlier "stay signed in" login —
    // otherwise a stale disk token would let the next cold start sign back
    // in automatically, defeating the point of choosing session-only.
    await Promise.all([SecureStore.deleteItemAsync(ACCESS_KEY), SecureStore.deleteItemAsync(REFRESH_KEY)]);
  }
}
export async function clearTokens() {
  memoryAccessToken = null;
  memoryRefreshToken = null;
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_KEY), SecureStore.deleteItemAsync(REFRESH_KEY)]);
}
export async function isSignedIn(): Promise<boolean> {
  if (memoryRefreshToken) return true;
  return !!(await SecureStore.getItemAsync(REFRESH_KEY));
}

export class ApiClientError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

/** True once, so concurrent 401s during app foreground don't each kick off their own refresh call. */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const { refreshToken } = await getTokens();
    if (!refreshToken) return null;
    // A refresh should preserve whichever mode the person originally chose
    // at login — check this before storeTokens overwrites memoryRefreshToken
    // below, since that's the only signal of which mode is currently active.
    const wasSessionOnly = !!memoryRefreshToken;
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // Refresh token invalid/expired/reused — nothing recoverable
        // client-side; the caller (request()) will surface this as a
        // 401 and the app's root layout treats that as signed-out.
        await clearTokens();
        return null;
      }
      const { accessToken, refreshToken: nextRefreshToken } = await res.json();
      await storeTokens(accessToken, nextRefreshToken, !wasSessionOnly);
      return accessToken;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function authedFetch(path: string, options: RequestInit = {}, isRetry = false): Promise<Response> {
  const { accessToken } = await getTokens();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && !isRetry) {
    const body = await res.clone().json().catch(() => ({ error: "" }));
    if (body.error === "token_expired") {
      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) return authedFetch(path, options, true);
    }
  }
  return res;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await authedFetch(path, { ...options, headers: { "content-type": "application/json", ...options.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "unknown_error" }));
    throw new ApiClientError(res.status, body.error ?? "unknown_error");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const deviceLabel = () => `${Device.modelName ?? "Unknown device"} (${Device.osName ?? "?"})`;

// --- auth ---
// `persistSession` defaults true (the common case). Passing false keeps the
// session in memory only for this process — the "Stay signed in" checkbox
// on the login/register screens maps directly to this flag.

export async function register(email: string, username: string, phone: string | null, password: string, persistSession = true) {
  const { accessToken, refreshToken } = await request<{ accessToken: string; refreshToken: string }>(
    "/api/auth/register", { method: "POST", body: JSON.stringify({ email, username, phone, password, deviceLabel: deviceLabel() }) }
  );
  await storeTokens(accessToken, refreshToken, persistSession);
}

export async function login(identifier: string, password: string, persistSession = true) {
  const { accessToken, refreshToken } = await request<{ accessToken: string; refreshToken: string }>(
    "/api/auth/login", { method: "POST", body: JSON.stringify({ identifier, password, deviceLabel: deviceLabel() }) }
  );
  await storeTokens(accessToken, refreshToken, persistSession);
}

export async function logout() {
  const { refreshToken } = await getTokens();
  if (refreshToken) await request("/api/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }).catch(() => {});
  await clearTokens();
}

export const logoutAllDevices = (password: string) => request<void>("/api/auth/logout-all", { method: "POST", body: JSON.stringify({ password }) });
export const listSessions = () => request<{ sessions: { id: string; deviceLabel: string | null; createdAt: string; lastUsedAt: string | null }[] }>("/api/auth/sessions");
export const revokeSession = (id: string) => request<void>(`/api/auth/sessions/${id}`, { method: "DELETE" });

// --- account ---

export const me = () => request<{ id: string; email: string; username: string; phone: string | null; emailVerifiedAt: string | null; phoneVerifiedAt: string | null }>("/api/account/me");
export const resendVerification = () => request<{ alreadyVerified: boolean }>("/api/account/resend-verification", { method: "POST" });
export const requestPasswordReset = (email: string) => request<{ sent: true }>("/api/account/request-password-reset", { method: "POST", body: JSON.stringify({ email }) });
export const resetPassword = (token: string, newPassword: string) => request<{ reset: true }>("/api/account/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) });
export const changePassword = (currentPassword: string, newPassword: string) => request<{ changed: true }>("/api/account/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
export const getAuditLog = () => request<{ events: { eventType: string; ipAddress: string | null; metadata: Record<string, unknown>; createdAt: string }[] }>("/api/account/audit-log");

/** Full account data as one JSON object — GDPR/CCPA data portability. Caller decides what to do with it (write to a file and share, in Settings). */
export const exportAccountData = () => request<Record<string, unknown>>("/api/account/export");

/** Permanently deletes the account: server wipes R2 photos, then the DB row (which cascades to pets/medications/dose_logs and every session). Irreversible — the caller should confirm with the person before calling this. */
export const deleteAccount = (password: string) => request<void>("/api/account/me", { method: "DELETE", body: JSON.stringify({ password }) });

// --- sync ---

export const pullChanges = (since: string) =>
  request<{ serverTime: string; pets: any[]; medications: any[]; doseLogs: any[] }>(`/api/sync/pull?since=${encodeURIComponent(since)}`);
export const pushChanges = (payload: { pets: any[]; medications: any[]; doseLogs: any[] }) =>
  request<{ serverTime: string }>("/api/sync/push", { method: "POST", body: JSON.stringify(payload) });

// --- photo uploads ---
// photoUri holds either a local file:// path (not yet uploaded) or an
// "r2:<key>" marker once uploaded — see src/lib/photos.ts for the upload/
// download flow built on these two calls.

export const presignPhotoUpload = (petId: string, ext: "jpg" | "png") =>
  request<{ uploadUrl: string; key: string; contentType: string }>("/api/uploads/presign", { method: "POST", body: JSON.stringify({ petId, ext }) });

/** Deletes the uploaded object from R2. Fire-and-forget from the caller's side — a failed cleanup leaves an orphaned blob, not a broken app. */
export async function deletePhoto(key: string): Promise<void> {
  const res = await authedFetch(`/api/uploads/${key}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new ApiClientError(res.status, "delete_failed");
}
export async function downloadPhoto(key: string): Promise<string> {
  const res = await authedFetch(`/api/uploads/${key}`);
  if (!res.ok) throw new ApiClientError(res.status, "download_failed");
  const buf = await res.arrayBuffer();
  // FileSystem.writeAsStringAsync wants base64 text, not a Blob — RN has
  // no Buffer, so convert with a small manual loop instead of adding a
  // base64 dependency for one call site.
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
