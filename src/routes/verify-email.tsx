import { friendlyError } from "@/lib/friendly-error";
import { Link, createFileRoute } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authService } from "@/services";

export const Route = createFileRoute("/verify-email")({
  // The sign-up page passes the address, because an unconfirmed account has no session to read it from.
  validateSearch: (search) => z.object({ email: z.string().max(320).optional() }).parse(search),
  head: () => ({
    meta: [
      { title: "Verify your email — FireOTA" },
      { name: "description", content: "Confirm your email address to finish creating your FireOTA workspace." },
      { property: "og:title", content: "Verify your email — FireOTA" },
      { property: "og:description", content: "Confirm your email address to continue to onboarding." },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { email: sentTo } = Route.useSearch();
  const [email, setEmail] = useState(sentTo ?? "");
  const [pending, setPending] = useState(false);

  return (
    <AuthLayout>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Step 1 of 2</p>
      <h1 className="mt-3 flex items-center gap-2 font-display text-[20px] font-bold tracking-tight">
        <MailCheck className="size-5 text-brand" aria-hidden /> Verify your email
      </h1>
      <p className="mt-1 text-[12px] text-muted-foreground">
        We sent a confirmation link to {sentTo ? <strong className="text-foreground">{sentTo}</strong> : "your inbox"}. Open it
        on this device to finish creating your account and continue to onboarding. Check your spam folder if you can't find it.
      </p>

      <div className="mt-6 space-y-2">
        {!sentTo ? (
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="The email you signed up with"
            aria-label="Email address"
            className="h-9 text-[12px]"
          />
        ) : null}
        <Button
          variant="outline"
          className="h-9 w-full"
          disabled={pending || !email}
          onClick={async () => {
            setPending(true);
            try {
              await authService.resendVerification(email);
              toast.success(`Verification email sent again to ${email}.`);
            } catch (error) {
              toast.error(friendlyError(error, "Could not resend the email. Wait a minute and try again."));
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? "Sending…" : "Resend email"}
        </Button>
        <Button asChild variant="ghost" className="h-9 w-full">
          <Link to="/login">Already confirmed? Sign in</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
