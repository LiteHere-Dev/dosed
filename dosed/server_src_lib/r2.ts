import { AwsClient } from "aws4fetch";
import { env } from "../env";

// R2 is S3-compatible, so a full AWS SDK client is overkill for two
// operations (presign PUT, stream GET) — aws4fetch just signs requests.
export const r2Configured = Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT && env.R2_BUCKET);

const client = r2Configured
  ? new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: "s3", region: "auto" })
  : null;

function objectUrl(key: string): string {
  return `${env.R2_ENDPOINT}/${env.R2_BUCKET}/${key}`;
}

// aws4fetch has no `expiresIn` option — a presigned URL's lifetime is set by
// putting X-Amz-Expires (seconds) on the query string before signing; the
// signature then covers that value, which is what actually makes it expire.
function objectUrlWithExpiry(key: string, expiresInSeconds: number): string {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  return url.toString();
}

/** Presigned PUT URL the client uploads the photo bytes to directly. Content-Type is signed into the URL so R2 stores the right MIME type and rejects a mismatched upload. Expires in 5 min. */
export async function presignUpload(key: string, contentType: string): Promise<string> {
  if (!client) throw new Error("R2 not configured");
  const signed = await client.sign(objectUrlWithExpiry(key, 300), {
    method: "PUT",
    headers: { "content-type": contentType },
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Fetches the object from R2 so the server can stream it back — bucket stays private. */
export async function getObject(key: string): Promise<Response> {
  if (!client) throw new Error("R2 not configured");
  const signed = await client.sign(objectUrlWithExpiry(key, 60), { method: "GET", aws: { signQuery: true } });
  return fetch(signed.url);
}

/** Deletes the object — called when a pet (or its photo) is removed, so orphaned blobs don't pile up in the bucket. */
export async function deleteObject(key: string): Promise<void> {
  if (!client) throw new Error("R2 not configured");
  const signed = await client.sign(objectUrlWithExpiry(key, 60), { method: "DELETE", aws: { signQuery: true } });
  const res = await fetch(signed.url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed: ${res.status}`);
}

function bucketUrl(): string {
  return `${env.R2_ENDPOINT}/${env.R2_BUCKET}`;
}

/**
 * Lists every object key under a prefix (paginating via S3's
 * ListObjectsV2 continuation token). No AWS SDK on hand for XML parsing,
 * but the response shape is fixed and small, so a couple of regexes over
 * the raw XML body are enough rather than pulling in an XML parser
 * dependency for two field extractions.
 */
export async function listKeysWithPrefix(prefix: string): Promise<string[]> {
  if (!client) throw new Error("R2 not configured");
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const url = new URL(bucketUrl());
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    if (continuationToken) url.searchParams.set("continuation-token", continuationToken);
    url.searchParams.set("X-Amz-Expires", "60");

    const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
    const res = await fetch(signed.url);
    if (!res.ok) throw new Error(`R2 list failed: ${res.status}`);
    const xml = await res.text();

    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    continuationToken = truncated && tokenMatch ? tokenMatch[1] : undefined;
  } while (continuationToken);

  return keys;
}

/** Deletes every object under a prefix — used to wipe a user's photos (users/{userId}/...) on account deletion. */
export async function deleteAllWithPrefix(prefix: string): Promise<void> {
  if (!client) return; // storage not configured: nothing to clean up
  const keys = await listKeysWithPrefix(prefix);
  await Promise.all(keys.map((key) => deleteObject(key)));
}
