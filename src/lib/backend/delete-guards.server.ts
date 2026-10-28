/**
 * Shared checks for destructive actions. Something that devices still depend on (a live OTA
 * update) must be archived before the app, Firebase project, workspace or account that owns it
 * can be removed, the same rule as deleting a single release.
 */
import type { OrgContext } from "./context.server";

/** Release statuses that devices can still be served or are mid-rollout. */
export const LIVE_STATUSES = ["published", "paused"];

export interface LiveRelease {
  id: string;
  number: number;
  status: string;
  appName: string;
}

/** Live releases in the workspace, optionally limited to some apps. */
export async function liveReleases(ctx: OrgContext, appIds?: string[]): Promise<LiveRelease[]> {
  if (appIds && appIds.length === 0) return [];
  let query = ctx.db
    .from("releases")
    .select("id, number, status, app_id")
    .eq("organization_id", ctx.organizationId)
    .in("status", LIVE_STATUSES)
    .order("number", { ascending: true })
    .limit(50);
  if (appIds) query = query.in("app_id", appIds);
  const { data: releases } = await query;
  if (!releases || releases.length === 0) return [];

  const ids = [...new Set(releases.map((r) => r.app_id as string))];
  const { data: apps } = await ctx.db.from("apps").select("id, name").in("id", ids);
  const names = new Map((apps ?? []).map((a) => [a.id as string, a.name as string]));
  return releases.map((r) => ({
    id: r.id as string,
    number: r.number as number,
    status: r.status as string,
    appName: names.get(r.app_id as string) ?? "",
  }));
}

/** "A, B, C and 2 more": keeps messages short (friendlyError hides anything over 220 chars). */
export function shortList(items: string[], max = 3) {
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
}

/** "2 live updates (FireOTA test #2, #5)" style summary for error messages. */
export function describeLive(live: LiveRelease[]) {
  return `${live.length} live update${live.length === 1 ? "" : "s"} (${shortList(live.map((r) => `${r.appName} #${r.number}`))})`;
}
