import { describe, expect, it } from "vitest";
import { cn } from "./utils";

// This app is on Tailwind 3. tailwind-merge 3 only understands Tailwind 4
// and merges some Tailwind 3 classes wrongly; keep tailwind-merge on 2.x
// until Tailwind itself moves to 4.
describe("cn (tailwind-merge for Tailwind 3)", () => {
  it("lets the later of two conflicting classes win", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
    expect(cn("bg-primary", false, "bg-destructive")).toBe("bg-destructive");
  });

  it("keeps Tailwind 3 opacity modifiers next to their colour", () => {
    // tailwind-merge 3 drops bg-red-500 here.
    expect(cn("bg-red-500 bg-opacity-50")).toBe("bg-red-500 bg-opacity-50");
  });

  it("treats a bare `outline` as conflicting with outline-none", () => {
    // tailwind-merge 3 keeps both.
    expect(cn("outline-none outline")).toBe("outline");
  });
});
