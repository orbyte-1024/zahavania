const RAW_TEXT_TAGS = new Set(["script", "style", "noscript", "template", "textarea", "title"]);
const NOISE_TAGS = new Set(["head", "svg", "iframe", "nav", "header", "footer", "aside", "form", "button", "sup", "select"]);
const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "main", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
  "br", "tr", "td", "th", "blockquote", "figcaption", "table", "hr",
]);
const TAG_NAME = /^<(\/?)([a-zA-Z][\w-]*)/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ugrave: "ù",
  icirc: "î",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1].toLowerCase() === "x";
      const codePoint = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let index = start + 1; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

function htmlToText(html: string): string {
  const lower = html.toLowerCase();
  const parts: string[] = [];
  let skippedTag: string | null = null;
  let skipDepth = 0;
  let cursor = 0;

  while (cursor < html.length) {
    const tagStart = html.indexOf("<", cursor);
    const textEnd = tagStart === -1 ? html.length : tagStart;
    if (!skippedTag && textEnd > cursor) parts.push(html.slice(cursor, textEnd));
    if (tagStart === -1) break;

    if (html.startsWith("<!--", tagStart)) {
      const commentEnd = html.indexOf("-->", tagStart + 4);
      cursor = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    const name = TAG_NAME.exec(html.slice(tagStart, tagStart + 64));
    if (!name) {
      if (!skippedTag) parts.push("<");
      cursor = tagStart + 1;
      continue;
    }

    const tagEnd = findTagEnd(html, tagStart);
    if (tagEnd === -1) break;
    cursor = tagEnd + 1;

    const isClosing = name[1] === "/";
    const tag = name[2].toLowerCase();
    const isSelfClosing = html[tagEnd - 1] === "/";

    if (!isClosing && RAW_TEXT_TAGS.has(tag)) {
      const closeStart = lower.indexOf(`</${tag}`, cursor);
      const closeEnd = closeStart === -1 ? -1 : html.indexOf(">", closeStart);
      cursor = closeEnd === -1 ? html.length : closeEnd + 1;
      continue;
    }

    if (skippedTag) {
      if (tag === skippedTag && !isSelfClosing) skipDepth += isClosing ? -1 : 1;
      if (skipDepth === 0) skippedTag = null;
      continue;
    }

    if (!isClosing && !isSelfClosing && NOISE_TAGS.has(tag)) {
      skippedTag = tag;
      skipDepth = 1;
      continue;
    }

    parts.push(BLOCK_TAGS.has(tag) ? "\n" : " ");
  }

  return decodeEntities(parts.join(""))
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
}

function sliceBetween(html: string, lower: string, tag: string): string | null {
  const open = lower.indexOf(`<${tag}`);
  const close = lower.lastIndexOf(`</${tag}>`);
  if (open === -1 || close <= open) return null;
  return html.slice(open, close);
}

function extractTitle(html: string, lower: string): string | null {
  const open = lower.indexOf("<title");
  if (open === -1) return null;
  const contentStart = html.indexOf(">", open);
  const contentEnd = lower.indexOf("</title", contentStart);
  if (contentStart === -1 || contentEnd === -1) return null;
  return decodeEntities(html.slice(contentStart + 1, contentEnd)).replace(/\s+/g, " ").trim() || null;
}

export function extractMainText(
  body: string,
  contentType: string,
  maxLength: number,
): { title: string | null; text: string } {
  if (!contentType.startsWith("text/html") && !contentType.startsWith("application/xhtml+xml")) {
    return { title: null, text: body.trim().slice(0, maxLength) };
  }

  const lower = body.toLowerCase();
  const title = extractTitle(body, lower);
  for (const tag of ["article", "main"]) {
    const section = sliceBetween(body, lower, tag);
    const text = section ? htmlToText(section) : "";
    if (text.length > 200) return { title, text: text.slice(0, maxLength) };
  }
  return { title, text: htmlToText(body).slice(0, maxLength) };
}
