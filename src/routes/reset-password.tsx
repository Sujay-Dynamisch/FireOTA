import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — FireOTA" },
      { name: "description", content: "Choose a new password for your FireOTA account." },
      { property: "og:title", content: "Set a new password — FireOTA" },
      { property: "og:description", content: "Choose a new password to finish resetting your FireOTA account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <AuthLayout>
      <h1 className="font-display text-[20px] font-bold tracking-tight">Set a new password</h1>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Choose a password you haven't used before. All other sessions will be signed out.
      </p>

      <form
        className="mt-6 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (mismatch) return;
          setPending(true);
          try {
            await authService.resetPassword(password);
            toast.success("Password updated. You can sign in now.");
            void navigate({ to: "/login" });
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[12px]">
            New password
          </Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-9 text-[12px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-[12px]">
            Confirm password
          </Label>
          <Input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="h-9 text-[12px]"
            aria-invalid={mismatch}
          />
          {mismatch ? <p className="text-[11px] text-danger">Passwords don't match.</p> : null}
        </div>
        <Button type="submit" className="h-9 w-full" disabled={mismatch} loading={pending}>
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
