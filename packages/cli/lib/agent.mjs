/**
 * `fireota agent install`: puts the FireOTA setup skill where AI coding agents look for it, so
 * one prompt ("set up FireOTA") is enough in Claude Code, Codex, Cursor, Antigravity and others.
 *
 *   .claude/skills/fireota/SKILL.md   Claude Code
 *   .agents/skills/fireota/SKILL.md   Codex and other agents that read the Agent Skills standard
 *   AGENTS.md                         a short pointer, for agents that read AGENTS.md
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const AGENT_TARGETS = {
  claude: join(".claude", "skills", "fireota", "SKILL.md"),
  agents: join(".agents", "skills", "fireota", "SKILL.md"),
};

const START = "<!-- fireota:start -->";
const END = "<!-- fireota:end -->";

export function skillSource() {
  return readFileSync(new URL("../skills/fireota/SKILL.md", import.meta.url), "utf8");
}

export const AGENTS_BLOCK = `${START}
## FireOTA (over-the-air updates)

To set up FireOTA, publish an OTA update or add it to CI, follow \`.agents/skills/fireota/SKILL.md\`
(the same file as \`.claude/skills/fireota/SKILL.md\`). Never commit \`FIREOTA_API_KEY\` or \`fireota-keys/\`.
${END}`;

/** Adds the FireOTA block to AGENTS.md, or replaces an older one, keeping everything else. */
export function upsertAgentsMd(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const block = AGENTS_BLOCK.replace(/\n/g, eol);
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start >= 0 && end > start) return text.slice(0, start) + block + text.slice(end + END.length);
  if (!text.trim()) return `# AGENTS.md${eol}${eol}${block}${eol}`;
  return `${text.replace(/\s*$/, "")}${eol}${eol}${block}${eol}`;
}

/**
 * Installs the skill for the chosen tools ("claude", "agents", "agents-md"). Existing skill files
 * are only replaced with `force`, so a team's edits are kept.
 */
export function installAgentFiles({ root = ".", tools = ["claude", "agents", "agents-md"], force = false, dry = false } = {}) {
  const skill = skillSource();
  const results = [];
  for (const tool of tools) {
    if (tool === "agents-md") {
      const file = join(root, "AGENTS.md");
      const before = existsSync(file) ? readFileSync(file, "utf8") : "";
      const after = upsertAgentsMd(before);
      if (after === before) results.push(["✓", "AGENTS.md already points to the FireOTA skill"]);
      else {
        if (!dry) writeFileSync(file, after);
        results.push(["+", `${before ? "updated" : "created"} AGENTS.md`]);
      }
      continue;
    }
    const target = AGENT_TARGETS[tool];
    if (!target) throw new Error(`Unknown tool "${tool}". Use claude, agents or agents-md.`);
    const file = join(root, target);
    if (existsSync(file)) {
      const current = readFileSync(file, "utf8");
      if (current === skill) {
        results.push(["✓", `${target} is up to date`]);
        continue;
      }
      if (!force) {
        results.push(["!", `${target} differs (kept your version; use --force to replace it)`]);
        continue;
      }
    }
    if (!dry) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, skill);
    }
    results.push(["+", `wrote ${target}`]);
  }
  return results;
}
