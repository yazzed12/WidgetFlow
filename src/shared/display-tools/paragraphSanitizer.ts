/**
 * Safe Rich Text Sanitizer & Runtime Normalizer for WidgetFlow Paragraph Display Tools
 */

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A', 'SPAN', 'DIV'
]);

const ALLOWED_PROTOCOLS = ['https:', 'http:', 'mailto:'];

export function isSafeUrl(urlStr: string): boolean {
  if (!urlStr) return false;
  const trimmed = urlStr.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
    return false;
  }
  try {
    const parsed = new URL(trimmed, 'https://dummy.domain');
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sanitizes rich text HTML for storage and rendering.
 * Strips script tags, iframe, dangerous protocols, and event handlers.
 */
export function sanitizeParagraphHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';
  const trimmed = rawHtml.trim();
  if (!trimmed) return '';

  // If plain text (no HTML tags detected), return clean paragraph
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
    return `<p>${escapeTextContent(trimmed)}</p>`;
  }

  // Browser DOMParser sanitization if window/DOM environment is present
  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(trimmed, 'text/html');
      return (sanitizeNode(doc.body) as HTMLElement).innerHTML || '';
    } catch {
      // Fallback to regex sanitizer
    }
  }

  // Node/SSR fallback regex sanitization
  return fallbackRegexSanitize(trimmed);
}

function escapeTextContent(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeNode(node: Node): Node {
  const children = Array.from(node.childNodes);

  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tagName = el.tagName.toUpperCase();

      if (!ALLOWED_TAGS.has(tagName)) {
        // Replace node with text content or unwrap
        const textNode = document.createTextNode(el.textContent || '');
        el.parentNode?.replaceChild(textNode, el);
        continue;
      }

      // Remove dangerous attributes
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const attrName = attr.name.toLowerCase();
        if (attrName.startsWith('on') || attrName === 'style' || attrName === 'formaction') {
          el.removeAttribute(attr.name);
        }
      }

      // Special handling for <a> links
      if (tagName === 'A') {
        const href = el.getAttribute('href') || '';
        if (!isSafeUrl(href)) {
          el.removeAttribute('href');
          el.setAttribute('data-disabled-link', 'true');
        } else {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
      }

      // Recursively sanitize children
      sanitizeNode(el);
    }
  }

  return node;
}

function fallbackRegexSanitize(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*["']?\s*(?:javascript|data|vbscript):[^"'>\s]*/gi, 'href="#"');
}
