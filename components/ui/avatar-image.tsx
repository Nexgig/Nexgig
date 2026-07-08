import { Image } from '@/lib/rn';
import { resolveAvatarSource } from '@/lib/avatars';

interface AvatarImageProps {
  /** Uploaded photo URL, if any (highest priority). */
  uri?: string;
  /** Chosen bundled avatar id (e.g. 'avatar-7'), if any (second priority). */
  avatarId?: string;
  /** Seed for the deterministic default avatar — pass the user/venue id so the
   *  default is stable per person. Falls back to `name` if no id given. */
  seed?: string;
  name?: string;
  size?: number;
  /** Corner radius override. Defaults to a full circle (size/2). Pass a smaller
   *  number for a rounded-square (e.g. profile hero cards). */
  radius?: number;
  className?: string;
  /** Legacy prop, no longer used (kept so existing call sites don't break). */
  variant?: 'manager' | 'artist';
}

/**
 * Renders an avatar. Priority: uploaded photo → chosen avatar → a deterministic
 * default avatar from the bundled set (so it's NEVER empty). Circular by default;
 * pass `radius` for a rounded-square.
 */
export function AvatarImage({ uri, avatarId, seed, name, size = 40, radius, className }: AvatarImageProps) {
  const resolved = resolveAvatarSource({ photoUri: uri, avatarId, seed: seed ?? name });
  const source = resolved.type === 'photo' ? { uri: resolved.uri } : resolved.source;
  const borderRadius = radius ?? size / 2;

  return (
    <Image
      source={source}
      style={{ width: size, height: size, borderRadius }}
      className={className}
    />
  );
}
