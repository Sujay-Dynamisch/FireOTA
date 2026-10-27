import { friendlyError } from "@/lib/friendly-error";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthLayout, GoogleButton } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — FireOTA" },
      { name: "description", content: "Sign in to FireOTA to manage React Native OTA releases in your Firebase project." },
      { property: "og:title", content: "Sign in — FireOTA" },
      { property: "og:description", content: "Manage OTA releases, channels and rollouts from one place." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuthUser();
  // Already signed in: there is nothing to do here.
  useEffect(() => {
    if (user) void navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await authService.signIn(email, password);
      toast.success("Signed in to FireOTA.");
      void navigate({ to: "/dashboard" });
    } catch {
      setError("We couldn't sign you in. Check your email and password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[20px] font-bold tracking-tight">Sign in to FireOTA</h1>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Connect your Firebase project and manage OTA releases from one place.
      </p>

      <div className="mt-6">
        <GoogleButton
          label="Continue with Google"
          onClick={async () => {
            // The browser leaves for Google here and comes back to /dashboard signed in.
            try {
              await authService.signInWithGoogle("/dashboard");
            } catch (error) {
              toast.error(friendlyError(error, "Google sign-in failed. Try again."));
            }
          }}
        />
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-3">
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
            placeholder="you@company.dev"
            className="h-9 text-[12px]"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[12px]">
              Password
            </Label>
            <Link to="/forgot-password" className="font-mono text-[10px] text-muted-foreground hover:text-foreground">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-9 text-[12px]"
          />
        </div>

        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Checkbox id="remember" />
          Remember me
        </label>

        {error ? (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="h-9 w-full" loading={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-5 text-[12px] text-muted-foreground">
        New to FireOTA?{" "}
        <Link to="/signup" className="text-foreground underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
