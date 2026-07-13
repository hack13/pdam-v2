export type GalleryMediaType = 'image' | 'video';

export function validateGalleryMediaUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

export function getVideoEmbedUrl(raw: string): string | null {
  const url = validateGalleryMediaUrl(raw);
  if (!url) return null;

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
  }
  if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
    const id = url.pathname.startsWith('/shorts/')
      ? url.pathname.split('/')[2]
      : url.searchParams.get('v');
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
  }
  if (hostname === 'vimeo.com' || hostname === 'player.vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean).find((segment) => /^\d+$/.test(segment));
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

export function isDirectVideoUrl(raw: string): boolean {
  const url = validateGalleryMediaUrl(raw);
  return !!url && /\.(mp4|webm|ogg|mov)$/i.test(url.pathname);
}
