export const DESCRIPTION_IMAGE_SRC_PATTERN =
  /^\/api\/assets\/[0-9a-f-]{36}\/description-images\/[0-9a-f-]{36}$/;

export const DESCRIPTION_IMAGE_URL_REGEX =
  /\/api\/assets\/([0-9a-f-]{36})\/description-images\/([0-9a-f-]{36})/gi;

export function descriptionImageUrl(productId: string, imageId: string): string {
  return `/api/assets/${productId}/description-images/${imageId}`;
}

export function extractReferencedDescriptionImageIds(
  description: string,
  productId: string,
): Set<string> {
  const ids = new Set<string>();
  const pattern = new RegExp(DESCRIPTION_IMAGE_URL_REGEX.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(description)) !== null) {
    if (match[1] === productId) {
      ids.add(match[2]);
    }
  }

  return ids;
}
