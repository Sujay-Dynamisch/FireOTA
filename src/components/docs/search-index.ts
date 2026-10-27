/**
 * Full-text index of the documentation, built from the same `docGroups` the pages render.
 * Used in the browser for instant search and on the server to ground "Ask AI" answers.
 */
import { isValidElement, type ReactNode } from "react";

import { docGroups } from "./pages";

export interface DocHit {
  /** Unique key: slug or slug#section. */
  key: string;
  slug: string;
  sectionId: string | null;
  group: string;
  groupIcon: string;
  pageTitle: string;
  /** Page title for page entries, section title for section entries. */
  title: string;
  description: string;
  /** Plain text of the page intro or section, for matching and snippets. */
  text: string;
}

const SKIP_PROPS = new Set([
  "className",
  "to",
  "href",
  "language",
  "kind",
  "name",
  "id",
  "key",
  "params",
  "style",
]);

/** Collects the visible text of a React node tree without rendering it. */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    return Object.entries(props)
      .filter(([key]) => !SKIP_PROPS.has(key))
      .map(([, value]) => (typeof value === "function" ? "" : nodeText(value as ReactNode)))
      .join(" ");
  }
  return "";
}

let cache: DocHit[] | null = null;

export function docIndex(): DocHit[] {
  if (cache) return cache;
  const hits: DocHit[] = [];
  for (const group of docGroups) {
    for (const page of group.pages) {
      const base = {
        slug: page.slug,
        group: group.title,
        groupIcon: group.icon,
        pageTitle: page.title,
      };
      hits.push({
        ...base,
        key: page.slug,
        sectionId: null,
        title: page.title,
        description: page.description,
        text: `${page.description} ${page.sections.map((s) => s.title).join(" · ")}`,
      });
      for (const section of page.sections) {
        hits.push({
          ...base,
          key: `${page.slug}#${section.id}`,
          sectionId: section.id,
          title: section.title,
          description: page.title,
          text: nodeText(section.body).replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  cache = hits;
  return hits;
}

/** Filler words that would otherwise match nearly every section. */
const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from get how i if in into is it its me my of on or our should so that the their them then there these this to use using was we what when where which who why will with you your".split(
    " ",
  ),
);

/** Lower-cases and folds common variants ("roll back" → "rollback", "set up" → "setup"). */
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/\broll(?:ed|ing|s)?[ -]back\b/g, "rollback")
    .replace(/\bset up\b|\bset-up\b/g, "setup")
    .replace(/\bsign in\b|\blog in\b/g, "login");

const tokenize = (value: string) =>
  normalize(value)
    .split(/[^a-z0-9.@/-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

let normalized: { title: string; page: string; text: string }[] | null = null;

/** Normalized copies of the index, computed once. */
function normalizedIndex() {
  normalized ??= docIndex().map((hit) => ({
    title: normalize(hit.title),
    page: normalize(`${hit.pageTitle} ${hit.description}`),
    text: normalize(hit.text),
  }));
  return normalized;
}

/**
 * Ranks entries by how well they match the query: title matches weigh most, then the page
 * title and description, then the body text. Each word is weighted by how rare it is in the
 * docs (IDF), so "rollback" counts far more than "update". Phrase matches get a bonus.
 */
export function searchDocs(
  query: string,
  limit = 12,
  /** Share of the query's weighted vocabulary an entry must contain (lower = looser). */
  minCoverage = 0.5,
): (DocHit & { score: number; snippet: string })[] {
  const words = tokenize(query);
  if (words.length === 0) return [];
  const phrase = normalize(query.trim());
  const index = docIndex();
  const norm = normalizedIndex();
  // Whole words only (plus plural / -ed / -ing forms): "bad" must not match "badge".
  const patterns = new Map(
    words.map((w) => [
      w,
      new RegExp(
        `(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(s|es|ed|d|ing)?(?![a-z0-9])`,
        "g",
      ),
    ]),
  );
  const has = (value: string, word: string) => {
    const re = patterns.get(word)!;
    re.lastIndex = 0;
    return re.test(value);
  };
  const count = (value: string, word: string) => value.match(patterns.get(word)!)?.length ?? 0;

  const idf = new Map<string, number>();
  for (const word of words) {
    const df = norm.filter(
      (n) => has(n.title, word) || has(n.page, word) || has(n.text, word),
    ).length;
    // Words that appear nowhere in the docs ("bad", typos) cannot help ranking: ignore them.
    if (df > 0) idf.set(word, Math.log(1 + index.length / df));
  }
  if (idf.size === 0) return [];
  const totalIdf = [...idf.values()].reduce((a, b) => a + b, 0);
  const results: (DocHit & { score: number; snippet: string })[] = [];
  for (let n = 0; n < index.length; n += 1) {
    const hit = index[n]!;
    const { title, page, text } = norm[n]!;
    let score = 0;
    let matchedIdf = 0;
    for (const [word, weight] of idf) {
      let s = 0;
      if (has(title, word)) s += title.startsWith(word) ? 12 : 8;
      if (has(page, word)) s += 3;
      const inText = count(text, word);
      if (inText > 0) s += 1 + Math.min(3, inText - 1);
      if (s > 0) matchedIdf += weight;
      score += s * weight;
    }
    // Must cover enough of the query's informative (weighted) vocabulary (half by default).
    if (matchedIdf === 0 || matchedIdf < totalIdf * minCoverage) continue;
    if (title.includes(phrase)) score += 15;
    else if (text.includes(phrase)) score += 6;
    if (hit.sectionId === null) score += 1;
    results.push({ ...hit, score, snippet: snippet(hit.text, words) });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function snippet(text: string, words: string[]) {
  const lower = text.toLowerCase();
  const at =
    words
      .map((w) => lower.indexOf(w))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 40);
  return `${start > 0 ? "…" : ""}${text.slice(start, start + 160).trim()}${start + 160 < text.length ? "…" : ""}`;
}

export function hitUrl(hit: Pick<DocHit, "slug" | "sectionId">) {
  return `/docs/${hit.slug}${hit.sectionId ? `#${hit.sectionId}` : ""}`;
}
