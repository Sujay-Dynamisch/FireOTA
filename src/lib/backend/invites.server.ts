/**
 * Team invitations and Organization Member management.
 *
 * Implements:
 * 1. Strict cross-organization membership validation (one organization per account).
 * 2. Secure crypto-random invitation tokens with defined expiration (7 days).
 * 3. EmailJS invitation email delivery with a direct link fallback for the inviter.
 * 4. Token validation, acceptance, decline, and expiration lifecycle.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

import { ApiError, fail } from "./errors";
import { ROLE_LABELS, type OrgRole } from "./rbac";
import { sendInvitationEmail } from "./email/mailer.server";

export interface InviteDelivery {
  emailSent: boolean;
  link: string;
  token: string;
  expiresAt: string;
  existingAccount: boolean;
  problem: string | null;
}

export const INVITATION_EXPIRY_DAYS = 7;

/** Membership states that tie an account to an organization. */
const ASSIGNED_STATUSES = ["active", "suspended"];

/** Only this hash is stored, so read access to the members table never exposes a usable link. */
export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newInvite() {
  return {
    token: randomBytes(32).toString("hex"),
    expiresAt: new Date(Date.now() + INVITATION_EXPIRY_DAYS * 86400_000).toISOString(),
  };
}

/**
 * Validates that an invited email or user is not already associated with another organization.
 * FireOTA enforces tenancy isolation: a user can belong to only one organization at a time.
 */
export async function assertUserCanBeInvited(
  db: SupabaseClient,
  organizationId: string,
  email: string,
  options: { resending?: boolean } = {},
): Promise<{ existingUserId: string | null }> {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check if email is already an active member in this organization
  const { data: currentOrgActive } = await db
    .from("organization_members")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("email", normalizedEmail)
    .eq("status", "active")
    .limit(1);

  if (currentOrgActive && currentOrgActive.length > 0) {
    fail("CONFLICT", "That person is already an active member of this organization.");
  }

  // 2. Check if email already has a pending invitation in this organization
  const { data: currentOrgPending } = await db
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", normalizedEmail)
    .eq("status", "invited")
    .limit(1);

  if (!options.resending && currentOrgPending && currentOrgPending.length > 0) {
    fail("CONFLICT", "An invitation is already pending for this email in this organization. You can resend it instead.");
  }

  // 3. Check if user profile already exists for this email
  const { data: profiles } = await db
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .limit(1);

  const existingUserId = profiles?.[0]?.id ?? null;

  // 4. Check if the user is already assigned to ANOTHER organization (a suspended member is still assigned),
  // either by their registered email or by their user_id
  let crossOrgQuery = db
    .from("organization_members")
    .select("id, organization_id, organizations(name)")
    .neq("organization_id", organizationId)
    .in("status", ASSIGNED_STATUSES);

  if (existingUserId) {
    crossOrgQuery = crossOrgQuery.or(`email.eq."${normalizedEmail}",user_id.eq.${existingUserId}`);
  } else {
    crossOrgQuery = crossOrgQuery.eq("email", normalizedEmail);
  }

  const { data: crossOrgMembers } = await crossOrgQuery.limit(1);

  if (crossOrgMembers && crossOrgMembers.length > 0) {
    fail(
      "CONFLICT",
      "This user is already assigned to another organization. FireOTA accounts can only belong to one organization at a time.",
    );
  }

  return { existingUserId };
}

/**
 * Creates and delivers a branded invitation email via EmailJS.
 */
export async function deliverInvite(
  db: SupabaseClient,
  input: {
    email: string;
    role: OrgRole;
    /** Custom role name, shown instead of the built-in role it maps to. */
    roleLabel?: string | undefined;
    organizationId: string;
    organizationName: string;
    inviterName: string;
    inviterEmail: string;
    appBaseUrl: string;
    token?: string;
    expiresAt?: string;
  },
): Promise<InviteDelivery> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const fresh = newInvite();
  const token = input.token ?? fresh.token;
  const expiresAt = input.expiresAt ?? fresh.expiresAt;
  const baseUrl = input.appBaseUrl.replace(/\/+$/, "");
  const acceptUrl = `${baseUrl}/invite/${token}`;
  const declineUrl = `${baseUrl}/invite/${token}?action=decline`;

  // Format expiration for display
  const expiresAtFormatted = new Date(expiresAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const roleLabel = input.roleLabel ?? ROLE_LABELS[input.role] ?? input.role;

  const emailResult = await sendInvitationEmail({
    recipientEmail: normalizedEmail,
    inviterName: input.inviterName,
    inviterEmail: input.inviterEmail,
    organizationName: input.organizationName,
    roleName: roleLabel,
    acceptUrl,
    declineUrl,
    expiresInDays: INVITATION_EXPIRY_DAYS,
    expiresAtFormatted,
    appBaseUrl: baseUrl,
  });

  const { data: profiles } = await db.from("profiles").select("id").eq("email", normalizedEmail).limit(1);
  const emailSent = emailResult.deliveredVia === "emailjs";

  return {
    emailSent,
    link: acceptUrl,
    token,
    expiresAt,
    existingAccount: Boolean(profiles?.[0]?.id),
    problem: emailSent
      ? null
      : emailResult.deliveredVia === "simulation"
        ? "Email isn't configured on this server (the EMAILJS_ settings are missing), so share this link yourself."
        : "The email could not be sent. Share this link yourself or try again.",
  };
}

export type InvitationVerificationResult =
  | {
      status: "valid";
      memberId: string;
      email: string;
      role: OrgRole;
      roleLabel: string;
      organizationId: string;
      organizationName: string;
      inviterLabel: string;
      expiresAt: string;
    }
  | {
      status: "expired" | "not_found" | "already_accepted" | "declined";
      error: string;
    };

/**
 * Validates an invitation token for public consumption on the acceptance screen.
 */
export async function verifyInvitationToken(db: SupabaseClient, token: string): Promise<InvitationVerificationResult> {
  if (!token || token.length < 16) {
    return { status: "not_found", error: "Invalid or malformed invitation link." };
  }

  const { data: members, error } = await db
    .from("organization_members")
    .select("id, email, role, status, invite_expires_at, invited_by, organizations(id, name), custom_roles(name)")
    .eq("invite_token", hashInviteToken(token))
    .limit(1);

  if (error || !members || members.length === 0) {
    return { status: "not_found", error: "This invitation link was not found or has already been used." };
  }

  const member = members[0]!;
  if (member.status === "active") {
    return { status: "already_accepted", error: "This invitation has already been accepted." };
  }

  if (member.status === "declined") {
    return { status: "declined", error: "This invitation was previously declined." };
  }

  if (member.invite_expires_at) {
    const expiresTime = new Date(member.invite_expires_at).getTime();
    if (Date.now() > expiresTime) {
      return { status: "expired", error: "This invitation link has expired. Please ask your administrator to resend it." };
    }
  }

  // Look up inviter name if available
  let inviterLabel = "A team administrator";
  if (member.invited_by) {
    const { data: inviter } = await db.from("profiles").select("name, email").eq("id", member.invited_by).maybeSingle();
    if (inviter) {
      inviterLabel = inviter.name || inviter.email;
    }
  }

  const org = member.organizations as unknown as { id: string; name: string } | null;
  const customRole = member.custom_roles as unknown as { name: string } | null;

  return {
    status: "valid",
    memberId: member.id,
    email: member.email,
    role: member.role as OrgRole,
    roleLabel: customRole?.name ?? ROLE_LABELS[member.role as OrgRole] ?? member.role,
    organizationId: org?.id ?? "",
    organizationName: org?.name ?? "FireOTA Workspace",
    inviterLabel,
    expiresAt: member.invite_expires_at ?? "",
  };
}

/**
 * Accepts an invitation.
 * Only the invited address may accept: the link alone is not enough, so a forwarded email cannot
 * add someone else. Confirms the user is not in another organization, then activates the member.
 */
export async function acceptInvitation(db: SupabaseClient, token: string, userId: string, userEmail: string) {
  const verification = await verifyInvitationToken(db, token);
  if (verification.status !== "valid") {
    fail("INVALID_INPUT", verification.error);
  }

  if (userEmail.trim().toLowerCase() !== verification.email.trim().toLowerCase()) {
    fail("AUTHORIZATION_ERROR", `This invitation was sent to ${verification.email}. Sign in with that address to accept it.`);
  }

  // Cross-org check: ensure this user does not belong to any other organization
  const { data: otherActive } = await db
    .from("organization_members")
    .select("id, organization_id")
    .eq("user_id", userId)
    .in("status", ASSIGNED_STATUSES)
    .limit(1);

  if (otherActive && otherActive.length > 0) {
    if (otherActive[0]!.organization_id === verification.organizationId) {
      return {
        success: true,
        alreadyMember: true,
        organizationId: verification.organizationId,
        organizationName: verification.organizationName,
      };
    }
    fail(
      "CONFLICT",
      "You are already an active member of another organization. You must leave your current organization before joining a new one.",
    );
  }

  const { data: profile } = await db.from("profiles").select("name").eq("id", userId).maybeSingle();
  const userName = profile?.name || userEmail.split("@")[0] || "Team Member";

  const { data: updated, error: updateError } = await db
    .from("organization_members")
    .update({
      user_id: userId,
      status: "active",
      name: userName,
      last_active_at: new Date().toISOString(),
      invite_token: null, // clear token after acceptance
    })
    .eq("id", verification.memberId)
    .eq("status", "invited")
    .select("id");

  if (updateError) {
    // Lost a race with another acceptance: the one-organization index refused the second one.
    if (updateError.code === "23505") {
      fail("CONFLICT", "You are already an active member of another organization.");
    }
    throw new ApiError("INTERNAL_ERROR", "Could not complete invitation acceptance.");
  }
  if (!updated || updated.length === 0) fail("CONFLICT", "This invitation is no longer available.");

  return {
    success: true,
    alreadyMember: false,
    organizationId: verification.organizationId,
    organizationName: verification.organizationName,
  };
}

/**
 * Declines an invitation and marks the status as declined.
 */
export async function declineInvitation(db: SupabaseClient, token: string) {
  const verification = await verifyInvitationToken(db, token);
  if (verification.status !== "valid") {
    fail("INVALID_INPUT", verification.error);
  }

  const { error } = await db
    .from("organization_members")
    .update({
      status: "declined",
      invite_token: null,
    })
    .eq("id", verification.memberId)
    .eq("status", "invited");
  if (error) throw new ApiError("INTERNAL_ERROR", "Could not decline the invitation.");

  return {
    success: true,
    memberId: verification.memberId,
    email: verification.email,
    organizationId: verification.organizationId,
  };
}

/**
 * Accepts invitations created before secure links existed (they have no token) for a signed-in
 * user whose email is verified. Invitations with a link wait for the recipient to accept or
 * decline, so they are never joined automatically. Only runs when the user has no workspace yet.
 */
export async function acceptPendingInvites(db: SupabaseClient, userId: string) {
  const { data: active } = await db
    .from("organization_members")
    .select("id")
    .eq("user_id", userId)
    .in("status", ASSIGNED_STATUSES)
    .limit(1);
  if (active && active.length > 0) return;

  const { data: auth } = await db.auth.admin.getUserById(userId);
  const user = auth?.user;
  if (!user?.email) return;
  if (!user.email_confirmed_at) return;

  const { data: invites } = await db
    .from("organization_members")
    .select("id")
    .eq("email", user.email.toLowerCase())
    .eq("status", "invited")
    .is("invite_token", null)
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
      invite_token: null,
    })
    .eq("id", invite.id)
    .eq("status", "invited");
}
