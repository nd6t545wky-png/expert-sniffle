/**
 * Date wording, matching the prototype's `formatDate`.
 *
 * The original never showed a bare ISO string to the athlete — every date in
 * the interface reads "Monday, 10 August". Brisbane is fixed here for the same
 * reason it is fixed everywhere else in the app: it is the single source of
 * what "today" means, and a device in another timezone must not shift it.
 */

const TIME_ZONE = "Australia/Brisbane";

export function formatIsoDate(
  iso: string,
  options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    return new Intl.DateTimeFormat("en-AU", { timeZone: TIME_ZONE, ...options }).format(
      new Date(`${iso}T00:00:00+10:00`)
    );
  } catch {
    // An unparseable date is shown as-is rather than swallowed.
    return iso;
  }
}
