/** Release state machine. The only place transitions are decided. */
import { fail } from "./errors";

export type ReleaseState =
  | "draft"
  | "uploading"
  | "processing"
  | "ready"
  | "published"
  | "paused"
  | "rolled_back"
  | "archived"
  | "failed"
  | "deleted";

const TRANSITIONS: Record<ReleaseState, ReleaseState[]> = {
  draft: ["uploading", "failed", "deleted"],
  uploading: ["processing", "failed", "deleted"],
  processing: ["ready", "failed"],
  ready: ["published", "archived", "failed", "deleted"],
  published: ["paused", "rolled_back", "archived"],
  paused: ["published", "rolled_back", "archived"],
  rolled_back: ["archived", "published"],
  archived: ["deleted"],
  failed: ["uploading", "deleted"],
  deleted: [],
};

export function canTransition(from: ReleaseState, to: ReleaseState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: ReleaseState, to: ReleaseState) {
  if (!canTransition(from, to)) {
    fail("INVALID_STATE_TRANSITION", `A release cannot move from ${from} to ${to}.`);
  }
}

/** States that an OTA check may serve to devices. */
export function isServable(state: ReleaseState): boolean {
  return state === "published";
}
