/** API keys, webhooks, CI/CD deployment history and agent workflows. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, notify, orgContextForUser, ownedRow, requirePermission } from "@/lib/backend/context.server";
import { generateApiKey, randomToken } from "@/lib/backend/crypto.server";
import { fail } from "@/lib/backend/errors";
import { API_SCOPES } from "@/lib/backend/apikeys.server";
import {
  WEBHOOK_EVENTS,
  dispatchWebhooks,
  sealWebhookSecret,
  webhookEndpointProblem,
} from "@/lib/backend/webhooks.server";
import { publishRelease, rollbackRelease, setRolloutPercentage } from "@/lib/backend/releases.server";

const stamp = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 16).replace("T", " ") : null);

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "api_key.read");
    const { data } = await ctx.db
      .from("api_keys")
      .select("id, name, environment, scopes, status, expires_at, last_used_at, created_at")
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false });
    return (data ?? []).map((k) => ({
      id: k.id as string,
      name: k.name as string,
      environment: k.environment as "production" | "beta" | "staging" | "development",
      scopes: (k.scopes as string[]) ?? [],
      created: stamp(k.created_at as string) ?? "",
      lastUsed: stamp(k.last_used_at as string | null),
      status: k.status as "active" | "revoked" | "expired",
      expires: stamp(k.expires_at as string | null),
    }));
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; environment: string; scopes: string[]; expiresInDays?: number }) =>
    z
      .object({
        name: z.string().min(2).max(60),
        environment: z.enum(["production", "beta", "staging", "development"]),
        scopes: z.array(z.string().max(40)).min(1),
        expiresInDays: z.number().min(1).max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "api_key.create");
    const unknown = data.scopes.filter((s) => !API_SCOPES.includes(s) && s !== "*");
    if (unknown.length > 0) fail("INVALID_INPUT", `Unknown scopes: ${unknown.join(", ")}`);

    const key = generateApiKey(data.environment);
    const { data: row, error } = await ctx.db
      .from("api_keys")
      .insert({
        organization_id: ctx.organizationId,
        name: data.name,
        environment: data.environment,
        prefix: key.prefix,
        token_hash: key.hash,
        scopes: data.scopes,
        status: "active",
        expires_at: data.expiresInDays ? new Date(Date.now() + data.expiresInDays * 86400_000).toISOString() : null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) fail("INVALID_INPUT", "Could not create the API key.");

    await audit(ctx, {
      action: "api_key.created",
      resourceType: "api_key",
      resourceId: row.id as string,
      after: { name: data.name, environment: data.environment, scopes: data.scopes },
    });
    // The plaintext token is returned exactly once and never stored.
    return { id: row.id as string, name: data.name, environment: data.environment, scopes: data.scopes, token: key.token };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "api_key.revoke");
    await ownedRow(ctx, "api_keys", data.id, "id");
    await ctx.db
      .from("api_keys")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId);
    await audit(ctx, { action: "api_key.revoked", resourceType: "api_key", resourceId: data.id });
    return { id: data.id, status: "revoked" as const };
  });

export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "webhook.read");
    const [{ data: hooks }, { data: deliveries }] = await Promise.all([
      ctx.db
        .from("webhooks")
        .select("id, endpoint, events, status, last_delivery_at, created_at, secret")
        .eq("organization_id", ctx.organizationId)
        .order("created_at", { ascending: false }),
      ctx.db
        .from("webhook_deliveries")
        .select("id, webhook_id, event, status_code, latency_ms, attempt, succeeded, created_at")
        .eq("organization_id", ctx.organizationId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    return (hooks ?? []).map((h) => {
      const rows = (deliveries ?? []).filter((d) => d.webhook_id === h.id);
      const successes = rows.filter((d) => d.succeeded).length;
      return {
        id: h.id as string,
        endpoint: h.endpoint as string,
        events: (h.events as string[]) ?? [],
        status: h.status as "active" | "paused" | "failing",
        lastDelivery: stamp(h.last_delivery_at as string | null) ?? "never",
        successRate: rows.length > 0 ? Number(((successes / rows.length) * 100).toFixed(1)) : 100,
        created: stamp(h.created_at as string) ?? "",
        secretSet: Boolean(h.secret),
        deliveries: rows.slice(0, 10).map((d) => ({
          id: d.id as string,
          event: d.event as string,
          status: Number(d.status_code ?? 0),
          latency: `${Number(d.latency_ms ?? 0)}ms`,
          at: stamp(d.created_at as string) ?? "",
          attempt: Number(d.attempt ?? 1),
        })),
      };
    });
  });

export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpoint: string; events: string[] }) =>
    z.object({ endpoint: z.string().url().max(500), events: z.array(z.string().max(48)).min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "webhook.create");
    const problem = webhookEndpointProblem(data.endpoint);
    if (problem) fail("INVALID_INPUT", problem);
    const unknown = data.events.filter((e) => !WEBHOOK_EVENTS.includes(e as never));
    if (unknown.length > 0) fail("INVALID_INPUT", `Unknown events: ${unknown.join(", ")}`);

    const secret = randomToken(24);
    const { data: row, error } = await ctx.db
      .from("webhooks")
      .insert({
        organization_id: ctx.organizationId,
        endpoint: data.endpoint,
        events: data.events,
        secret: sealWebhookSecret(secret),
        status: "active",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) fail("INVALID_INPUT", "Could not create the webhook.");
    await audit(ctx, { action: "webhook.created", resourceType: "webhook", resourceId: row.id as string, after: { endpoint: data.endpoint } });
    // The signing secret is shown once so the receiver can verify signatures.
    return { id: row.id as string, endpoint: data.endpoint, events: data.events, secret };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "webhook.delete");
    await ownedRow(ctx, "webhooks", data.id, "id");
    await ctx.db.from("webhooks").delete().eq("id", data.id).eq("organization_id", ctx.organizationId);
    await audit(ctx, { action: "webhook.deleted", resourceType: "webhook", resourceId: data.id });
    return { id: data.id, removed: true };
  });

export const sendWebhookTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "webhook.update");
    await ownedRow(ctx, "webhooks", data.id, "id");
    await dispatchWebhooks(ctx.db, ctx.organizationId, "release.created", { test: true, webhookId: data.id }, data.id);
    return { ok: true };
  });

export const listDeployments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "release.read");
    const [{ data: rows }, { data: apps }, { data: releases }] = await Promise.all([
      ctx.db
        .from("deployments")
        .select("id, app_id, release_id, type, status, source, created_by_label, created_at")
        .eq("organization_id", ctx.organizationId)
        .order("created_at", { ascending: false })
        .limit(30),
      ctx.db.from("apps").select("id, name").eq("organization_id", ctx.organizationId),
      ctx.db.from("releases").select("id, number").eq("organization_id", ctx.organizationId),
    ]);
    return (rows ?? []).map((d) => ({
      id: d.id as string,
      provider: d.source === "api_key" ? "CI pipeline" : d.source === "agent" ? "FireOTA agent" : "Dashboard",
      repo: (apps ?? []).find((a) => a.id === d.app_id)?.name ?? "",
      release: `#${(releases ?? []).find((r) => r.id === d.release_id)?.number ?? "—"}`,
      status: d.status === "completed" ? "success" : (d.status as string),
      at: stamp(d.created_at as string) ?? "",
    }));
  });

export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "agent.read");
    const [{ data: agents }, { data: permissions }] = await Promise.all([
      ctx.db
        .from("agents")
        .select("id, key, name, description, status, capabilities, approval_policy, last_execution_at")
        .eq("organization_id", ctx.organizationId)
        .order("created_at", { ascending: true }),
      ctx.db.from("agent_permissions").select("agent_id, tool, mode").eq("organization_id", ctx.organizationId),
    ]);
    return (agents ?? []).map((a) => ({
      id: a.id as string,
      name: a.name as string,
      description: (a.description as string) ?? "",
      status: a.status as "available" | "enabled" | "coming_soon",
      lastExecution: stamp(a.last_execution_at as string | null),
      capabilities: (a.capabilities as string[]) ?? [],
      permissions: (permissions ?? [])
        .filter((p) => p.agent_id === a.id)
        .map((p) => ({ tool: p.tool as string, mode: p.mode as "allowed" | "denied" | "requires_approval" })),
      approvalPolicy: (a.approval_policy as string) ?? "",
    }));
  });

export const listAgentExecutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId?: string } | undefined) =>
    z.object({ agentId: z.string().uuid().optional() }).optional().parse(input ?? undefined),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "agent.read");
    let query = ctx.db
      .from("agent_executions")
      .select("id, agent_id, action, app_id, resource_id, status, started_at, completed_at")
      .eq("organization_id", ctx.organizationId);
    if (data?.agentId) query = query.eq("agent_id", data.agentId);
    const [{ data: rows }, { data: agents }, { data: apps }] = await Promise.all([
      query.order("started_at", { ascending: false }).limit(50),
      ctx.db.from("agents").select("id, name").eq("organization_id", ctx.organizationId),
      ctx.db.from("apps").select("id, name").eq("organization_id", ctx.organizationId),
    ]);
    return (rows ?? []).map((e) => ({
      id: e.id as string,
      agentId: e.agent_id as string,
      agentName: (agents ?? []).find((a) => a.id === e.agent_id)?.name ?? "",
      action: e.action as string,
      appName: (apps ?? []).find((a) => a.id === e.app_id)?.name ?? "",
      releaseLabel: (e.resource_id as string) ?? "",
      status: e.status as "completed" | "failed" | "awaiting_approval" | "running",
      started: stamp(e.started_at as string) ?? "",
      completed: stamp(e.completed_at as string | null),
    }));
  });

export const listAgentApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "agent.read");
    const [{ data: rows }, { data: agents }, { data: apps }] = await Promise.all([
      ctx.db
        .from("approval_requests")
        .select("id, agent_id, action, resource_type, resource_id, app_id, risk_level, reasoning, payload, status, requested_at")
        .eq("organization_id", ctx.organizationId)
        .eq("status", "pending")
        .order("requested_at", { ascending: false }),
      ctx.db.from("agents").select("id, name").eq("organization_id", ctx.organizationId),
      ctx.db.from("apps").select("id, name").eq("organization_id", ctx.organizationId),
    ]);
    return (rows ?? []).map((r) => {
      const payload = (r.payload as Record<string, unknown>) ?? {};
      return {
        id: r.id as string,
        agentName: (agents ?? []).find((a) => a.id === r.agent_id)?.name ?? "FireOTA agent",
        requestedAction: r.action as string,
        appName: (apps ?? []).find((a) => a.id === r.app_id)?.name ?? "",
        releaseLabel: String(payload["releaseLabel"] ?? r.resource_id ?? ""),
        channelName: String(payload["channelName"] ?? ""),
        environment: (payload["environment"] as "production" | "beta" | "staging" | "development") ?? "production",
        risk: r.risk_level as "low" | "medium" | "high",
        reasoning: (r.reasoning as string) ?? "",
        requestedAt: stamp(r.requested_at as string) ?? "",
      };
    });
  });

/**
 * Approving an agent request executes the requested action with the approver's
 * authority — never with elevated agent rights.
 */
export const decideAgentApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; decision: "approve" | "reject"; reason?: string }) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approve", "reject"]), reason: z.string().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "agent.execute");
    const request = await ownedRow<{
      id: string;
      action: string;
      resource_id: string | null;
      payload: Record<string, unknown>;
      status: string;
    }>(ctx, "approval_requests", data.id, "id, action, resource_id, payload, status");
    if (request.status !== "pending") fail("CONFLICT", "That request has already been decided.");

    if (data.decision === "reject") {
      await ctx.db
        .from("approval_requests")
        .update({ status: "rejected", rejected_by: context.userId, rejected_at: new Date().toISOString(), reason: data.reason ?? null })
        .eq("id", data.id);
      await audit(ctx, { action: "agent.approval_rejected", resourceType: "approval_request", resourceId: data.id });
      return { id: data.id, decision: "reject" as const };
    }

    const releaseId = (request.payload["releaseId"] as string | undefined) ?? request.resource_id ?? "";
    if (request.action === "release.publish") {
      requirePermission(ctx, "release.publish");
      await publishRelease(ctx, { releaseId, rolloutPercentage: Number(request.payload["rolloutPercentage"] ?? 10) });
    } else if (request.action === "release.rollback") {
      requirePermission(ctx, "release.rollback");
      await rollbackRelease(ctx, { releaseId, reason: String(request.payload["reason"] ?? "Approved agent rollback") });
    } else if (request.action === "rollout.update") {
      requirePermission(ctx, "rollout.update");
      await setRolloutPercentage(ctx, { releaseId, percentage: Number(request.payload["percentage"] ?? 0) });
    } else {
      fail("INVALID_INPUT", "That agent action is not supported.");
    }

    await ctx.db
      .from("approval_requests")
      .update({ status: "approved", approved_by: context.userId, approved_at: new Date().toISOString() })
      .eq("id", data.id);
    await audit(ctx, { action: "agent.approval_approved", resourceType: "approval_request", resourceId: data.id, after: request.payload });
    await notify(ctx, { title: "Agent action approved", body: request.action, tone: "info" });
    return { id: data.id, decision: "approve" as const };
  });

/** Grounded question answering over the organization's own release data. */
export const askAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { question: string }) => z.object({ question: z.string().min(3).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    requirePermission(ctx, "agent.read");

    const [{ data: releases }, { data: rollouts }, { data: channels }] = await Promise.all([
      ctx.db
        .from("releases")
        .select("id, number, version, status, platform, rollout_percentage, published_at, app_id")
        .eq("organization_id", ctx.organizationId)
        .order("number", { ascending: false })
        .limit(20),
      ctx.db.from("rollouts").select("release_id, current_percentage, status").eq("organization_id", ctx.organizationId),
      ctx.db.from("channels").select("id, name, active_release_id").eq("organization_id", ctx.organizationId),
    ]);

    const live = (releases ?? []).filter((r) => r.status === "published");
    const answerLines = live.length
      ? live.slice(0, 4).map((r) => {
          const channel = (channels ?? []).find((c) => c.active_release_id === r.id)?.name ?? "unassigned";
          const rollout = (rollouts ?? []).find((x) => x.release_id === r.id);
          return `#${r.number} (${r.version}, ${r.platform}) is live on ${channel} at ${rollout?.current_percentage ?? r.rollout_percentage}%.`;
        })
      : ["No release is currently published in this organization."];

    return {
      question: data.question,
      answer: answerLines.join(" "),
      sources: live.slice(0, 4).map((r) => `release ${r.id}`),
    };
  });
