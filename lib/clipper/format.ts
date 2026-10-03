const TIME_ZONE = "Asia/Seoul";

export function toSafeDate(value: Date | number | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateLabel(date: Date, style: "short" | "long" = "short"): string {
  if (style === "long") {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: TIME_ZONE,
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatTimeLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function dateKeyInTimeZone(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatBookingReference(reference: string | null | undefined): { label: string; isPending: boolean } {
  if (!reference) return { label: "Reference pending", isPending: true };
  return { label: reference, isPending: false };
}
