import * as FileSystem from "expo-file-system";
import { presignPhotoUpload, downloadPhoto, deletePhoto } from "./api";

// photoUri on a Pet is one of: null, a local file:// URI (picked but not
// yet uploaded — shouldn't normally persist past the picking screen), or
// "r2:<key>" once uploaded. The r2: prefix keeps this string unambiguous
// after it round-trips through sync as plain text.
const R2_PREFIX = "r2:";
const cacheDir = FileSystem.cacheDirectory + "pet-photos/";

/** Uploads a locally-picked photo to R2 and returns the "r2:<key>" marker to store as photoUri. */
export async function uploadLocalPhoto(petId: string, localUri: string): Promise<string> {
  const ext = localUri.toLowerCase().endsWith(".png") ? "png" : "jpg";
  const { uploadUrl, key, contentType } = await presignPhotoUpload(petId, ext);
  // Content-Type must match exactly what was signed into uploadUrl's
  // query string, or R2 rejects the PUT with a signature mismatch.
  const info = await FileSystem.uploadAsync(uploadUrl, localUri, { httpMethod: "PUT", headers: { "Content-Type": contentType } });
  if (info.status >= 300) throw new Error(`photo upload failed: ${info.status}`);
  return R2_PREFIX + key;
}

/**
 * Resolves a Pet.photoUri into something <Image source={{ uri }}> can show
 * right now: a local file:// URI, downloading and caching it first if it's
 * an "r2:<key>" marker from another device. Returns null for no photo.
 */
export async function resolvePhotoUri(photoUri: string | null): Promise<string | null> {
  if (!photoUri) return null;
  if (!photoUri.startsWith(R2_PREFIX)) return photoUri; // already local (this device took/picked it)

  const key = photoUri.slice(R2_PREFIX.length);
  const localPath = cacheDir + key.replace(/\//g, "_");
  const existing = await FileSystem.getInfoAsync(localPath);
  if (existing.exists) return localPath;

  await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true }).catch(() => {});
  const base64 = await downloadPhoto(key);
  await FileSystem.writeAsStringAsync(localPath, base64, { encoding: FileSystem.EncodingType.Base64 });
  return localPath;
}

/** Cleans up the R2 object for a pet being deleted, if it had one. Best-effort — an orphaned blob is a storage-cost leak, not a correctness bug, so failures are swallowed by the caller. */
export async function deleteUploadedPhoto(photoUri: string | null): Promise<void> {
  if (!photoUri?.startsWith(R2_PREFIX)) return;
  await deletePhoto(photoUri.slice(R2_PREFIX.length));
}
