import { cn } from "@/lib/utils";

/** FireOTA mark (update ring + deploy arrow). Pair with the "FireOTA" wordmark where space allows. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo-mark.svg"
      alt=""
      aria-hidden
      width={20}
      height={20}
      className={cn("size-5 shrink-0 object-contain", className)}
    />
  );
}
