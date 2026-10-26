import { describe, expect, it } from "vitest";

import { docIndex, searchDocs } from "@/components/docs/search-index";

const topSlugs = (q: string, n = 3) => searchDocs(q, n).map((h) => h.slug);

describe("docs search", () => {
  it("indexes every page and its sections with real text", () => {
    const index = docIndex();
    expect(index.filter((h) => h.sectionId === null).length).toBeGreaterThan(20);
    const publish = index.find((h) => h.slug === "publish" && h.sectionId);
    expect(publish?.text.length).toBeGreaterThan(40);
  });

  it("finds the right page for natural questions", () => {
    expect(topSlugs("How do I roll back a bad update?")).toContain("rollouts");
    expect(topSlugs("How do I publish my first update?", 5)).toEqual(
      expect.arrayContaining(["quickstart", "publish"]),
    );
    expect(topSlugs("set up code signing")).toContain("code-signing");
    expect(topSlugs("install the SDK")).toContain("install-sdk");
    expect(topSlugs("staged rollout percentage")).toContain("rollouts");
  });

  it("ignores filler words and returns nothing for them alone", () => {
    expect(searchDocs("how do I")).toHaveLength(0);
  });
});
