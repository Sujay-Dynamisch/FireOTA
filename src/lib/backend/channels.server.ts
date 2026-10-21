import { audit, ownedRow, requirePermission, type OrgContext } from "./context.server";
import { fail } from "./errors";
import { dispatchWebhooks } from "./webhooks.server";

export type ChannelEnvironment = "production" | "beta" | "staging" | "development";

/** Creates an empty channel on an application. Shared by the dashboard and agents. */
export async function createChannel(
  ctx: OrgContext,
  input: {
    appId: string;
    name: string;
    environment: ChannelEnvironment;
    description?: string | undefined;
    platform?: "all" | "android" | "ios" | undefined;
    updatePolicy?: "immediate" | "staged" | undefined;
  },
) {
  requirePermission(ctx, "channel.create");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.name) || input.name.length > 40) {
    fail("INVALID_INPUT", "Channel names use lowercase letters, digits and dashes.");
  }
  const app = await ownedRow<{ name: string }>(ctx, "apps", input.appId, "name");
  const { data: row, error } = await ctx.db
    .from("channels")
    .insert({
      organization_id: ctx.organizationId,
      app_id: input.appId,
      name: input.name,
      environment: input.environment,
      description: input.description ?? "",
      platform: input.platform ?? "all",
      rollout_percentage: 100,
      status: "empty",
      update_policy:
        input.updatePolicy ?? (input.environment === "production" ? "staged" : "immediate"),
    })
    .select("id")
    .single();
  if (error) fail("CONFLICT", "This application already has a channel with that name.");
  await audit(ctx, {
    action: "channel.created",
    resourceType: "channel",
    resourceId: row.id as string,
    appId: input.appId,
    appName: app.name,
    after: { name: input.name, environment: input.environment },
  });
  await dispatchWebhooks(ctx.db, ctx.organizationId, "channel.created", {
    channelId: row.id,
    appId: input.appId,
    name: input.name,
  });
  return { id: row.id as string, name: input.name, environment: input.environment };
}
