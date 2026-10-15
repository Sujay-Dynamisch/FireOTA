import { Play } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export const PRODUCT_VIDEO_ID = "W4v06Y3kYiw";

/**
 * Lightweight YouTube embed: shows the thumbnail and only loads the player (from the
 * privacy-enhanced youtube-nocookie.com domain) when the visitor presses play.
 */
export function ProductVideo({
  videoId = PRODUCT_VIDEO_ID,
  title = "FireOTA product walkthrough",
  poster = "/media/fireota-demo-poster.jpg",
  className,
}: {
  videoId?: string;
  title?: string;
  /** Served from our own domain, so nothing loads from YouTube until play is pressed. */
  poster?: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div
      className={cn(
        "group relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black shadow-[0_30px_80px_-20px_rgba(255,90,31,0.35)]",
        className,
      )}
    >
      {playing ? (
        <iframe
          className="absolute inset-0 size-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play video: ${title}`}
          className="absolute inset-0 size-full cursor-pointer"
        >
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <span className="absolute inset-x-0 bottom-0 flex items-center gap-4 p-4 text-left sm:p-5">
            <span className="relative grid size-14 shrink-0 place-items-center rounded-full bg-brand text-white shadow-[0_10px_40px_rgba(255,90,31,0.6)] transition-transform duration-300 group-hover:scale-110 sm:size-16">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand/40" />
              <Play aria-hidden className="relative ml-1 size-6 fill-current sm:size-7" />
            </span>
            <span>
              <span className="block font-mono text-[11px] uppercase tracking-[0.16em] text-[#FFB21E]">Watch the demo · 4 min</span>
              <span className="mt-1 block font-display text-[16px] font-semibold text-white sm:text-[18px]">{title}</span>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
