import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your FireOTA password" },
      { name: "description", content: "Request a password reset link for your FireOTA account." },
      { property: "og:title", content: "Reset your FireOTA password" },
      { property: "og:description", content: "We'll email you a link to set a new password." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <AuthLayout>
      <h1 className="font-display text-[20px] font-bold tracking-tight">Forgot your password?</h1>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Enter your email and we'll send a link to set a new one.
      </p>

      {sent ? (
        <div className="mt-6 rounded-md border border-success/30 bg-success/10 px-3 py-3 text-[12px] text-success">
          Reset link sent to {email}. The link expires in 30 minutes.
        </div>
      ) : (
        <form
          className="mt-6 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            try {
              await authService.requestPasswordReset(email);
              setSent(true);
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[12px]">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-9 text-[12px]"
            />
          </div>
          <Button type="submit" className="h-9 w-full" loading={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}

      <p className="mt-5 text-[12px] text-muted-foreground">
        <Link to="/login" className="text-foreground underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
