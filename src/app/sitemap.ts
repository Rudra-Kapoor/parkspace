import type { MetadataRoute } from 'next';
import { createPublicClient } from '@/lib/supabase/server';

export const revalidate = 3600;

/**
 * Sitemap.
 *
 * Lists the marketing pages, every published neighbourhood, and every active
 * listing. Listing URLs are safe to publish because the listing page exposes
 * only the approximate location; the exact address is released through a
 * separate, authenticated path.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/how-it-works`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/list-your-space`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/help`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/legal/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/refunds`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/host-terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  try {
    const supabase = createPublicClient();

    const [{ data: localities }, { data: spaces }] = await Promise.all([
      supabase.from('seo_localities').select('city_slug, slug').eq('is_published', true),
      supabase
        .from('public_spaces')
        .select('id, published_at')
        .order('published_at', { ascending: false })
        .limit(2000),
    ]);

    const localityRoutes: MetadataRoute.Sitemap = (localities ?? []).map(
      (row: { city_slug: string; slug: string }) => ({
        url: `${base}/parking/${row.city_slug}/${row.slug}`,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      }),
    );

    const spaceRoutes: MetadataRoute.Sitemap = (spaces ?? []).map(
      (row: { id: string; published_at: string | null }) => ({
        url: `${base}/space/${row.id}`,
        lastModified: row.published_at ? new Date(row.published_at) : undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }),
    );

    return [...staticRoutes, ...localityRoutes, ...spaceRoutes];
  } catch {
    return staticRoutes;
  }
}
