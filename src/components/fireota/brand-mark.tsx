import { cn } from "@/lib/utils";

/** FireOTA flame mark. Pair with the "FireOTA" wordmark text where space allows. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden
      width={20}
      height={20}
      className={cn("size-5 shrink-0 object-contain", className)}
    />
  );
}
