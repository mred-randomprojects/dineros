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
  ).filter((el) => el.tabIndex !== -1);
  const idx = focusables.indexOf(current);
  if (idx === -1) return;
  const next = reverse ? focusables[idx - 1] : focusables[idx + 1];
  next?.focus();
}
