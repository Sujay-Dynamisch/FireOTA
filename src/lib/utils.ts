import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** First letter of the first name and of the surname, if there is one. Falls back to the email's name part. */
export function initials(name: string | null | undefined, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letter = (word: string | undefined) => Array.from(word ?? "")[0] ?? "";
  const surname = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return (letter(parts[0]) + letter(surname)).toUpperCase() || "?";
}
