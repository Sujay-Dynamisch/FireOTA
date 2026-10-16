/**
 * Team invitations through Supabase Auth.
 *
 * - New people get Supabase's "Invite user" email; existing accounts get an in-app
 *   notification (Supabase cannot email an existing user an invite).
 * - Supabase's built-in mailer only delivers to the Supabase organization's own team
 *   addresses and a few emails per hour, so a copyable invite link is always returned
 *   as a fallback; configure custom SMTP in Supabase for real delivery.
 * - When the invited email signs in (verified), the pending invite is accepted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface InviteDelivery {
  emailSent: boolean;
  link: string | null;
  existingAccount: boolean;
  problem: string | null;
}

export async function deliverInvite(
  db: SupabaseClient,
  input: { email: string; redirectTo: string; organizationId: string; organizationName: string; inviterLabel: string },
): Promise<InviteDelivery> {
  const meta = { invited_to: input.organizationName };
  const sent = await db.auth.admin.inviteUserByEmail(input.email, { redirectTo: input.redirectTo, data: meta });
  if (!sent.error) {
    // No second link here: generating one would replace the token inside the emailed link.
    return { emailSent: true, link: null, existingAccount: false, problem: null };
  }

  const message = sent.error.message ?? "";
  const existing = /already (been )?registered|already exists/i.test(message);
  if (existing) {
    // Existing account: tell them in the app, and give the admin a sign-in link to share.
    const { data: users } = await db.from("profiles").select("id").eq("email", input.email).limit(1);
    const userId = users?.[0]?.id as string | undefined;
    if (userId) {
      await db.from("notifications").insert({
        organization_id: input.organizationId,
        user_id: userId,
        title: `You were invited to ${input.organizationName}`,
        body: `${input.inviterLabel} invited you. Sign out and back in to join.`,
        tone: "info",
        kind: "team",
      });
    }
    const link = await db.auth.admin.generateLink({ type: "magiclink", email: input.email, options: { redirectTo: input.redirectTo } });
    return {
      emailSent: false,
      link: link.data?.properties?.action_link ?? null,
      existingAccount: true,
      problem: "This person already has a FireOTA account; Supabase cannot email them an invite. Share the sign-in link.",
    };
  }

  // Typically the built-in mailer refusing the address or its hourly limit.
  const link = await db.auth.admin.generateLink({ type: "invite", email: input.email, options: { redirectTo: input.redirectTo, data: meta } });
  return {
    emailSent: false,
    link: link.data?.properties?.action_link ?? null,
    existingAccount: false,
    problem: `The email could not be sent (${message || "unknown error"}). Share the invite link instead, or set up custom SMTP in Supabase → Authentication → Emails.`,
  };
}

/**
 * Accepts pending invitations for a signed-in user whose email is verified. Only runs when
 * the user has no active workspace yet (one workspace per account).
 */
export async function acceptPendingInvites(db: SupabaseClient, userId: string) {
  const { data: active } = await db
    .from("organization_members")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  if (active && active.length > 0) return;

  const { data: auth } = await db.auth.admin.getUserById(userId);
  const user = auth?.user;
  if (!user?.email) return;
  // Google sign-ins and invite/magic links are verified; password sign-ups after email confirmation.
  if (!user.email_confirmed_at) return;

  const { data: invites } = await db
    .from("organization_members")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .eq("status", "invited")
    .order("created_at", { ascending: true })
    .limit(1);
  const invite = invites?.[0];
  if (!invite) return;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  await db
    .from("organization_members")
    .update({
      user_id: userId,
      status: "active",
      name: String(meta["full_name"] ?? meta["name"] ?? user.email.split("@")[0] ?? ""),
      last_active_at: new Date().toISOString(),
    })
    .eq("id", invite.id)
    .eq("status", "invited");
}
