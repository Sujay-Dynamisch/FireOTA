/**
 * Saved agent chats. Each conversation belongs to one member of one organization and is only
 * ever read or written for that member, so chats stay private like in ChatGPT or Claude.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orgContextForUser } from "@/lib/backend/context.server";
import { fail } from "@/lib/backend/errors";

const MAX_MESSAGES = 400;
const MAX_BYTES = 1_500_000;

export interface ConversationSummary {
  id: string;
  title: string;
  agentId: string | null;
  updatedAt: string;
}

/** The caller's conversations, most recently active first. */
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationSummary[]> => {
    const ctx = await orgContextForUser(context.userId);
    const { data } = await ctx.db
      .from("agent_conversations")
      .select("id, title, agent_id, updated_at")
      .eq("organization_id", ctx.organizationId)
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      agentId: (row.agent_id as string | null) ?? null,
      updatedAt: row.updated_at as string,
    }));
  });

/** One conversation with its full thread. */
export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    const { data: row } = await ctx.db
      .from("agent_conversations")
      .select("id, title, agent_id, messages, updated_at")
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) fail("RESOURCE_NOT_FOUND", "This conversation no longer exists.");
    return {
      id: row.id as string,
      title: row.title as string,
      agentId: (row.agent_id as string | null) ?? null,
      // Sent as JSON text: the thread is free-form and the RPC layer only ships typed values.
      messagesJson: JSON.stringify(row.messages ?? []),
      updatedAt: row.updated_at as string,
    };
  });

/**
 * Creates or replaces a conversation. The browser picks the id, so saves that race before the
 * first one returns still land on the same row instead of creating duplicates.
 */
export const saveConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { id: string; title: string; agentId: string | null; messages: unknown[] }) =>
      z
        .object({
          id: z.string().uuid(),
          title: z.string().trim().min(1).max(120),
          agentId: z.string().uuid().nullable(),
          messages: z.array(z.unknown()).max(MAX_MESSAGES),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (JSON.stringify(data.messages).length > MAX_BYTES) {
      fail("INVALID_INPUT", "This conversation is too long to save. Start a new chat.");
    }
    const ctx = await orgContextForUser(context.userId);
    // Never take over a row that belongs to someone else.
    const { data: existing } = await ctx.db
      .from("agent_conversations")
      .select("organization_id, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (
      existing &&
      (existing.organization_id !== ctx.organizationId || existing.user_id !== context.userId)
    ) {
      fail("RESOURCE_NOT_FOUND", "This conversation no longer exists.");
    }
    const { error } = await ctx.db.from("agent_conversations").upsert({
      id: data.id,
      organization_id: ctx.organizationId,
      user_id: context.userId,
      agent_id: data.agentId,
      title: data.title,
      messages: data.messages,
      updated_at: new Date().toISOString(),
    });
    if (error) fail("INTERNAL_ERROR", "Could not save this conversation.");
    return { id: data.id };
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; title: string }) =>
    z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    await ctx.db
      .from("agent_conversations")
      .update({ title: data.title })
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await orgContextForUser(context.userId);
    await ctx.db
      .from("agent_conversations")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", ctx.organizationId)
      .eq("user_id", context.userId);
    return { ok: true };
  });
