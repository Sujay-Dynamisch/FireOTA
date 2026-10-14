import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Risk copy shown in a banner — always say what will actually happen. */
  warning?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** When set, the user must type this exact word to enable the confirm button. */
  requireTyped?: string;
  /** When true, a reason is mandatory (rollbacks). */
  requireReason?: boolean;
  details?: { label: string; value: ReactNode }[];
  onConfirm: (payload: { reason?: string | undefined }) => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  warning,
  confirmLabel,
  destructive,
  requireTyped,
  requireReason,
  details,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const blocked = (requireTyped ? typed !== requireTyped : false) || (requireReason ? reason.trim().length < 4 : false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTyped("");
          setReason("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[16px]">{title}</DialogTitle>
          <DialogDescription className="text-[12px]">{description}</DialogDescription>
        </DialogHeader>

        {details ? (
          <dl className="grid grid-cols-2 gap-y-2 rounded-md border border-border bg-surface-2/40 p-3">
            {details.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{item.label}</dt>
                <dd className="truncate text-[12px]">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {warning ? (
          <p
            className={
              destructive
                ? "rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger"
                : "rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning"
            }
          >
            {warning}
          </p>
        ) : null}

        {requireReason ? (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason" className="text-[12px]">
              Reason (required)
            </Label>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Elevated JS exception rate on iOS 26"
              className="min-h-16 text-[12px]"
            />
          </div>
        ) : null}

        {requireTyped ? (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-typed" className="text-[12px]">
              Type <span className="font-mono text-danger">{requireTyped}</span> to confirm
            </Label>
            <Input
              id="confirm-typed"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="h-8 font-mono text-[12px]"
              autoComplete="off"
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={destructive ? "destructive" : "default"}
            disabled={blocked || pending}
            onClick={async () => {
              setPending(true);
              try {
                await onConfirm({ reason: reason || undefined });
                onOpenChange(false);
                setTyped("");
                setReason("");
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Trigger-driven variant for inline use in pages. Owns its own open state so a
 * page can drop a guarded action next to the control that starts it.
 */
export function ConfirmAction({
  trigger,
  ...props
}: Omit<ConfirmDialogProps, "open" | "onOpenChange"> & { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <ConfirmDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}
