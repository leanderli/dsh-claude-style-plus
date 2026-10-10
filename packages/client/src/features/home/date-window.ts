/** Inclusive calendar-date window shared by Home and Profile usage views. */
export function homeDateInRange(date: string, start: string | null, end: string) {
  return (start === null || date >= start) && date <= end
}

/** Inclusive millisecond window; `end` is the final millisecond of the local day. */
export function homeTimestampInRange(at: number, start: number | null, end: number) {
  return Number.isFinite(at) && (start === null || at >= start) && at <= end
}
