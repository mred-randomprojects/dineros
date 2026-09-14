/**
 * Submit the form around `target`, if there is one.
 *
 * What ⌘S means inside a dialog: the transaction being typed is the state
 * worth saving, and "Saved" over an unsubmitted form would be a lie.
 */
export function submitClosestForm(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const form = target.closest("form");
  if (!(form instanceof HTMLFormElement)) {
    return false;
  }

  form.requestSubmit();
  return true;
}
