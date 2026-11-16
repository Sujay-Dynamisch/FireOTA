/**
 * The FireOTA agent skill: one SKILL.md, shipped in the CLI, published on the website and
 * installed into projects by `fireota agent install`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// @ts-expect-error -- plain ESM module without type declarations
import { AGENT_TARGETS, installAgentFiles, skillSource, upsertAgentsMd } from "../../packages/cli/lib/agent.mjs";

const dirs: string[] = [];
const project = () => {
  const dir = mkdtempSync(join(tmpdir(), "fireota-agent-"));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("the skill file", () => {
  const skill = skillSource();

  it("has Agent Skills frontmatter with a name matching its folder and a description", () => {
    const front = /^---\n([\s\S]*?)\n---\n/.exec(skill.replace(/\r\n/g, "\n"))?.[1] ?? "";
    expect(front).toMatch(/^name: fireota$/m);
    expect(/^description: (.+)$/m.exec(front)?.[1]?.length).toBeGreaterThan(40);
  });

  it("is published unchanged on the website", () => {
    const published = readFileSync("public/skills/fireota/SKILL.md", "utf8");
    expect(published.replace(/\r\n/g, "\n")).toBe(skill.replace(/\r\n/g, "\n"));
  });

  it("covers every supported framework and never asks the agent to store secrets", () => {
    for (const text of ["React Native", "Expo", "Flutter", "fireota init", "signing generate", "FIREOTA_API_KEY"]) {
      expect(skill).toContain(text);
    }
    expect(skill).toMatch(/Never commit or print `FIREOTA_API_KEY`/);
  });

  it("is shipped in the npm package", () => {
    const pkg = JSON.parse(readFileSync("packages/cli/package.json", "utf8")) as { files: string[] };
    expect(pkg.files).toContain("skills");
  });
});

describe("fireota agent install", () => {
  it("writes the skill for Claude Code and Agent Skills tools, and points AGENTS.md at it", () => {
    const dir = project();
    const results = installAgentFiles({ root: dir });
    expect(results.map((r: string[]) => r[0])).toEqual(["+", "+", "+"]);
    expect(readFileSync(join(dir, AGENT_TARGETS.claude), "utf8")).toBe(skillSource());
    expect(readFileSync(join(dir, AGENT_TARGETS.agents), "utf8")).toBe(skillSource());
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toContain(".agents/skills/fireota/SKILL.md");
  });

  it("is idempotent", () => {
    const dir = project();
    installAgentFiles({ root: dir });
    const again = installAgentFiles({ root: dir });
    expect(again.map((r: string[]) => r[0])).toEqual(["✓", "✓", "✓"]);
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8").match(/fireota:start/g)).toHaveLength(1);
  });

  it("keeps a team's edited skill unless --force is given", () => {
    const dir = project();
    const file = join(dir, AGENT_TARGETS.claude);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, "our own version");
    expect(installAgentFiles({ root: dir, tools: ["claude"] })[0][0]).toBe("!");
    expect(readFileSync(file, "utf8")).toBe("our own version");
    installAgentFiles({ root: dir, tools: ["claude"], force: true });
    expect(readFileSync(file, "utf8")).toBe(skillSource());
  });

  it("writes nothing in a dry run", () => {
    const dir = project();
    installAgentFiles({ root: dir, dry: true });
    expect(() => readFileSync(join(dir, "AGENTS.md"))).toThrow();
  });

  it("rejects an unknown tool", () => {
    expect(() => installAgentFiles({ root: project(), tools: ["vim"] })).toThrow(/Unknown tool/);
  });
});

describe("AGENTS.md", () => {
  it("adds the block after existing instructions and keeps them", () => {
    const next = upsertAgentsMd("# Rules\n\nUse pnpm.\n");
    expect(next.startsWith("# Rules\n\nUse pnpm.\n\n<!-- fireota:start -->")).toBe(true);
  });

  it("replaces an older FireOTA block in place", () => {
    const old = "# Rules\n\n<!-- fireota:start -->\nold text\n<!-- fireota:end -->\n\nMore rules.\n";
    const next = upsertAgentsMd(old);
    expect(next).not.toContain("old text");
    expect(next).toContain("More rules.");
    expect(next.match(/fireota:start/g)).toHaveLength(1);
  });

  it("keeps Windows line endings", () => {
    const next = upsertAgentsMd("# Rules\r\n\r\nUse pnpm.\r\n");
    expect(next).not.toMatch(/[^\r]\n/);
  });
});
