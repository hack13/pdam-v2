import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';
import { DESCRIPTION_IMAGE_SRC_PATTERN } from './description-image-url';

marked.setOptions({
  gfm: true,
  breaks: true,
});

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'del',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'code',
  'pre',
  'blockquote',
  'hr',
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'loading'];

let hooksConfigured = false;

function configureSanitizerHooks() {
  if (hooksConfigured) return;
  hooksConfigured = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }

    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') ?? '';
      if (!DESCRIPTION_IMAGE_SRC_PATTERN.test(src)) {
        node.remove();
        return;
      }
      node.setAttribute('loading', 'lazy');
    }
  });
}

export function renderMarkdown(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return '';

  configureSanitizerHooks();

  let rawHtml: string;
  
  if (trimmed.startsWith('<')) {
    rawHtml = trimmed;
  } else {
    rawHtml = marked.parse(trimmed, { async: false }) as string;
  }

  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}
