import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Moves focus to the next (or previous, if reverse) focusable element
 * within the closest <form> ancestor. Useful for overriding native Tab
 * behavior on inputs with internal tab stops (date, combobox).
 */
export function focusNextInForm(
  current: HTMLElement,
  reverse: boolean,
): void {
  const form = current.closest("form");
  if (form == null) return;
  const focusables = Array.from(
    form.querySelectorAll<HTMLElement>(
      "input:not(:disabled):not([type=hidden]), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
    ),
  ).filter((el) => el.tabIndex !== -1 && el.getClientRects().length > 0);
  if (focusables.length === 0) return;
  const idx = focusables.indexOf(current);
  if (idx === -1) return;
  const nextIndex = reverse
    ? (idx - 1 + focusables.length) % focusables.length
    : (idx + 1) % focusables.length;
  const next = focusables[nextIndex];
  next?.focus();
}
