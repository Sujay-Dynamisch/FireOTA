import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Clock, Loader2, ShieldAlert, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AuthLayout } from "@/components/layout/auth-layout";
import { useAuthUser } from "@/hooks/use-auth-user";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
import { acceptInvitationFn, declineInvitationFn, getInvitationDetailsFn } from "@/lib/api/core.functions";

export const Route = createFileRoute("/invite/$token")({
  validateSearch: (search) =>
    z
      .object({
        action: z.enum(["accept", "decline"]).optional(),
      })
      .parse(search),
  head: () => ({
    meta: [
      { title: "Organization Invitation — FireOTA" },
      { name: "description", content: "Accept your invitation to join a FireOTA organization." },
    ],
  }),
  component: InviteAcceptancePage,
});

function InviteAcceptancePage() {
  const { token } = Route.useParams();
  const { action } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [declined, setDeclined] = useState(false);
  // This page is public: the session query would send a signed-out visitor to /login.
  const { user } = useAuthUser();

  const inviteQuery = useQuery({
    queryKey: ["invitation-details", token],
    queryFn: () => getInvitationDetailsFn({ data: { token } }),
    // Accepting or declining clears the token, so a refetch would turn the result into "invalid link".
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvitationFn({ data: { token } }),
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      toast.success(`Welcome to ${data.organizationName ?? "the organization"}!`);
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => {
      toast.error(friendlyError(err, "Could not accept invitation."));
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => declineInvitationFn({ data: { token } }),
    onSuccess: () => {
      setDeclined(true);
      toast.info("Invitation declined.");
    },
    onError: (err) => {
      toast.error(friendlyError(err, "Could not decline invitation."));
    },
  });

  if (inviteQuery.isLoading) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="size-8 animate-spin text-brand" />
          <p className="mt-4 text-[13px] text-muted-foreground">Verifying invitation details…</p>
        </div>
      </AuthLayout>
    );
  }

  const details = inviteQuery.data;

  // Invalid or expired cases
  if (!details || details.status !== "valid") {
    const isExpired = details?.status === "expired";
    const isAlreadyAccepted = details?.status === "already_accepted";

    return (
      <AuthLayout>
        <div className="rounded-xl border border-border bg-surface-2/40 p-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-3">
            {isExpired ? (
              <Clock className="size-6 text-warning" />
            ) : isAlreadyAccepted ? (
              <CheckCircle2 className="size-6 text-brand" />
            ) : (
              <ShieldAlert className="size-6 text-danger" />
            )}
          </div>

          <h2 className="mt-4 font-display text-[18px] font-bold tracking-tight text-foreground">
            {isExpired
              ? "Invitation link expired"
              : isAlreadyAccepted
                ? "Invitation already accepted"
                : "Invalid invitation link"}
          </h2>

          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {details?.error ??
              "This invitation link does not exist, has expired after 7 days, or was already used."}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            {isAlreadyAccepted ? (
              <Button asChild className="w-full">
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Back to Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (declined) {
    return (
      <AuthLayout>
        <div className="rounded-xl border border-border bg-surface-2/40 p-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-3">
            <XCircle className="size-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 font-display text-[18px] font-bold tracking-tight text-foreground">
            Invitation declined
          </h2>
          <p className="mt-2 text-[13px] text-muted-foreground">
            You declined the invitation to join <strong>{details.organizationName}</strong>. If this was a mistake, ask your team
            administrator to resend the invite.
          </p>
          <div className="mt-6">
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Sign in to FireOTA</Link>
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  const roleLabel = details.roleLabel;
  const isSignedIn = Boolean(user);
  const signedInEmail = user?.email;
  // Opened from the email's decline link: a click must confirm it, because mail scanners follow links.
  const confirmingDecline = action === "decline";
  const isTargetAccount = !signedInEmail || signedInEmail.toLowerCase() === details.email.toLowerCase();

  return (
    <AuthLayout>
      <div className="rounded-xl border border-border bg-surface-2/40 p-6">
        <div className="flex items-center gap-2 text-brand">
          <Users className="size-5" />
          <span className="font-mono text-[11px] uppercase tracking-wider font-semibold">Team Invitation</span>
        </div>

        <h1 className="mt-3 font-display text-[22px] font-bold tracking-tight text-foreground">
          Join {details.organizationName}
        </h1>

        <p className="mt-2 text-[13px] text-muted-foreground">
          <strong className="text-foreground">{details.inviterLabel}</strong> has invited you to join their organization as a{" "}
          <span className="rounded bg-brand/10 px-1.5 py-0.5 font-medium text-brand">{roleLabel}</span>.
        </p>

        <div className="mt-5 space-y-2 rounded-lg border border-border/80 bg-background/50 p-3.5 text-[12px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Workspace:</span>
            <span className="font-semibold text-foreground">{details.organizationName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Assigned Role:</span>
            <span className="font-semibold text-foreground">{roleLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invited Email:</span>
            <span className="font-mono text-muted-foreground">{details.email}</span>
          </div>
        </div>

        {isSignedIn && !isTargetAccount ? (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[12px] text-warning">
            You are currently signed in as <strong>{signedInEmail}</strong>, but this invitation was sent to{" "}
            <strong>{details.email}</strong>. Sign in with that address to accept it.
          </div>
        ) : null}

        {confirmingDecline ? (
          <div className="mt-4 rounded-lg border border-border bg-surface-3/50 p-3 text-[12px] text-muted-foreground">
            Confirm below to decline this invitation. You can still accept it instead.
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2.5">
          {isSignedIn ? (
            <Button
              size="lg"
              className="w-full bg-gradient-to-r from-[#FF5722] to-[#FF9800] text-white font-semibold hover:opacity-95"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending || declineMutation.isPending || !isTargetAccount}
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Accepting…
                </>
              ) : (
                "Accept Invitation"
              )}
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Button asChild size="lg" className="w-full bg-gradient-to-r from-[#FF5722] to-[#FF9800] text-white font-semibold">
                <Link to="/login" search={{ redirectTo: `/invite/${token}` }}>
                  Sign in to Accept
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/signup" search={{ email: details.email, redirectTo: `/invite/${token}` }}>
                  Create account to Accept
                </Link>
              </Button>
            </div>
          )}

          <Button
            variant={confirmingDecline ? "outline" : "ghost"}
            size="sm"
            className="text-muted-foreground hover:text-danger"
            onClick={() => declineMutation.mutate()}
            disabled={acceptMutation.isPending || declineMutation.isPending}
          >
            {declineMutation.isPending ? "Declining…" : "Decline invitation"}
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}

