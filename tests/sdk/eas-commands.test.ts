/**
 * EAS Update parity commands in the FireOTA CLI:
 * update:list, update:republish, update:edit, update:delete, and channel:list.
 */
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const pExecFile = promisify(execFile);
const binPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../packages/cli/bin/fireota.mjs");

interface RecordedRequest {
  method: string;
  url: string;
  pathname: string;
  searchParams: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

let server: Server;
let serverUrl = "";
let recordedRequests: RecordedRequest[] = [];

beforeAll(async () => {
  await new Promise<void>((resolvePromise) => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        let body: any = null;
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            body = raw;
          }
        }
        const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host || "127.0.0.1"}`);
        recordedRequests.push({
          method: req.method ?? "GET",
          url: req.url ?? "",
          pathname: parsedUrl.pathname,
          searchParams: parsedUrl.searchParams,
          headers: req.headers,
          body,
        });

        let data: any = { ok: true };
        if (parsedUrl.pathname === "/api/public/v1/releases") {
          data = [
            {
              id: "rel_test_1",
              number: 1,
              channel: parsedUrl.searchParams.get("channel") || "production",
              platform: "android",
              runtime_version: "1.0.0",
              status: "published",
              rollout_percentage: 100,
              message: "Initial release",
            },
          ];
        } else if (parsedUrl.pathname === "/api/public/v1/channels") {
          data = [
            {
              id: "chan_1",
              name: "production",
              environment: "production",
              appId: "app_1",
              latestRelease: null,
            },
          ];
        } else if (parsedUrl.pathname.endsWith("/publish")) {
          data = {
            ok: true,
            rollout: body?.rolloutPercentage ?? 100,
          };
        } else if (req.method === "DELETE") {
          data = { id: "rel_123", deleted: true };
        }

        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        serverUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolvePromise();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolvePromise) => {
    if (server) {
      server.close(() => resolvePromise());
    } else {
      resolvePromise();
    }
  });
});

beforeEach(() => {
  recordedRequests = [];
});

async function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  try {
    const { stdout, stderr } = await pExecFile(process.execPath, [binPath, ...args], {
      env: {
        ...process.env,
        FIREOTA_URL: serverUrl,
        FIREOTA_API_KEY: "fota_sk_live_test_api_key",
        ...envOverrides,
      },
    });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (error: any) {
    return {
      ok: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      code: error.code ?? 1,
    };
  }
}

describe("EAS-style update commands", () => {
  it("update:list --channel production --json sends GET /api/public/v1/releases with channel+limit params and prints only JSON", async () => {
    const res = await runCli(["update:list", "--channel", "production", "--json"]);
    expect(res.ok).toBe(true);

    expect(recordedRequests).toHaveLength(1);
    const req = recordedRequests[0]!;
    expect(req.method).toBe("GET");
    expect(req.pathname).toBe("/api/public/v1/releases");
    expect(req.searchParams.get("channel")).toBe("production");
    expect(req.searchParams.get("limit")).toBe("50");
    expect(req.headers["authorization"]).toBe("Bearer fota_sk_live_test_api_key");

    // Output must be valid JSON and strictly JSON only
    expect(() => JSON.parse(res.stdout)).not.toThrow();
    const json = JSON.parse(res.stdout);
    expect(Array.isArray(json)).toBe(true);
    expect(json[0].id).toBe("rel_test_1");
    expect(res.stdout.trim().startsWith("[")).toBe(true);
    expect(res.stdout.trim().endsWith("]")).toBe(true);
  });

  it("update:republish <id> --destination-branch beta sends POST .../publish {action:'promote',channel:'beta'}", async () => {
    const res = await runCli(["update:republish", "rel_123", "--destination-branch", "beta"]);
    expect(res.ok).toBe(true);

    expect(recordedRequests).toHaveLength(1);
    const req = recordedRequests[0]!;
    expect(req.method).toBe("POST");
    expect(req.pathname).toBe("/api/public/v1/releases/rel_123/publish");
    expect(req.headers["authorization"]).toBe("Bearer fota_sk_live_test_api_key");
    expect(req.body).toEqual({
      action: "promote",
      channel: "beta",
    });
  });

  it("update:edit <id> --rollout-percentage 25 sends {action:'rollout',rolloutPercentage:25}", async () => {
    const res = await runCli(["update:edit", "rel_123", "--rollout-percentage", "25"]);
    expect(res.ok).toBe(true);

    expect(recordedRequests).toHaveLength(1);
    const req = recordedRequests[0]!;
    expect(req.method).toBe("POST");
    expect(req.pathname).toBe("/api/public/v1/releases/rel_123/publish");
    expect(req.headers["authorization"]).toBe("Bearer fota_sk_live_test_api_key");
    expect(req.body).toEqual({
      action: "rollout",
      rolloutPercentage: 25,
    });
  });

  it("update:delete <id> --non-interactive sends DELETE and without --yes/--non-interactive does NOT send DELETE (stdin closed)", async () => {
    // 1. Without --yes / --non-interactive: fails immediately (stdin is not a tty) and does NOT send DELETE
    const failRes = await runCli(["update:delete", "rel_123"]);
    expect(failRes.ok).toBe(false);
    expect(recordedRequests.filter((r) => r.method === "DELETE")).toHaveLength(0);
    expect(failRes.stderr || failRes.stdout).toContain("Pass --yes or --non-interactive to delete a release");

    // 2. With --non-interactive: sends DELETE
    const okRes = await runCli(["update:delete", "rel_123", "--non-interactive"]);
    expect(okRes.ok).toBe(true);
    const deleteReqs = recordedRequests.filter((r) => r.method === "DELETE");
    expect(deleteReqs).toHaveLength(1);
    expect(deleteReqs[0]!.method).toBe("DELETE");
    expect(deleteReqs[0]!.pathname).toBe("/api/public/v1/releases/rel_123");
    expect(deleteReqs[0]!.headers["authorization"]).toBe("Bearer fota_sk_live_test_api_key");
  });

  it("channel:list --json hits GET /api/public/v1/channels", async () => {
    const res = await runCli(["channel:list", "--json"]);
    expect(res.ok).toBe(true);

    expect(recordedRequests).toHaveLength(1);
    const req = recordedRequests[0]!;
    expect(req.method).toBe("GET");
    expect(req.pathname).toBe("/api/public/v1/channels");
    expect(req.headers["authorization"]).toBe("Bearer fota_sk_live_test_api_key");

    expect(() => JSON.parse(res.stdout)).not.toThrow();
    const json = JSON.parse(res.stdout);
    expect(Array.isArray(json)).toBe(true);
    expect(json[0].name).toBe("production");
  });
});
