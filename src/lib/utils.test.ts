import { describe, expect, it } from "vitest";

import { initials } from "./utils";

describe("initials", () => {
  it.each([
    ["Sujay Khedekar", "SK"],
    ["sujay khedekar", "SK"],
    ["Sujay", "S"],
    ["Sujay Ram Khedekar", "SK"],
    ["  Sujay   Khedekar ", "SK"],
    ["Élodie Şahin", "ÉŞ"],
  ])("%s becomes %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it("falls back to the name part of the email", () => {
    expect(initials("", "sujay.khedekar@example.com")).toBe("SK");
    expect(initials(null, "sujay_khedekar@example.com")).toBe("SK");
    expect(initials(undefined, "sujay@example.com")).toBe("S");
  });

  it("shows a placeholder when there is nothing to use", () => {
    expect(initials("", "")).toBe("?");
    expect(initials(null)).toBe("?");
  });
});
