/** Accepts only same-site paths, so a crafted link can't send someone to another site after sign-in. */
export function safeRedirect(target: string | undefined, fallback: string) {
  return target && /^\/(?![/\\])/.test(target) ? target : fallback;
}
