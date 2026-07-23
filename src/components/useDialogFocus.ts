import { useEffect, type RefObject } from "react";

// Accessibility for modal dialogs (TICKET-018): trap Tab focus within the
// dialog while open, and restore focus to the previously-focused element on
// close.
export function useDialogFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      el
        ? Array.from(
            el.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((node) => node.offsetParent !== null)
        : [];

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const nodes = focusable();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [ref]);
}
