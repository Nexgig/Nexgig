// ─── Avatar registry ─────────────────────────────────────────────────────────
// The bundled avatar set users can choose from (assets/images/avatars/avatar-N.png).
// Stored on a user as `avatarId` (e.g. 'avatar-7') when they have no uploaded photo.
// Render order everywhere is: uploaded photo → chosen avatar → deterministic default.

export type AvatarId =
  | 'avatar-1' | 'avatar-2' | 'avatar-3' | 'avatar-4' | 'avatar-5' | 'avatar-6'
  | 'avatar-7' | 'avatar-8' | 'avatar-9' | 'avatar-10' | 'avatar-11' | 'avatar-12'
  | 'avatar-13' | 'avatar-14' | 'avatar-15' | 'avatar-16' | 'avatar-17' | 'avatar-18'
  | 'avatar-19' | 'avatar-20' | 'avatar-21' | 'avatar-22';

// Static require() map — Metro needs literal requires, so they're listed explicitly.
export const AVATAR_SOURCES: Record<AvatarId, number> = {
  'avatar-1': require('@/assets/images/avatars/avatar-1.png'),
  'avatar-2': require('@/assets/images/avatars/avatar-2.png'),
  'avatar-3': require('@/assets/images/avatars/avatar-3.png'),
  'avatar-4': require('@/assets/images/avatars/avatar-4.png'),
  'avatar-5': require('@/assets/images/avatars/avatar-5.png'),
  'avatar-6': require('@/assets/images/avatars/avatar-6.png'),
  'avatar-7': require('@/assets/images/avatars/avatar-7.png'),
  'avatar-8': require('@/assets/images/avatars/avatar-8.png'),
  'avatar-9': require('@/assets/images/avatars/avatar-9.png'),
  'avatar-10': require('@/assets/images/avatars/avatar-10.png'),
  'avatar-11': require('@/assets/images/avatars/avatar-11.png'),
  'avatar-12': require('@/assets/images/avatars/avatar-12.png'),
  'avatar-13': require('@/assets/images/avatars/avatar-13.png'),
  'avatar-14': require('@/assets/images/avatars/avatar-14.png'),
  'avatar-15': require('@/assets/images/avatars/avatar-15.png'),
  'avatar-16': require('@/assets/images/avatars/avatar-16.png'),
  'avatar-17': require('@/assets/images/avatars/avatar-17.png'),
  'avatar-18': require('@/assets/images/avatars/avatar-18.png'),
  'avatar-19': require('@/assets/images/avatars/avatar-19.png'),
  'avatar-20': require('@/assets/images/avatars/avatar-20.png'),
  'avatar-21': require('@/assets/images/avatars/avatar-21.png'),
  'avatar-22': require('@/assets/images/avatars/avatar-22.png'),
};

// Ordered list of all avatar ids (for the picker grid).
export const AVATAR_IDS = Object.keys(AVATAR_SOURCES) as AvatarId[];

/** Type guard: is this string one of our known avatar ids? */
export function isAvatarId(value: string | null | undefined): value is AvatarId {
  return !!value && value in AVATAR_SOURCES;
}

/** Resolve an avatar id to its image source, or undefined if not a known id. */
export function avatarSource(id: string | null | undefined): number | undefined {
  return isAvatarId(id) ? AVATAR_SOURCES[id] : undefined;
}

// Small, stable string hash (djb2) → non-negative int. Deterministic per seed.
function hashString(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 33) ^ seed.charCodeAt(i);
  }
  return h >>> 0; // force unsigned
}

/**
 * Deterministically pick a default avatar for a user who has neither an uploaded
 * photo nor a chosen avatar. Same seed (user id) always yields the same avatar,
 * so a person's default is stable everywhere and distinct from most others.
 */
export function defaultAvatarId(seed: string | null | undefined): AvatarId {
  const s = seed && seed.length > 0 ? seed : 'nexgig';
  return AVATAR_IDS[hashString(s) % AVATAR_IDS.length];
}

/** Resolve the image source to show for a user, given photo + chosen avatar + id seed. */
export function resolveAvatarSource(opts: {
  photoUri?: string | null;
  avatarId?: string | null;
  seed?: string | null;
}): { type: 'photo'; uri: string } | { type: 'avatar'; source: number } {
  if (opts.photoUri) return { type: 'photo', uri: opts.photoUri };
  const chosen = avatarSource(opts.avatarId);
  if (chosen) return { type: 'avatar', source: chosen };
  return { type: 'avatar', source: AVATAR_SOURCES[defaultAvatarId(opts.seed)] };
}
