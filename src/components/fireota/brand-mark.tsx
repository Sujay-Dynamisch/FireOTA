import { cn } from "@/lib/utils";

/** FireOTA mark (flame + device + update arrow). Pair with the "FireOTA" wordmark where space allows. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo-mark-96.png"
      alt=""
      aria-hidden
      width={32}
      height={32}
      className={cn("size-8 shrink-0 object-contain", className)}
    />
  );
}
