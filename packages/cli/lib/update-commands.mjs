/**
 * EAS Update parity commands: update, update:*, channel:*
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

export function formatTable(headers, rows) {
  if (rows.length === 0) return "No records found.";
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] !== undefined && r[i] !== null ? String(r[i]).length : 0)))
  );
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join("  ");
  const separatorLine = colWidths.map((w) => "-".repeat(w)).join("  ");
  const dataLines = rows.map((row) =>
    row.map((cell, i) => (cell !== undefined && cell !== null ? String(cell) : "-").padEnd(colWidths[i])).join("  ")
  );
  return [headerLine, separatorLine, ...dataLines].join("\n");
}

export function detectAppId(flags) {
  if (flags?.app && flags.app !== true) return String(flags.app);
  if (process.env.FIREOTA_APP_ID) return process.env.FIREOTA_APP_ID;
  if (existsSync("fireota.config.js")) {
    try {
      const match = /appId:\s*["']([^"']+)["']/.exec(readFileSync("fireota.config.js", "utf8"));
      if (match) return match[1];
    } catch {}
  }
  if (existsSync("app.json")) {
    try {
      const json = JSON.parse(readFileSync("app.json", "utf8"));
      const expo = json.expo ?? json;
      if (expo?.updates?.url) {
        const match = /\/expo\/([^/]+)\/manifest/.exec(expo.updates.url);
        if (match) return match[1];
      }
      if (expo?.extra?.fireota?.appId) return String(expo.extra.fireota.appId);
    } catch {}
  }
  return undefined;
}

export async function handleUpdate(flags, { executePublish, fail }) {
  const normalized = { ...flags };
  if (normalized.branch && !normalized.channel) {
    normalized.channel = normalized.branch;
  }
  if (!normalized.platform) {
    normalized.platform = "all";
  }
  if (normalized["rollout-percentage"] !== undefined && normalized.rollout === undefined) {
    normalized.rollout = normalized["rollout-percentage"];
  }
  if (normalized["private-key-path"] && !normalized["private-key"]) {
    normalized["private-key"] = normalized["private-key-path"];
  }
  if (normalized.auto && !normalized.message && !normalized.notes) {
    try {
      const msg = execFileSync("git", ["log", "-1", "--pretty=%s"], {
        stdio: ["ignore", "pipe", "ignore"],
      }).toString().trim();
      if (!msg) {
        fail("Could not read git commit message with --auto: git log returned empty");
      }
      normalized.message = msg;
    } catch (err) {
      fail(`Could not read git commit message with --auto: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!normalized.app) {
    const detected = detectAppId(normalized);
    if (detected) normalized.app = detected;
  }
  return executePublish(normalized);
}

export async function handleUpdateList(flags, { api, jsonMode }) {
  const params = new URLSearchParams();
  const app = flags.app ?? process.env.FIREOTA_APP_ID ?? detectAppId(flags);
  if (app) params.set("appId", String(app));
  const channel = flags.channel ?? flags.branch;
  if (channel) params.set("channel", String(channel));
  if (flags.platform) params.set("platform", String(flags.platform));
  const limit = flags.limit ?? 50;
  params.set("limit", String(limit));
  if (flags.groupId ?? flags["group-id"]) params.set("groupId", String(flags.groupId ?? flags["group-id"]));
  if (flags.runtimeVersion ?? flags.runtime) params.set("runtimeVersion", String(flags.runtimeVersion ?? flags.runtime));

  const query = params.toString() ? `?${params.toString()}` : "";
  const releases = await api("GET", `/releases${query}`);

  if (jsonMode) {
    console.log(JSON.stringify(releases, null, 2));
    return;
  }

  const headers = ["ID", "Number", "Channel", "Platform", "Runtime", "Status", "Rollout", "Message"];
  const rows = releases.map((r) => [
    r.id,
    `#${r.number}`,
    r.channel || "-",
    r.platform,
    r.runtime_version,
    r.status,
    `${r.rollout_percentage ?? 100}%`,
    (r.message || r.release_notes || "").split("\n")[0] || "-",
  ]);

  console.log(formatTable(headers, rows));
}

export async function handleUpdateView(id, flags, { api, jsonMode, fail }) {
  if (!id) fail("release id required");
  const release = await api("GET", `/releases/${encodeURIComponent(id)}`);

  if (jsonMode) {
    console.log(JSON.stringify(release, null, 2));
    return;
  }

  const rows = [
    ["ID", release.id],
    ["Number", `#${release.number}`],
    ["Channel", release.channel || "-"],
    ["Platform", release.platform],
    ["Runtime", release.runtime_version],
    ["Status", release.status],
    ["Rollout", `${release.rollout_percentage ?? 100}%`],
    ["Message", (release.message || release.release_notes || "-").trim()],
    ["Signed", release.signed ? "yes" : "no"],
    ["Bundle Hash", release.bundle?.hash || release.bundle_hash || "-"],
    ["Bundle Size", release.bundle?.size ? `${(release.bundle.size / 1024 / 1024).toFixed(2)} MB (${release.bundle.size} bytes)` : "-"],
    ["Created", release.created_at || "-"],
  ];

  console.log(formatTable(["Field", "Value"], rows));
}

export async function handleUpdateRepublish(id, flags, { api, jsonMode, fail }) {
  if (!id) fail("release id required");
  const channel = flags["destination-channel"] ?? flags["destination-branch"];
  if (!channel || channel === true) fail("--destination-channel or --destination-branch is required");
  const rollout = flags["rollout-percentage"] ?? flags.rollout ?? flags.percentage ?? flags.percent;
  let rolloutNum;
  if (rollout !== undefined && rollout !== true && rollout !== "") {
    rolloutNum = Number(rollout);
    if (isNaN(rolloutNum) || rolloutNum < 0 || rolloutNum > 100) {
      fail("--rollout-percentage must be a number between 0 and 100");
    }
  }
  const body = {
    action: "promote",
    channel: String(channel),
    ...(rolloutNum !== undefined ? { rolloutPercentage: rolloutNum } : {}),
  };
  const result = await api("POST", `/releases/${encodeURIComponent(id)}/publish`, body);
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Republished update ${id} to channel "${channel}"${rolloutNum !== undefined ? ` at ${rolloutNum}%` : ""}.`);
}

export async function handleUpdateRollback(id, flags, { api, jsonMode, fail }) {
  if (!id) fail("release id required");
  const body = {
    action: "rollback",
    reason: flags.reason && flags.reason !== true ? String(flags.reason) : "Rollback requested from CLI",
    ...(flags.target && flags.target !== true ? { targetReleaseId: String(flags.target) } : {}),
  };
  const result = await api("POST", `/releases/${encodeURIComponent(id)}/publish`, body);
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.restoredReleaseId ? `Rolled back; now serving ${result.restoredReleaseId}.` : "Rolled back; channel has no active release.");
}

export async function handleUpdateEdit(id, flags, { api, jsonMode, fail }) {
  if (!id) fail("release id required");
  const rollout = flags["rollout-percentage"] ?? flags.percentage ?? flags.percent ?? flags.rollout;
  if (rollout === undefined || rollout === true || rollout === "") fail("--rollout-percentage is required");
  const num = Number(rollout);
  if (isNaN(num) || num < 0 || num > 100) fail("--rollout-percentage must be a number between 0 and 100");
  const body = {
    action: "rollout",
    rolloutPercentage: num,
  };
  const result = await api("POST", `/releases/${encodeURIComponent(id)}/publish`, body);
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Rollout for ${id} set to ${result.rollout ?? num}%.`);
}

export async function handleUpdatePause(id, flags, { api, jsonMode, fail }) {
  if (!id) fail("release id required");
  const result = await api("POST", `/releases/${encodeURIComponent(id)}/publish`, { action: "pause" });
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Update ${id} paused.`);
}

export async function handleUpdateResume(id, flags, { api, jsonMode, fail }) {
  if (!id) fail("release id required");
  const result = await api("POST", `/releases/${encodeURIComponent(id)}/publish`, { action: "resume" });
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Update ${id} resumed.`);
}

export async function handleUpdateDelete(id, flags, { api, jsonMode, fail }) {
  if (!id) fail("release id required");
  if (!flags.yes && !flags.y && !flags["non-interactive"]) {
    if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await rl.question(`Are you sure you want to delete release ${id}? (y/N) `);
        if (!/^y(es)?$/i.test(answer.trim())) {
          console.log("Aborted.");
          return;
        }
      } finally {
        rl.close();
      }
    } else {
      fail("Pass --yes or --non-interactive to delete a release in non-interactive mode.");
    }
  }
  const result = await api("DELETE", `/releases/${encodeURIComponent(id)}`);
  if (jsonMode) {
    console.log(JSON.stringify(result ?? { ok: true }, null, 2));
    return;
  }
  console.log(`Deleted release ${id}.`);
}

export async function handleChannelList(flags, { api, jsonMode }) {
  const app = flags.app ?? process.env.FIREOTA_APP_ID ?? detectAppId(flags);
  const query = app ? `?appId=${encodeURIComponent(String(app))}` : "";
  const channels = await api("GET", `/channels${query}`);
  if (jsonMode) {
    console.log(JSON.stringify(channels, null, 2));
    return;
  }
  const headers = ["Channel", "Environment", "App ID", "Latest Release"];
  const rows = channels.map((c) => {
    const lr = c.latestRelease
      ? `#${c.latestRelease.number} (${c.latestRelease.platform}) · ${c.latestRelease.status} · ${c.latestRelease.rolloutPercentage ?? 100}%`
      : "-";
    return [c.name, c.environment || "-", c.appId || "-", lr];
  });
  console.log(formatTable(headers, rows));
}

export async function handleChannelCreate(name, flags, { api, jsonMode, need, fail }) {
  if (!name) fail("channel name required");
  const appId = flags.app ?? process.env.FIREOTA_APP_ID ?? detectAppId(flags) ?? need(flags, "app", "FIREOTA_APP_ID");
  const body = {
    appId,
    name,
    ...(flags.environment ? { environment: String(flags.environment) } : {}),
  };
  const result = await api("POST", "/channels", body);
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Created channel "${name}".`);
}

export async function handleChannelView(name, flags, { api, jsonMode, fail }) {
  if (!name) fail("channel name required");
  const app = flags.app ?? process.env.FIREOTA_APP_ID ?? detectAppId(flags);
  const query = app ? `?appId=${encodeURIComponent(String(app))}` : "";
  const channels = await api("GET", `/channels${query}`);
  const channel = channels.find((c) => c.name.toLowerCase() === name.toLowerCase() || c.name === name);
  if (!channel) fail(`Channel "${name}" not found.`);
  if (jsonMode) {
    console.log(JSON.stringify(channel, null, 2));
    return;
  }
  const lr = channel.latestRelease
    ? `#${channel.latestRelease.number} (${channel.latestRelease.platform}) · ${channel.latestRelease.status} · ${channel.latestRelease.rolloutPercentage ?? 100}%`
    : "-";
  const rows = [
    ["Channel", channel.name],
    ["ID", channel.id || "-"],
    ["Environment", channel.environment || "-"],
    ["App ID", channel.appId || "-"],
    ["Latest Release", lr],
  ];
  console.log(formatTable(["Field", "Value"], rows));
}

export async function handleChannelRollout(name, flags, { api, jsonMode, need, fail }) {
  if (!name) fail("channel name required");
  const percentVal = flags.percent ?? flags.percentage ?? flags["rollout-percentage"] ?? flags.rollout ?? need(flags, "percent");
  const percentNum = Number(percentVal);
  if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) {
    fail("--percent must be a number between 0 and 100");
  }
  const app = flags.app ?? process.env.FIREOTA_APP_ID ?? detectAppId(flags);
  const query = `?channel=${encodeURIComponent(name)}${app ? `&appId=${encodeURIComponent(String(app))}` : ""}`;
  const releases = await api("GET", `/releases${query}`);
  const target = releases.find((r) => r.status === "published");
  if (!target) fail(`No published release found on channel "${name}".`);
  const result = await api("POST", `/releases/${encodeURIComponent(target.id)}/publish`, {
    action: "rollout",
    rolloutPercentage: percentNum,
  });
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Rollout for latest release #${target.number} (${target.id}) on channel "${name}" set to ${result.rollout ?? percentNum}%.`);
}

export async function dispatchUpdateCommand(command, sub, positional, flags, context) {
  let cmd = command;
  let args = positional;

  if (command === "update") {
    if (["list", "view", "republish", "rollback", "edit", "pause", "resume", "delete"].includes(sub)) {
      cmd = `update:${sub}`;
      args = positional.slice(1);
    }
  } else if (command === "channel") {
    if (["list", "create", "view", "rollout"].includes(sub)) {
      cmd = `channel:${sub}`;
      args = positional.slice(1);
    }
  }

  switch (cmd) {
    case "update":
      await handleUpdate(flags, context);
      return true;
    case "update:list":
      await handleUpdateList(flags, context);
      return true;
    case "update:view":
      await handleUpdateView(args[0], flags, context);
      return true;
    case "update:republish":
      await handleUpdateRepublish(args[0], flags, context);
      return true;
    case "update:rollback":
      await handleUpdateRollback(args[0], flags, context);
      return true;
    case "update:edit":
      await handleUpdateEdit(args[0], flags, context);
      return true;
    case "update:pause":
      await handleUpdatePause(args[0], flags, context);
      return true;
    case "update:resume":
      await handleUpdateResume(args[0], flags, context);
      return true;
    case "update:delete":
      await handleUpdateDelete(args[0], flags, context);
      return true;
    case "channel:list":
      await handleChannelList(flags, context);
      return true;
    case "channel:create":
      await handleChannelCreate(args[0], flags, context);
      return true;
    case "channel:view":
      await handleChannelView(args[0], flags, context);
      return true;
    case "channel:rollout":
      await handleChannelRollout(args[0], flags, context);
      return true;
    default:
      return false;
  }
}
