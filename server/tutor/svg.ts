// Cleans a generated SVG before it's stored. The client shows it through <img>, where scripts
// never run, but the stored SVG should still be safe anywhere and must render: it's rebuilt
// from an allowlist of elements, unsafe attributes are dropped, and anything that isn't
// well-formed, or is too large, is rejected so the step goes without its visual.

export const SVG_MAX_BYTES = 40_000;
const MAX_ELEMENTS = 1500;
// Smallest font size in viewBox units. Generated visuals are drawn about 400 units wide and
// shown at phone width (~330px), so 14 renders at about 11.5px there.
const MIN_FONT_SIZE = 14;
// Space kept around labels that would otherwise touch or cross the edge.
const EDGE_PADDING = 8;

const ALLOWED_ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "title", "desc",
  "rect", "circle", "ellipse", "line", "polyline", "polygon", "path",
  "text", "tspan", "marker", "pattern", "clipPath", "mask",
  "linearGradient", "radialGradient", "stop",
]);

export type SvgResult = { ok: true; svg: string } | { ok: false; reason: string };

interface Attribute {
  name: string;
  value: string;
}

const TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/y;
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
const ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g;

function decodeBasic(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// url(...) is only allowed to point inside the SVG (gradients, markers, patterns).
function hasExternalUrl(value: string): boolean {
  const urls = value.match(/url\s*\(([^)]*)\)/gi) ?? [];
  return urls.some((url) => !/^url\s*\(\s*['"]?#/i.test(url));
}

function safeAttribute(attribute: Attribute): boolean {
  const name = attribute.name.toLowerCase();
  const value = decodeBasic(attribute.value).replace(/[\s\0]+/g, " ").trim();
  if (name.startsWith("on")) return false;
  if (name === "href" || name === "xlink:href") return value.startsWith("#");
  if (name.startsWith("xmlns:") && name !== "xmlns:xlink") return false;
  if (name === "xml:base" || name.includes("(")) return false;
  if (hasExternalUrl(value)) return false;
  if (/javascript:|data:|@import|expression\s*\(/i.test(value)) return false;
  return /^[A-Za-z][\w:.-]*$/.test(attribute.name);
}

function parseAttributes(source: string): Attribute[] {
  const attributes: Attribute[] = [];
  for (const match of source.matchAll(ATTRIBUTE)) {
    attributes.push({ name: match[1], value: match[2] ?? match[3] ?? "" });
  }
  return attributes;
}

function numbers(value: string | undefined): number[] {
  return (value ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
}

function getAttribute(attributes: Attribute[], name: string): string | undefined {
  return attributes.find((attribute) => attribute.name === name)?.value;
}

function setAttribute(attributes: Attribute[], name: string, value: string) {
  const existing = attributes.find((attribute) => attribute.name === name);
  if (existing) existing.value = value;
  else attributes.push({ name, value });
}

function clampFontSizes(attributes: Attribute[]) {
  for (const attribute of attributes) {
    if (attribute.name === "font-size") {
      const size = parseFloat(attribute.value);
      if (Number.isFinite(size) && size < MIN_FONT_SIZE) attribute.value = String(MIN_FONT_SIZE);
    } else if (attribute.name === "style") {
      attribute.value = attribute.value.replace(/font-size\s*:\s*([\d.]+)(px)?/gi, (whole, size: string) =>
        parseFloat(size) < MIN_FONT_SIZE ? `font-size:${MIN_FONT_SIZE}px` : whole,
      );
    }
  }
}

function serializeTag(name: string, attributes: Attribute[], selfClosing: boolean): string {
  const attributeText = attributes.map(({ name: key, value }) => ` ${key}="${escapeAttribute(decodeBasic(value))}"`).join("");
  return `<${name}${attributeText}${selfClosing ? "/" : ""}>`;
}

// A rough box for a <text> element: position, anchor, and about 0.55em per character. Only
// used for text with no transform on it or its parents, where the position is known.
interface TextBox {
  x: number;
  y: number;
  fontSize: number;
  anchor: string;
  chars: number;
}

function textExtent(box: TextBox) {
  const width = box.chars * box.fontSize * 0.55;
  const left = box.anchor === "middle" ? box.x - width / 2 : box.anchor === "end" ? box.x - width : box.x;
  return { left, right: left + width, top: box.y - box.fontSize, bottom: box.y + box.fontSize * 0.3 };
}

interface Open {
  name: string;
  kept: boolean;
  transformed: boolean;
  fontSize?: number;
  anchor?: string;
  text?: TextBox;
}

export function sanitizeSvg(raw: string, title: string): SvgResult {
  if (Buffer.byteLength(raw, "utf8") > SVG_MAX_BYTES) return { ok: false, reason: "too large" };
  let source = raw
    .trim()
    .replace(/^<\?xml[^>]*\?>\s*/i, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  if (/<!|<\?/.test(source)) return { ok: false, reason: "doctype, CDATA or processing instruction" };
  source = source.trim();

  const out: string[] = [];
  const stack: Open[] = [];
  const texts: TextBox[] = [];
  let elements = 0;
  let rootAttributes: Attribute[] | undefined;
  let rootIndex = -1;
  let rootClosed = false;
  let hasTitle = false;
  let position = 0;

  while (position < source.length) {
    if (source[position] !== "<") {
      const next = source.indexOf("<", position);
      const end = next === -1 ? source.length : next;
      const text = source.slice(position, end);
      position = end;
      const parent = stack.at(-1);
      if (!parent) {
        if (text.trim()) return { ok: false, reason: "text outside the root element" };
        continue;
      }
      if (!stack.every((open) => open.kept)) continue;
      out.push(text.replace(/&nbsp;/g, "&#160;").replace(ENTITY, "&amp;").replace(/>/g, "&gt;"));
      const box = [...stack].reverse().find((open) => open.text)?.text;
      if (box && (parent.name === "text" || parent.name === "tspan")) box.chars += decodeBasic(text).trim().length;
      continue;
    }

    TAG.lastIndex = position;
    const match = TAG.exec(source);
    if (!match) return { ok: false, reason: "malformed tag" };
    position = TAG.lastIndex;
    const [, closing, name, attributeSource, selfClosing] = match;

    if (closing) {
      const open = stack.pop();
      if (!open || open.name !== name) return { ok: false, reason: `mismatched </${name}>` };
      if (stack.every((parent) => parent.kept) && open.kept) out.push(`</${name}>`);
      if (open.text) texts.push(open.text);
      if (stack.length === 0) rootClosed = true;
      continue;
    }

    if (rootClosed) return { ok: false, reason: "content after the root element" };
    if (stack.length === 0 && name !== "svg") return { ok: false, reason: "root isn't <svg>" };
    if (stack.length === 0 && selfClosing) return { ok: false, reason: "empty <svg>" };
    if (++elements > MAX_ELEMENTS) return { ok: false, reason: "too many elements" };

    const parentsKept = stack.every((open) => open.kept);
    const kept = parentsKept && ALLOWED_ELEMENTS.has(name);
    const attributes = parseAttributes(attributeSource).filter(safeAttribute);
    clampFontSizes(attributes);

    const parent = stack.at(-1);
    const fontSize = parseFloat(getAttribute(attributes, "font-size") ?? "") || parent?.fontSize;
    const anchor = getAttribute(attributes, "text-anchor") ?? parent?.anchor;
    const transformed = Boolean(parent?.transformed || getAttribute(attributes, "transform"));
    const open: Open = { name, kept, transformed, fontSize, anchor };
    // A <tspan> with its own x starts a new line, so it gets its own box.
    const lineStart = name === "text" || (name === "tspan" && getAttribute(attributes, "x") !== undefined);
    if (lineStart && !transformed) {
      const parentBox = [...stack].reverse().find((candidate) => candidate.text)?.text;
      const [x] = numbers(getAttribute(attributes, "x"));
      const [y = parentBox?.y] = numbers(getAttribute(attributes, "y"));
      if (Number.isFinite(x) && y !== undefined && Number.isFinite(y)) {
        open.text = { x, y, fontSize: fontSize ?? 16, anchor: anchor ?? "start", chars: 0 };
      }
    }

    if (kept) {
      if (name === "svg" && stack.length === 0) {
        rootAttributes = attributes;
        rootIndex = out.length;
        out.push("");
      } else {
        out.push(serializeTag(name, attributes, Boolean(selfClosing)));
      }
      if (name === "title" && stack.length === 1) hasTitle = true;
    }
    if (!selfClosing) stack.push(open);
  }

  if (stack.length > 0 || !rootAttributes) return { ok: false, reason: "unclosed elements" };

  // The viewBox sets the drawing's size and shape. Without one, fall back to width and height.
  let viewBox = numbers(getAttribute(rootAttributes, "viewBox"));
  if (viewBox.length !== 4 || viewBox.some((n) => !Number.isFinite(n))) {
    const width = parseFloat(getAttribute(rootAttributes, "width") ?? "");
    const height = parseFloat(getAttribute(rootAttributes, "height") ?? "");
    if (!(width > 0 && height > 0)) return { ok: false, reason: "no usable viewBox" };
    viewBox = [0, 0, width, height];
  }
  let [minX, minY, width, height] = viewBox;
  if (!(width > 0 && height > 0)) return { ok: false, reason: "empty viewBox" };

  // Grow the viewBox to fit labels that run past its edge, so they don't clip.
  let maxX = minX + width;
  let maxY = minY + height;
  for (const box of texts) {
    if (!box.chars) continue;
    const extent = textExtent(box);
    if (extent.left < minX) minX = extent.left - EDGE_PADDING;
    if (extent.top < minY) minY = extent.top - EDGE_PADDING;
    if (extent.right > maxX) maxX = extent.right + EDGE_PADDING;
    if (extent.bottom > maxY) maxY = extent.bottom + EDGE_PADDING;
  }
  width = maxX - minX;
  height = maxY - minY;
  const round = (n: number) => String(Math.round(n * 10) / 10);

  const root = rootAttributes.filter((attribute) => !["width", "height", "viewBox", "xmlns"].includes(attribute.name));
  setAttribute(root, "xmlns", "http://www.w3.org/2000/svg");
  if (/xlink:/.test(out.join(""))) setAttribute(root, "xmlns:xlink", "http://www.w3.org/1999/xlink");
  setAttribute(root, "viewBox", [minX, minY, width, height].map(round).join(" "));
  // An intrinsic size, so <img> knows the aspect ratio. CSS scales it to fit.
  setAttribute(root, "width", round(width));
  setAttribute(root, "height", round(height));
  out[rootIndex] = serializeTag("svg", root, false) + (hasTitle ? "" : `<title>${escapeText(title)}</title>`);

  return { ok: true, svg: out.join("") };
}
