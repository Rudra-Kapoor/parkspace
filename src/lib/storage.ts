/**
 * Storage URLs.
 *
 * `space_photos.storage_path` holds either a full URL or a key inside a Supabase
 * Storage bucket, and both are legitimate: a seeded or imported listing may point
 * at an external image, while an uploaded one is a bucket key.
 *
 * Rendering the raw column would work for the first and produce a broken image
 * for the second, so every photo goes through here.
 */

const BUCKET = 'space-photos';

export function photoUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;

  const path = storagePath.trim();
  if (path === '') return null;

  // Already a full URL, or a data URI.
  if (/^(https?:|data:|blob:)/i.test(path)) return path;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;

  // A key that already names its bucket, as returned by some upload helpers.
  const key = path.replace(/^\/+/, '');
  const withBucket = key.startsWith(`${BUCKET}/`) ? key : `${BUCKET}/${key}`;

  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${withBucket}`;
}

/** Where an uploaded photo for a given space should be stored. */
export function spacePhotoKey(spaceId: string, filename: string): string {
  const safe = filename.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60);
  return `${spaceId}/${Date.now()}-${safe}`;
}
