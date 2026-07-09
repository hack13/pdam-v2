import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

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
  'code',
  'pre',
  'blockquote',
  'hr',
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel'];

let hooksConfigured = false;

function configureSanitizerHooks() {
  if (hooksConfigured) return;
  hooksConfigured = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

export function renderMarkdown(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return '';

  configureSanitizerHooks();

  const rawHtml = marked.parse(trimmed, { async: false }) as string;

  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}
