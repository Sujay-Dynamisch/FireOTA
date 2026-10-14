import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthLayout, GoogleButton } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your FireOTA account" },
      { name: "description", content: "Create a FireOTA account to manage React Native OTA releases in your own Firebase project." },
      { property: "og:title", content: "Create your FireOTA account" },
      { property: "og:description", content: "Free at the platform level. Your bundles stay in your Firebase project." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <AuthLayout>
      <h1 className="font-display text-[20px] font-bold tracking-tight">Create your account</h1>
      <p className="mt-1 text-[12px] text-muted-foreground">
        FireOTA is free at the platform level. You bring your own Firebase project and billing plan.
      </p>

      <div className="mt-6">
        <GoogleButton
          label="Continue with Google"
          onClick={async () => {
            // The browser leaves for Google here and comes back to /onboarding signed in.
            try {
              await authService.signInWithGoogle("/onboarding");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Google sign-in failed. Try again.");
            }
          }}
        />
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          try {
            await authService.signUp(name, email, password);
            toast.info("Check your inbox to verify your email address.");
            void navigate({ to: "/verify-email" });
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-[12px]">
            Name
          </Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-[12px]" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[12px]">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.dev"
            className="h-9 text-[12px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[12px]">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 text-[12px]"
          />
          <p className="font-mono text-[10px] text-faint">At least 8 characters.</p>
        </div>

        <label className="flex items-start gap-2 text-[12px] text-muted-foreground">
          <Checkbox
            id="terms"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
            className="mt-0.5"
          />
          I accept the terms of service and privacy policy.
        </label>

        <Button type="submit" className="h-9 w-full" disabled={!accepted || pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-5 text-[12px] text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-foreground underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
