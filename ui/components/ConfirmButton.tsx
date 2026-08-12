import { useEffect, useRef, useState } from "react";

/**
 * A destructive action that asks once, in place.
 *
 * The app had forty-five delete affordances and not one of them confirmed
 * anything — a mis-tap permanently removed a pitch, a meal, an arm screen or a
 * kinematics capture, and the only undo anywhere was for skipping a task.
 *
 * Not `window.confirm`: it blocks the page, cannot be styled to match, reads
 * as a browser warning rather than part of the app, and on iOS can be
 * suppressed entirely. Not a modal either — a modal for deleting one row of a
 * table is heavier than the action it guards.
 *
 * Instead the button arms itself. One tap turns "Remove" into "Remove?" beside
 * a "Cancel", and only the second tap acts. Two deliberate details:
 *
 *   - It disarms itself after a few seconds. A row left permanently armed is a
 *     trap for the next tap, which is the failure this is meant to prevent.
 *   - The armed state is announced, so the guard exists for a screen reader
 *     too rather than being a purely visual pause.
 */

export interface ConfirmButtonProps {
  /** Resting label, e.g. "Remove". */
  label: string;
  /** Armed label. Defaults to the resting label with a question mark. */
  confirmLabel?: string;
  /** Describes exactly what will go, for the accessible name. */
  describe: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}

/** How long an armed button stays armed. */
export const DISARM_MS = 4000;

export function ConfirmButton({
  label,
  confirmLabel,
  describe,
  onConfirm,
  className = "text-button danger-text",
  disabled,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), DISARM_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed]);

  if (!armed) {
    return (
      <button
        className={className}
        type="button"
        aria-label={`${label} ${describe}`}
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="confirm-row">
      <button
        className={className}
        type="button"
        aria-label={`Confirm: ${label.toLowerCase()} ${describe}. This cannot be undone.`}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel ?? `${label}?`}
      </button>
      <button
        className="text-button"
        type="button"
        aria-label={`Keep ${describe}`}
        onClick={() => setArmed(false)}
      >
        Cancel
      </button>
    </span>
  );
}
