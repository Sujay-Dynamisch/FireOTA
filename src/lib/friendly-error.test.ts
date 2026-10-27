import { describe, expect, it } from "vitest";

import { friendlyError } from "./friendly-error";

describe("friendlyError", () => {
  it("turns a validation dump into plain English", () => {
    const raw = JSON.stringify([
      {
        origin: "string",
        code: "too_small",
        minimum: 3,
        inclusive: true,
        path: ["firebaseProjectId"],
        message: "Too small: expected string to have >=3 characters",
      },
    ]);
    expect(friendlyError(new Error(raw))).toBe("Please enter a valid Firebase project.");
  });

  it("explains network failures", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/internet connection/);
  });

  it("hides technical messages behind the fallback", () => {
    expect(friendlyError(new Error("TypeError: Cannot read properties of undefined"), "Could not save.")).toBe(
      "Could not save.",
    );
  });

  it("keeps readable messages from the server", () => {
    expect(friendlyError(new Error("You need admin access to do this."))).toBe("You need admin access to do this.");
  });
});
