import sharp from 'sharp';

export interface ProcessedImage {
  data: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
  isAnimated: boolean;
  frameCount: number;
}

const THUMBNAIL_MAX_WIDTH = 800;
const THUMBNAIL_QUALITY = 82;

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/tiff',
]);

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

export async function processToWebp(
  input: Buffer,
  options: { maxWidth?: number; quality?: number } = {},
): Promise<ProcessedImage> {
  const maxWidth = options.maxWidth ?? THUMBNAIL_MAX_WIDTH;
  const quality = options.quality ?? THUMBNAIL_QUALITY;

  const metadata = await sharp(input).metadata();
  const isAnimated = (metadata.pages ?? 1) > 1;

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  let needsResize = false;
  if (metadata.width && metadata.width > maxWidth) {
    needsResize = true;
  }

  let pipeline: ReturnType<typeof sharp> = sharp(input, isAnimated ? { animated: true, pages: -1 } : undefined);

  if (needsResize) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  }

  pipeline = pipeline.webp({ quality, lossless: false, effort: 4 });
  const data = await pipeline.toBuffer();

  const outMeta = await sharp(data, isAnimated ? { animated: true, pages: -1 } : undefined).metadata();

  return {
    data,
    mimeType: 'image/webp',
    width: outMeta.width ?? originalWidth,
    height: originalHeight,
    isAnimated,
    frameCount: metadata.pages ?? 1,
  };
}

export async function generateThumbnail(source: Buffer): Promise<ProcessedImage> {
  return processToWebp(source, { maxWidth: THUMBNAIL_MAX_WIDTH, quality: THUMBNAIL_QUALITY });
}

const DESCRIPTION_IMAGE_MAX_WIDTH = 1600;
const DESCRIPTION_IMAGE_QUALITY = 85;

export async function processDescriptionImage(source: Buffer): Promise<ProcessedImage> {
  return processToWebp(source, {
    maxWidth: DESCRIPTION_IMAGE_MAX_WIDTH,
    quality: DESCRIPTION_IMAGE_QUALITY,
  });
}

const AVATAR_SIZE = 200;
const AVATAR_QUALITY = 85;

export async function processAvatarToWebp(input: Buffer): Promise<ProcessedImage> {
  const data = await sharp(input)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: AVATAR_QUALITY, lossless: false, effort: 4 })
    .toBuffer();

  const outMeta = await sharp(data).metadata();

  return {
    data,
    mimeType: 'image/webp',
    width: outMeta.width ?? AVATAR_SIZE,
    height: outMeta.height ?? AVATAR_SIZE,
    isAnimated: false,
    frameCount: 1,
  };
}

export async function processCreatorHeaderToWebp(input: Buffer): Promise<ProcessedImage> {
  return processToWebp(input, { maxWidth: 2400, quality: 86 });
}
