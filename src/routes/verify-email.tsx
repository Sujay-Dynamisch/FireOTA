import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { authService } from "@/services";

export const Route = createFileRoute("/verify-email")({
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
  const [pending, setPending] = useState(false);

  return (
    <AuthLayout>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Step 1 of 2</p>
      <h1 className="mt-3 font-display text-[20px] font-bold tracking-tight">Verify your email</h1>
      <p className="mt-1 text-[12px] text-muted-foreground">
        We sent a confirmation link to your inbox. Open it to continue to onboarding. The link expires in 24 hours.
      </p>

      <div className="mt-6 space-y-2">
        <Button asChild className="h-9 w-full">
          <Link to="/onboarding">I've verified — continue</Link>
        </Button>
        <Button
          variant="outline"
          className="h-9 w-full"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              await authService.resendVerification();
              toast.success("Verification email sent again.");
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? "Sending…" : "Resend email"}
        </Button>
      </div>
    </AuthLayout>
  );
}
