/**
 * Invitation lifecycle, invitation email, role-based access and route protection.
 * The invitation tests run against an in-memory table that really applies each query's filters,
 * so a wrong or missing filter fails the test.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as unknown,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return mocks.db;
  },
}));

import { getRequiredPermissionForPath, navGroups } from "@/components/layout/nav";
import { orgContextForUser, requirePermission } from "@/lib/backend/context.server";
import { invitationTemplateParams } from "@/lib/backend/email/mailer.server";
import {
  acceptInvitation,
  acceptPendingInvites,
  assertUserCanBeInvited,
  declineInvitation,
  deliverInvite,
  hashInviteToken,
  INVITATION_EXPIRY_DAYS,
  newInvite,
  verifyInvitationToken,
} from "@/lib/backend/invites.server";
import { effectivePermissions, ROLE_PERMISSIONS, roleHasPermission, type OrgRole, type Permission } from "@/lib/backend/rbac";
import { safeRedirect } from "@/lib/safe-redirect";

type Row = Record<string, any>;

/** The subset of the Supabase query builder these flows use, applied to plain arrays. */
function fakeDb(seed: Record<string, Row[]>, authUser: Row | null = null): any {
  const tables: Record<string, Row[]> = seed;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((row: Row) => boolean)[] = [];
    let payload: Row | null = null;
    const run = () => {
      const matched = rows.filter((row) => filters.every((f) => f(row)));
      if (payload) matched.forEach((row) => Object.assign(row, payload));
      return matched;
    };
    const query: any = {
      select: () => query,
      update: (values: Row) => {
        payload = values;
        return query;
      },
      insert: (values: Row) => {
        rows.push(values);
        return Promise.resolve({ error: null });
      },
      eq: (column: string, value: unknown) => (filters.push((r) => r[column] === value), query),
      neq: (column: string, value: unknown) => (filters.push((r) => r[column] !== value), query),
      in: (column: string, values: unknown[]) => (filters.push((r) => values.includes(r[column])), query),
      is: (column: string, value: unknown) => (filters.push((r) => (r[column] ?? null) === value), query),
      or: (expression: string) => {
        const terms = expression.split(",").map((term) => {
          const [column, , ...rest] = term.split(".");
          return { column: column!, value: rest.join(".").replace(/^"|"$/g, "") };
        });
        filters.push((r) => terms.some((t) => r[t.column] === t.value));
        return query;
      },
      order: () => query,
      limit: () => query,
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: run(), error: null }),
    };
    return query;
  };
  return { from, auth: { admin: { getUserById: async () => ({ data: { user: authUser } }) } } };
}

const ORG = "org-mine";
const OTHER_ORG = "org-other";
const TOKEN = "a".repeat(64);
const inDays = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();

function invited(overrides: Row = {}): Row {
  return {
    id: "member-1",
    organization_id: ORG,
    email: "dev@acme.com",
    role: "developer",
    status: "invited",
    user_id: null,
    invite_token: hashInviteToken(TOKEN),
    invite_expires_at: inDays(5),
    invited_by: null,
    organizations: { id: ORG, name: "Acme Corp" },
    custom_roles: null,
    ...overrides,
  };
}

describe("inviting someone", () => {
  const email = "dev@acme.com";

  it("blocks a user who is active in another organization, matched by email", async () => {
    const db = fakeDb({ organization_members: [{ organization_id: OTHER_ORG, email, status: "active" }] });
    await expect(assertUserCanBeInvited(db, ORG, email)).rejects.toThrow("already assigned to another organization");
  });

  it("blocks a user who is active elsewhere under a different member email, matched by account", async () => {
    const db = fakeDb({
      profiles: [{ id: "user-1", email }],
      organization_members: [{ organization_id: OTHER_ORG, email: "old@acme.com", user_id: "user-1", status: "active" }],
    });
    await expect(assertUserCanBeInvited(db, ORG, email)).rejects.toThrow("already assigned to another organization");
  });

  it("blocks a user who is suspended in another organization", async () => {
    const db = fakeDb({ organization_members: [{ organization_id: OTHER_ORG, email, status: "suspended" }] });
    await expect(assertUserCanBeInvited(db, ORG, email)).rejects.toThrow("already assigned to another organization");
  });

  it("normalizes the email before checking", async () => {
    const db = fakeDb({ organization_members: [{ organization_id: OTHER_ORG, email, status: "active" }] });
    await expect(assertUserCanBeInvited(db, ORG, "  DEV@Acme.com ")).rejects.toThrow("another organization");
  });

  it("allows a user with no organization", async () => {
    const result = await assertUserCanBeInvited(fakeDb({}), ORG, email);
    expect(result.existingUserId).toBeNull();
  });

  it("allows a user whose only tie elsewhere is an unaccepted invitation", async () => {
    const db = fakeDb({ organization_members: [{ organization_id: OTHER_ORG, email, status: "invited" }] });
    await expect(assertUserCanBeInvited(db, ORG, email)).resolves.toBeDefined();
  });

  it("blocks someone who is already active in this organization", async () => {
    const db = fakeDb({ organization_members: [{ organization_id: ORG, email, status: "active" }] });
    await expect(assertUserCanBeInvited(db, ORG, email)).rejects.toThrow("already an active member of this organization");
  });

  it("blocks a duplicate invitation but lets the same invitation be resent", async () => {
    const db = fakeDb({ organization_members: [{ organization_id: ORG, email, status: "invited" }] });
    await expect(assertUserCanBeInvited(db, ORG, email)).rejects.toThrow("already pending");
    await expect(assertUserCanBeInvited(db, ORG, email, { resending: true })).resolves.toBeDefined();
  });

  it("refuses to resend once the person has joined another organization", async () => {
    const db = fakeDb({
      organization_members: [
        { organization_id: ORG, email, status: "invited" },
        { organization_id: OTHER_ORG, email, status: "active" },
      ],
    });
    await expect(assertUserCanBeInvited(db, ORG, email, { resending: true })).rejects.toThrow("another organization");
  });
});

describe("invitation email", () => {
  const options = {
    recipientEmail: "developer@example.com",
    inviterName: "Alice Admin",
    inviterEmail: "alice@acme.com",
    organizationName: "Acme Corp",
    roleName: "Developer",
    acceptUrl: "https://ota.acme.com/invite/tok1234567890abcdef",
    declineUrl: "https://ota.acme.com/invite/tok1234567890abcdef?action=decline",
    expiresInDays: 7,
    expiresAtFormatted: "Nov 7, 2026",
    appBaseUrl: "https://ota.acme.com",
  };
  const deliver = (db = fakeDb({})) =>
    deliverInvite(db, {
      email: "engineer@company.org",
      role: "developer",
      organizationId: ORG,
      organizationName: "Company Org",
      inviterName: "Sam",
      inviterEmail: "sam@company.org",
      appBaseUrl: "http://localhost:8080/",
    });
  const configureEmailJs = () => {
    vi.stubEnv("EMAILJS_SERVICE_ID", "service_1");
    vi.stubEnv("EMAILJS_TEMPLATE_ID", "template_1");
    vi.stubEnv("EMAILJS_PUBLIC_KEY", "public_1");
    vi.stubEnv("EMAILJS_PRIVATE_KEY", "private_1");
  };
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const template = readFileSync("src/lib/backend/email/templates/emailjs-invitation.html", "utf8");

  it("has the logo, organization, inviter, role, expiry, mobile styles and both links", () => {
    for (const text of [
      'src="{{{logo_url}}}"',
      "{{organization_name}}",
      "{{inviter_name}}",
      "{{role_name}}",
      "Accept Invitation",
      'href="{{{accept_url}}}"',
      'href="{{{decline_url}}}"',
      "{{expires_in_days}} days",
      "@media only screen and (max-width: 600px)",
    ]) {
      expect(template).toContain(text);
    }
  });

  it("supplies every variable the template uses", () => {
    const used = [...template.matchAll(/\{\{\{?\s*(\w+)\s*\}?\}\}/g)].map((match) => match[1]!);
    const params = invitationTemplateParams(options);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(params, name).toHaveProperty(name);
    expect(params.logo_url).toBe("https://ota.acme.com/logo-mark-96.png");
  });

  it("leaves only our own generated URLs unescaped, so names cannot inject markup", () => {
    const raw = [...template.matchAll(/\{\{\{\s*(\w+)\s*\}\}\}/g)].map((match) => match[1]);
    expect([...new Set(raw)].sort()).toEqual(["accept_url", "app_url", "decline_url", "logo_url"]);
  });

  it("creates a unique 256-bit token that expires after the defined period", () => {
    const first = newInvite();
    expect(first.token).toMatch(/^[a-f0-9]{64}$/);
    expect(newInvite().token).not.toBe(first.token);
    const expected = Date.now() + INVITATION_EXPIRY_DAYS * 86400_000;
    expect(Math.abs(new Date(first.expiresAt).getTime() - expected)).toBeLessThan(10_000);
  });

  it("sends through EmailJS and reports success only when it accepted the email", async () => {
    configureEmailJs();
    fetchMock.mockResolvedValue(new Response("OK", { status: 200 }));
    const delivery = await deliver();
    expect(delivery.emailSent).toBe(true);
    expect(delivery.problem).toBeNull();
    expect(delivery.link).toBe(`http://localhost:8080/invite/${delivery.token}`);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.emailjs.com/api/v1.0/email/send");
    expect(JSON.parse(init.body)).toMatchObject({
      service_id: "service_1",
      template_id: "template_1",
      user_id: "public_1",
      accessToken: "private_1",
      template_params: { to_email: "engineer@company.org", accept_url: delivery.link, organization_name: "Company Org" },
    });
  });

  it("does not claim success, call EmailJS, or log the secret link when it is not configured", async () => {
    // Vitest loads .env, so a developer's real settings have to be cleared here.
    vi.stubEnv("EMAILJS_SERVICE_ID", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const delivery = await deliver();
    expect(delivery.emailSent).toBe(false);
    expect(delivery.problem).toContain("EMAILJS_");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(info.mock.calls.flat().join(" ")).not.toContain(delivery.token);
    info.mockRestore();
  });

  it.each([
    ["EmailJS refuses", () => fetchMock.mockResolvedValue(new Response("API calls are disabled", { status: 403 }))],
    ["the network fails", () => fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:443"))],
  ])("gives the inviter the link and hides details when %s", async (_name, arrange) => {
    configureEmailJs();
    arrange();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const delivery = await deliver();
    expect(delivery.emailSent).toBe(false);
    expect(delivery.problem).toBe("The email could not be sent. Share this link yourself or try again.");
    expect(delivery.link).toContain(delivery.token);
    warn.mockRestore();
  });
});

describe("opening an invitation link", () => {
  it("accepts the token through its stored hash, never the raw value", async () => {
    const hashed = await verifyInvitationToken(fakeDb({ organization_members: [invited()] }), TOKEN);
    expect(hashed).toMatchObject({ status: "valid", organizationName: "Acme Corp", roleLabel: "Developer", email: "dev@acme.com" });

    const stolenHash = await verifyInvitationToken(fakeDb({ organization_members: [invited()] }), hashInviteToken(TOKEN));
    expect(stolenHash.status).toBe("not_found");
  });

  it("shows a custom role by its own name", async () => {
    const db = fakeDb({ organization_members: [invited({ role: "viewer", custom_roles: { name: "QA Lead" } })] });
    expect(await verifyInvitationToken(db, TOKEN)).toMatchObject({ roleLabel: "QA Lead" });
  });

  it("reports expired, unknown and malformed links", async () => {
    const expired = fakeDb({ organization_members: [invited({ invite_expires_at: inDays(-1) })] });
    expect((await verifyInvitationToken(expired, TOKEN)).status).toBe("expired");
    expect((await verifyInvitationToken(fakeDb({}), TOKEN)).status).toBe("not_found");
    expect((await verifyInvitationToken(fakeDb({}), "short")).status).toBe("not_found");
  });
});

describe("accepting an invitation", () => {
  const seed = (...extra: Row[]) => fakeDb({ organization_members: [invited(), ...extra], profiles: [{ id: "user-1", name: "Dee" }] });

  it("activates the member, links the account and clears the token", async () => {
    const db = seed();
    const result = await acceptInvitation(db, TOKEN, "user-1", "DEV@acme.com");
    expect(result).toMatchObject({ success: true, alreadyMember: false, organizationId: ORG });
    const { data } = await db.from("organization_members").select().eq("id", "member-1").maybeSingle();
    expect(data).toMatchObject({ status: "active", user_id: "user-1", invite_token: null, name: "Dee" });
  });

  it("refuses a different signed-in account, even with the correct link", async () => {
    const db = seed();
    await expect(acceptInvitation(db, TOKEN, "user-2", "attacker@evil.com")).rejects.toThrow("Sign in with that address");
    const { data } = await db.from("organization_members").select().eq("id", "member-1").maybeSingle();
    expect(data).toMatchObject({ status: "invited", user_id: null });
  });

  it.each(["active", "suspended"])("refuses a user who is %s in another organization", async (status) => {
    const db = seed({ id: "m-2", organization_id: OTHER_ORG, email: "dev@acme.com", user_id: "user-1", status });
    await expect(acceptInvitation(db, TOKEN, "user-1", "dev@acme.com")).rejects.toThrow("another organization");
  });

  it("refuses an expired link", async () => {
    const db = fakeDb({ organization_members: [invited({ invite_expires_at: inDays(-1) })] });
    await expect(acceptInvitation(db, TOKEN, "user-1", "dev@acme.com")).rejects.toThrow("expired");
  });

  it("works only once", async () => {
    const db = seed();
    await acceptInvitation(db, TOKEN, "user-1", "dev@acme.com");
    await expect(acceptInvitation(db, TOKEN, "user-1", "dev@acme.com")).rejects.toThrow("not found");
  });
});

describe("declining an invitation", () => {
  it("marks it declined and the link stops working", async () => {
    const db = fakeDb({ organization_members: [invited()] });
    expect(await declineInvitation(db, TOKEN)).toMatchObject({ success: true, organizationId: ORG, email: "dev@acme.com" });
    const { data } = await db.from("organization_members").select().eq("id", "member-1").maybeSingle();
    expect(data).toMatchObject({ status: "declined", invite_token: null });
    await expect(acceptInvitation(db, TOKEN, "user-1", "dev@acme.com")).rejects.toThrow("not found");
  });

  it("refuses an expired link", async () => {
    const db = fakeDb({ organization_members: [invited({ invite_expires_at: inDays(-1) })] });
    await expect(declineInvitation(db, TOKEN)).rejects.toThrow("expired");
  });
});

describe("signing in with a pending invitation", () => {
  const user = { email: "dev@acme.com", email_confirmed_at: inDays(-1), user_metadata: { name: "Dee" } };
  const statusOf = async (db: any) => (await db.from("organization_members").select().eq("id", "member-1").maybeSingle()).data.status;

  it("does not join automatically when the invitation has a link to accept or decline", async () => {
    const db = fakeDb({ organization_members: [invited()] }, user);
    await acceptPendingInvites(db, "user-1");
    expect(await statusOf(db)).toBe("invited");
  });

  it("still joins invitations from before links existed, for a verified email only", async () => {
    const legacy = () => invited({ invite_token: null, invite_expires_at: null });
    const unverified = fakeDb({ organization_members: [legacy()] }, { ...user, email_confirmed_at: null });
    await acceptPendingInvites(unverified, "user-1");
    expect(await statusOf(unverified)).toBe("invited");

    const verified = fakeDb({ organization_members: [legacy()] }, user);
    await acceptPendingInvites(verified, "user-1");
    expect(await statusOf(verified)).toBe("active");
  });
});

describe("role and permission enforcement", () => {
  it("gives each built-in role exactly the expected access", () => {
    const expectations: [OrgRole, Permission[], Permission[]][] = [
      ["viewer", ["app.read", "release.read"], ["release.create", "release.publish", "audit.read", "security.read", "api_key.read", "webhook.read", "team.manage"]],
      ["developer", ["release.create", "release.upload", "webhook.read"], ["release.publish", "audit.read", "security.read", "api_key.read", "team.manage"]],
      ["release_manager", ["release.publish", "release.rollback", "rollout.update", "audit.read", "security.read"], ["api_key.read", "team.manage", "app.create"]],
      ["admin", ["team.manage", "api_key.read", "api_key.create", "webhook.create", "org.update"], ["org.delete"]],
      ["owner", ["org.delete", "team.manage"], []],
    ];
    for (const [role, allowed, denied] of expectations) {
      for (const permission of allowed) expect(roleHasPermission(role, permission), `${role} ${permission}`).toBe(true);
      for (const permission of denied) expect(roleHasPermission(role, permission), `${role} ${permission}`).toBe(false);
    }
  });

  it("lets a custom role replace the permissions of everyone except owners", () => {
    const custom: Permission[] = ["app.read", "release.create"];
    expect(effectivePermissions("developer", custom)).toEqual(custom);
    expect(effectivePermissions("developer", ["app.read", "not.real"])).toEqual(["app.read"]);
    expect(effectivePermissions("owner", custom)).toEqual(ROLE_PERMISSIONS.owner);
  });

  it("applies a role change on the member's very next request, and cuts off suspended members", async () => {
    const member: Row = {
      organization_id: ORG,
      user_id: "user-1",
      email: "dev@acme.com",
      name: "Dee",
      role: "developer",
      status: "active",
      organizations: { name: "Acme", slug: "acme" },
      custom_roles: null,
    };
    mocks.db = fakeDb({ organization_members: [member] });

    const before = await orgContextForUser("user-1");
    expect(() => requirePermission(before, "release.publish")).toThrow("cannot perform release.publish");

    member["role"] = "release_manager";
    const promoted = await orgContextForUser("user-1");
    expect(() => requirePermission(promoted, "release.publish")).not.toThrow();

    member["custom_roles"] = { permissions: ["app.read"] };
    const narrowed = await orgContextForUser("user-1");
    expect(() => requirePermission(narrowed, "release.publish")).toThrow();

    member["status"] = "suspended";
    await expect(orgContextForUser("user-1")).rejects.toThrow("not a member");
  });

  it("requires a session for every server function except the deliberately public ones", () => {
    const anonymous: string[] = [];
    for (const file of readdirSync("src/lib/api").filter((f) => f.endsWith(".functions.ts"))) {
      const source = readFileSync(`src/lib/api/${file}`, "utf8");
      for (const part of source.split(/(?=export const \w+ = createServerFn)/).slice(1)) {
        if (!part.includes("requireSupabaseAuth")) anonymous.push(part.match(/export const (\w+)/)![1]!);
      }
    }
    expect(anonymous.sort()).toEqual(["askDocs", "declineInvitationFn", "getInvitationDetailsFn"]);
  });

  it("keeps the audit-log activity feed behind audit.read", () => {
    const source = readFileSync("src/lib/api/core.functions.ts", "utf8");
    const listActivity = source.slice(source.indexOf("export const listActivity"), source.indexOf("export const getDashboard"));
    expect(listActivity).toContain(`hasPermission(ctx, "audit.read")`);
  });
});

describe("sidebar and direct URL protection", () => {
  it("maps each protected page to its permission, including deep and create pages", () => {
    const expected: Record<string, string | undefined> = {
      "/audit-logs": "audit.read",
      "/security": "security.read",
      "/settings/api-keys": "api_key.read",
      "/settings/ci-cd": "api_key.read",
      "/settings/webhooks": "webhook.read",
      "/team": "team.read",
      "/projects": "project.read",
      "/projects/connect": "project.connect",
      "/apps": "app.read",
      "/apps/abc": "app.read",
      "/apps/new": "app.create",
      "/apps/abc/releases/new": "release.create",
      "/releases/abc": "release.read",
      "/channels": "channel.read",
      "/rollouts/abc": "rollout.read",
      "/analytics": "analytics.read",
      "/agents": "agent.read",
      "/dashboard": undefined,
      "/settings": undefined,
      "/apps-archive": undefined,
    };
    for (const [path, permission] of Object.entries(expected)) {
      expect(getRequiredPermissionForPath(path), path).toBe(permission);
    }
  });

  it("guards every sidebar link with the same permission as its page", () => {
    for (const item of navGroups.flatMap((group) => group.items)) {
      expect(item.permission, item.to).toBe(getRequiredPermissionForPath(item.to));
    }
  });

  it("shows each role only the sidebar links it may open", () => {
    const visible = (role: OrgRole) =>
      navGroups
        .flatMap((group) => group.items)
        .filter((item) => !item.permission || ROLE_PERMISSIONS[role].includes(item.permission as Permission))
        .map((item) => item.to);

    expect(visible("viewer")).not.toEqual(expect.arrayContaining(["/audit-logs"]));
    for (const hidden of ["/audit-logs", "/security", "/settings/api-keys", "/settings/ci-cd", "/settings/webhooks"]) {
      expect(visible("viewer")).not.toContain(hidden);
    }
    expect(visible("developer")).toContain("/settings/webhooks");
    expect(visible("developer")).not.toContain("/settings/api-keys");
    expect(visible("release_manager")).toContain("/audit-logs");
    expect(visible("admin")).toContain("/settings/api-keys");
  });

  it("keeps invitation links reachable: no parent /invite route may intercept them", () => {
    expect(existsSync("src/routes/invite.tsx")).toBe(false);
    expect(existsSync("src/routes/invite.$token.tsx")).toBe(true);
  });

  it("only follows same-site redirects after sign-in", () => {
    expect(safeRedirect("/invite/abc", "/dashboard")).toBe("/invite/abc");
    for (const unsafe of [undefined, "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"]) {
      expect(safeRedirect(unsafe, "/dashboard")).toBe("/dashboard");
    }
  });
});
