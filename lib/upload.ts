// ─── Image upload helper ──────────────────────────────────────────────────
// Pick an image from the photo library, upload it to a PUBLIC Supabase Storage
// bucket, and return its public URL. Saving that URL on the user/venue record is
// what makes the photo visible to OTHER users (who read from Supabase, not from
// the uploader's device).
//
// `expo-image-picker` is a NATIVE module — this only works in a build that
// bundles it (re-added Sep 2026; an OTA alone can't add it). Images are
// compressed at the picker (quality 0.5). Library-only: no camera path.

import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from './supabase';

export type UploadBucket = 'profile-photos' | 'venue-photos' | 'invoices';

/**
 * Pick an image from the library with an in-picker crop, then return the local
 * uri (or null if cancelled). Pair with uploadImageAsync() to store it.
 * aspect: [1,1] for profile pics (square), [16,9] for venue photos.
 */
export async function pickImage(opts?: {
  aspect?: [number, number];
  quality?: number;
  allowsEditing?: boolean;
}): Promise<string | null> {
  const allowsEditing = opts?.allowsEditing ?? true;
  const quality = opts?.quality ?? 0.5;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing,
    // A crop frame only makes sense when editing is on (square avatars, 16:9 venue shots).
    // For a whole-document photo (an uploaded invoice) editing is off and there's no aspect.
    ...(allowsEditing ? { aspect: opts?.aspect ?? [1, 1] } : {}),
    quality,
  });
  return !result.canceled && result.assets[0] ? result.assets[0].uri : null;
}

// Minimal base64 → bytes decoder (avoids adding a base64-arraybuffer dependency).
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, ''); // strip '=' padding + whitespace
  const lookup = new Uint8Array(256);
  for (let i = 0; i < 64; i++) lookup[B64_CHARS.charCodeAt(i)] = i;

  const fullGroups = Math.floor(clean.length / 4);
  const remainder = clean.length % 4; // 0, 2, or 3
  let outLen = fullGroups * 3;
  if (remainder === 2) outLen += 1;
  else if (remainder === 3) outLen += 2;

  const bytes = new Uint8Array(outLen);
  let p = 0;
  let i = 0;
  for (let g = 0; g < fullGroups; g++) {
    const c0 = lookup[clean.charCodeAt(i++)];
    const c1 = lookup[clean.charCodeAt(i++)];
    const c2 = lookup[clean.charCodeAt(i++)];
    const c3 = lookup[clean.charCodeAt(i++)];
    bytes[p++] = (c0 << 2) | (c1 >> 4);
    bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    bytes[p++] = ((c2 & 3) << 6) | c3;
  }
  if (remainder === 2) {
    const c0 = lookup[clean.charCodeAt(i++)];
    const c1 = lookup[clean.charCodeAt(i++)];
    bytes[p++] = (c0 << 2) | (c1 >> 4);
  } else if (remainder === 3) {
    const c0 = lookup[clean.charCodeAt(i++)];
    const c1 = lookup[clean.charCodeAt(i++)];
    const c2 = lookup[clean.charCodeAt(i++)];
    bytes[p++] = (c0 << 2) | (c1 >> 4);
    bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
  }
  return bytes;
}

/**
 * Upload a local image to a public Supabase Storage bucket and return its public URL.
 * If `localUri` is already an http(s) URL, it's returned unchanged (nothing to upload).
 *
 * @param localUri    file:// URI from the image picker (or an existing remote URL)
 * @param bucket      target public bucket ('profile-photos' | 'venue-photos')
 * @param pathPrefix  filename prefix, e.g. `artist-<userId>` or `venue-<venueId>`
 */
export async function uploadImageAsync(
  localUri: string,
  bucket: UploadBucket,
  pathPrefix: string,
): Promise<string> {
  if (/^https?:\/\//i.test(localUri)) return localUri;

  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
  const bytes = base64ToBytes(base64);

  const match = localUri.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
  let ext = (match ? match[1] : 'jpg').toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  if (!['jpg', 'png', 'webp', 'heic', 'gif'].includes(ext)) ext = 'jpg';
  const contentType =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    ext === 'heic' ? 'image/heic' :
    ext === 'gif' ? 'image/gif' :
    'image/jpeg';

  // Timestamped path → new public URL each save → busts any cached image.
  const path = `${pathPrefix}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// ─── PDF (document) upload — artist-uploaded invoices ──────────────────────
// `expo-document-picker` is a NATIVE module — only works in a build that bundles it (an OTA
// alone can't add it). Used so an artist can send their OWN invoice PDF instead of a photo or
// the app-generated one.

/**
 * Pick a single PDF from the Files app / on-device storage. Returns the local
 * `uri` AND the original `name` (or null if cancelled). `copyToCacheDirectory: true`
 * is REQUIRED so the file is copied where FileSystem.readAsStringAsync can read it —
 * but that copy is a random cache name, so the display name MUST come from
 * `asset.name` (the file's real name), never from the uri.
 */
export async function pickDocument(): Promise<{ uri: string; name: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: (asset.name || 'invoice.pdf').trim() };
}

/**
 * Upload a local PDF to the public 'invoices' bucket and return its public URL.
 * If `localUri` is already an http(s) URL it's returned unchanged.
 * @param pathPrefix filename prefix, e.g. `invoice-<artistId>`.
 */
export async function uploadDocumentAsync(localUri: string, pathPrefix: string): Promise<string> {
  if (/^https?:\/\//i.test(localUri)) return localUri;
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
  const bytes = base64ToBytes(base64);
  const path = `${pathPrefix}-${Date.now()}.pdf`;
  const { error } = await supabase.storage.from('invoices').upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw error;
  return supabase.storage.from('invoices').getPublicUrl(path).data.publicUrl;
}
