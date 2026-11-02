import { CheckCircle2, Clock, Link2, Send, ShieldCheck, TriangleAlert } from "lucide-react";

import { CopyButton } from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface InviteDelivery {
  email: string;
  emailSent: boolean;
  link: string;
  expiresAt: string;
  problem: string | null;
}

/** Confirms an invitation went out, or hands the inviter the link when the email could not be sent. */
export function InviteDeliveryDialog({ delivery, onClose }: { delivery: InviteDelivery | null; onClose: () => void }) {
  const sent = delivery?.emailSent ?? false;
  const expires = delivery
    ? new Date(delivery.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <Dialog open={delivery !== null} onOpenChange={(open) => !open && onClose()}>
      {/* minmax(0, 1fr) stops the long link from stretching the dialog's grid past its width. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[440px]">
        <div className="flex flex-col items-center px-7 pb-5 pt-8 text-center">
          <span
            className={cn(
              "flex size-14 items-center justify-center rounded-full ring-8 duration-300 animate-in zoom-in-50",
              sent ? "bg-success/15 text-success ring-success/5" : "bg-brand/15 text-brand ring-brand/5",
            )}
          >
            {sent ? <CheckCircle2 aria-hidden className="size-7" /> : <Send aria-hidden className="size-6" />}
          </span>
          <DialogTitle className="mt-5 font-display text-[19px] font-semibold tracking-tight">
            {sent ? "Invitation sent" : "Share this invitation"}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {sent ? "We emailed the invitation to" : "Send this private link to"}{" "}
            <span className="break-all font-medium text-foreground">{delivery?.email}</span>
          </DialogDescription>
        </div>

        <div className="space-y-3 px-7">
          {delivery?.problem ? (
            <div className="flex gap-2.5 rounded-lg border border-warning/25 bg-warning/10 p-3 text-left text-[12px] leading-relaxed text-warning">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>{delivery.problem}</span>
            </div>
          ) : null}

          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 py-1.5 pl-3 pr-1.5">
            <Link2 aria-hidden className="size-3.5 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={delivery?.link}>
              {delivery?.link}
            </span>
            {delivery ? <CopyButton value={delivery.link} label="Copy link" /> : null}
          </div>

          <ul className="space-y-1.5 pb-1 text-left text-[12px] text-muted-foreground">
            <li className="flex items-center gap-2">
              <Clock aria-hidden className="size-3.5 shrink-0 text-faint" />
              Expires on {expires}
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-faint" />
              Only this email address can accept it
            </li>
          </ul>
        </div>

        <div className="px-7 pb-7 pt-5">
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
