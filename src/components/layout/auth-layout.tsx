import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/fireota/brand-mark";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Value proposition */}
      <div className="hidden flex-col justify-between border-r border-border bg-surface/40 p-10 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="font-display text-[18px] font-bold tracking-tight">FireOTA</span>
        </Link>

        <div className="max-w-md">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">
            Ship React Native updates without owning the infrastructure.
          </h1>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Connect your Firebase project and manage OTA releases from one place.
          </p>

          <dl className="mt-8 space-y-3 border-t border-border pt-6">
            {[
              ["Your storage", "Bundles, assets and manifests stay inside your own Firebase project."],
              ["Your billing", "FireOTA is free at the platform level. You keep your Firebase plan."],
              ["Full control", "Channels, staged rollouts, instant rollback and a complete audit trail."],
            ].map(([label, copy]) => (
              <div key={label} className="flex gap-3">
                <dt className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{label}</dt>
                <dd className="text-[12px] text-muted-foreground">{copy}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="font-mono text-[10px] text-faint">
          React Native OTA · Firebase Storage + Firestore · no vendor lock-in
        </p>
      </div>

      {/* Auth card */}
      <div className="flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <BrandMark />
            <span className="font-display text-[18px] font-bold tracking-tight">FireOTA</span>
          </Link>
          {children}
          <p className="mt-8 font-mono text-[10px] text-faint">
            By continuing you accept the{" "}
            <Link to="/terms" className="underline underline-offset-2 hover:text-muted-foreground">
              terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline underline-offset-2 hover:text-muted-foreground">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

/** Official multicolor Google "G" mark, per Google's sign-in branding guidelines. */
function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-4 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-2/50 text-[12px] font-medium transition-colors duration-150 hover:bg-surface-2"
    >
      <GoogleLogo />
      {label}
    </button>
  );
}
