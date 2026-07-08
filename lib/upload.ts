// ─── Image upload helper ──────────────────────────────────────────────────
// Uploads a locally-picked image (file:// URI from expo-image-picker) to a
// public Supabase Storage bucket and returns its public URL. Saving that URL on
// the user/venue record is what makes photos visible to OTHER users (who read
// from Supabase, not from the uploader's device).
//
// All pure JS — works through Metro on the existing dev build, no native rebuild.
// Images are already compressed at the picker (quality 0.5).

import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { supabase } from './supabase';

export type PickSource = 'library' | 'camera';

/**
 * Single entry point for picking an image with a square crop. Handles camera
 * permission, launches the library or camera with editing enabled, and returns
 * the picked local uri (or null if cancelled / permission denied). Pair with
 * uploadImageAsync() to store it. Used by every photo/avatar upload flow so the
 * picker config (crop, aspect, quality) lives in one place.
 */
export async function pickImage(opts?: {
  source?: PickSource;
  aspect?: [number, number];
  quality?: number;
}): Promise<string | null> {
  const source = opts?.source ?? 'library';
  const aspect = opts?.aspect ?? [1, 1];
  const quality = opts?.quality ?? 0.5;

  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Access Needed', 'Enable camera access in Settings to take a photo.');
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect, quality });
    return !result.canceled && result.assets[0] ? result.assets[0].uri : null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
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
 * Upload a local image to Supabase Storage and return its public URL.
 * If `localUri` is already an http(s) URL, it's returned unchanged (nothing to upload).
 *
 * @param localUri  file:// URI from the image picker (or an existing remote URL)
 * @param bucket    target public bucket
 * @param pathPrefix  filename prefix, e.g. `avatar-<userId>` or `venue-<venueId>`
 */
export async function uploadImageAsync(
  localUri: string,
  bucket: 'avatars' | 'venue-photos',
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
