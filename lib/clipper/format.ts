// Clipper operates in Seoul. Groomer schedules, slots and displayed times are all KST,
// regardless of the server (UTC) or browser time zone, so SSR and hydration agree.
const TIME_ZONE = "Asia/Seoul";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatMoney(cents: number): string {
  return `₩${cents.toLocaleString("ko-KR")}`;
}

const DATE_STYLES = {
  short: { weekday: "short", month: "short", day: "numeric" },
  long: { weekday: "long", month: "long", day: "numeric" },
  full: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export function formatKstDate(
  value: DateInput,
  style: keyof typeof DATE_STYLES = "short",
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...DATE_STYLES[style],
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

export function formatKstTime(value: DateInput): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

// YYYY-MM-DD of the KST calendar day.
export function kstDateKey(value: DateInput): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(
    toDate(value),
  );
}

export function kstParts(date: Date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    minutesOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

// The instant for the given KST wall-clock time (month is 0-based; day may overflow).
export function fromKst(
  year: number,
  month: number,
  day: number,
  minutesOfDay = 0,
): Date {
  return new Date(
    Date.UTC(year, month, day, 0, minutesOfDay) - KST_OFFSET_MS,
  );
}

export function parseTimeOfDay(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
