import {
  and,
  desc,
  eq,
  gt,
  inArray,
  lt,
  ne,
} from "drizzle-orm";

import {
  appointments,
  groomerSchedules,
  groomerServiceAreas,
  groomers,
  groomingPackages,
} from "@/db/schema";

import { getDatabase } from "./db";
import type {
  AppointmentDetails,
  AvailableSlot,
  BookingOption,
  GroomingPackage,
} from "./types";

const DEFAULT_SLOT_DURATION_MS = 60 * 60 * 1000;

// groomerSchedules.startTime/endTime and .weekday are wall-clock values in
// Asia/Seoul (KST, fixed UTC+9, no DST). Shift into KST before reading
// calendar fields so day boundaries and the "09:00" style strings line up.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKstShifted(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

function fromKstShifted(shifted: Date): Date {
  return new Date(shifted.getTime() - KST_OFFSET_MS);
}

export async function getBookingOptions(): Promise<BookingOption> {
  const db = getDatabase();

  const packageRows = await db.select().from(groomingPackages);
  const neighborhoodRows = await db
    .select({ neighborhood: groomerServiceAreas.neighborhood })
    .from(groomerServiceAreas);

  const neighborhoods = [
    ...new Set(neighborhoodRows.map((row) => row.neighborhood)),
  ].sort();

  const availableSlots = await getUpcomingAvailableSlots(neighborhoods);

  return {
    packages: packageRows,
    neighborhoods,
    availableSlots,
  };
}

async function getUpcomingAvailableSlots(
  neighborhoods: string[],
): Promise<AvailableSlot[]> {
  if (neighborhoods.length === 0) return [];

  const db = getDatabase();
  const now = new Date();
  const kstNow = toKstShifted(now);
  const slotsByStart = new Map<string, AvailableSlot>();

  for (let dayOffset = 0; dayOffset < AVAILABILITY_WINDOW_DAYS; dayOffset++) {
    const kstDay = new Date(
      Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth(),
        kstNow.getUTCDate() + dayOffset,
      ),
    );
    const weekday = kstDay.getUTCDay();

    for (const neighborhood of neighborhoods) {
      const windows = await db
        .select({
          startTime: groomerSchedules.startTime,
          endTime: groomerSchedules.endTime,
        })
        .from(groomers)
        .innerJoin(
          groomerServiceAreas,
          eq(groomerServiceAreas.groomerId, groomers.id),
        )
        .innerJoin(
          groomerSchedules,
          and(
            eq(groomerSchedules.groomerId, groomers.id),
            eq(groomerSchedules.weekday, weekday),
          ),
        )
        .where(
          and(
            eq(groomers.active, true),
            eq(groomerServiceAreas.neighborhood, neighborhood),
            eq(groomerSchedules.available, true),
          ),
        );

      if (windows.length === 0) continue;

      const earliestStart = windows.reduce(
        (min, row) => (row.startTime < min ? row.startTime : min),
        windows[0].startTime,
      );
      const latestEnd = windows.reduce(
        (max, row) => (row.endTime > max ? row.endTime : max),
        windows[0].endTime,
      );

      const [startHour, startMinute] = earliestStart.split(":").map(Number);
      const [endHour, endMinute] = latestEnd.split(":").map(Number);

      let candidateKst = new Date(kstDay);
      candidateKst.setUTCHours(startHour, startMinute, 0, 0);
      const dayEndKst = new Date(kstDay);
      dayEndKst.setUTCHours(endHour, endMinute, 0, 0);

      while (
        candidateKst.getTime() + DEFAULT_SLOT_DURATION_MS <=
        dayEndKst.getTime()
      ) {
        const candidateStart = fromKstShifted(candidateKst);
        const key = candidateStart.toISOString();
        if (
          candidateStart.getTime() > now.getTime() &&
          !slotsByStart.has(key)
        ) {
          const candidateEnd = new Date(
            candidateStart.getTime() + DEFAULT_SLOT_DURATION_MS,
          );
          const groomerId = await findAvailableGroomer(
            neighborhood,
            candidateStart,
            candidateEnd,
          );
          if (groomerId) {
            slotsByStart.set(key, {
              id: `slot-${key}`,
              startsAt: key,
              endsAt: candidateEnd.toISOString(),
            });
          }
        }
        candidateKst = new Date(candidateKst.getTime() + SLOT_STEP_MS);
      }
    }
  }

  return [...slotsByStart.values()].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
}

export async function getAppointmentByReference(
  reference: string,
): Promise<AppointmentDetails | null> {
  const db = getDatabase();
  const rows = await db
    .select({
      appointment: appointments,
      groomer: groomers,
      groomingPackage: groomingPackages,
    })
    .from(appointments)
    .leftJoin(groomers, eq(appointments.groomerId, groomers.id))
    .innerJoin(
      groomingPackages,
      eq(appointments.packageId, groomingPackages.id),
    )
    .where(eq(appointments.bookingReference, reference))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ...row.appointment,
    reference: row.appointment.bookingReference,
    pet: { name: row.appointment.petName, breed: row.appointment.petBreed },
    groomer: row.groomer,
    package: row.groomingPackage,
    startsAt: row.appointment.startsAt.toISOString(),
    endsAt: row.appointment.endsAt.toISOString(),
    createdAt: row.appointment.createdAt.toISOString(),
    updatedAt: row.appointment.updatedAt.toISOString(),
  };
}

export async function getAppointments(): Promise<AppointmentDetails[]> {
  const db = getDatabase();
  const rows = await db
    .select({
      appointment: appointments,
      groomer: groomers,
      groomingPackage: groomingPackages,
    })
    .from(appointments)
    .leftJoin(groomers, eq(appointments.groomerId, groomers.id))
    .innerJoin(groomingPackages, eq(appointments.packageId, groomingPackages.id))
    .orderBy(desc(appointments.startsAt));

  return rows.map((row) => ({
    ...row.appointment,
    reference: row.appointment.bookingReference,
    pet: { name: row.appointment.petName, breed: row.appointment.petBreed },
    groomer: row.groomer,
    package: row.groomingPackage,
    startsAt: row.appointment.startsAt.toISOString(),
    endsAt: row.appointment.endsAt.toISOString(),
    createdAt: row.appointment.createdAt.toISOString(),
    updatedAt: row.appointment.updatedAt.toISOString(),
  }));
}

export async function findAvailableGroomer(
  neighborhood: string,
  startsAt: Date,
  endsAt: Date,
  excludeAppointmentId?: string,
): Promise<string | null> {
  const db = getDatabase();
  const weekday = toKstShifted(startsAt).getUTCDay();
  const requestedStart = timeOfDay(startsAt);
  const requestedEnd = timeOfDay(endsAt);

  const scheduledGroomers = await db
    .select({
      groomerId: groomers.id,
      startTime: groomerSchedules.startTime,
      endTime: groomerSchedules.endTime,
    })
    .from(groomers)
    .innerJoin(
      groomerServiceAreas,
      eq(groomerServiceAreas.groomerId, groomers.id),
    )
    .innerJoin(
      groomerSchedules,
      and(
        eq(groomerSchedules.groomerId, groomers.id),
        eq(groomerSchedules.weekday, weekday),
      ),
    )
    .where(
      and(
        eq(groomers.active, true),
        eq(groomerServiceAreas.neighborhood, neighborhood),
        eq(groomerSchedules.available, true),
      ),
    );

  const candidates = scheduledGroomers.filter(
    (groomer) =>
      groomer.startTime <= requestedStart && groomer.endTime >= requestedEnd,
  );
  if (candidates.length === 0) return null;

  const candidateIds = candidates.map((groomer) => groomer.groomerId);
  const conflictConditions = [
    inArray(appointments.groomerId, candidateIds),
    lt(appointments.startsAt, endsAt),
    gt(appointments.endsAt, startsAt),
    ne(appointments.status, "cancelled"),
  ];
  if (excludeAppointmentId) {
    conflictConditions.push(ne(appointments.id, excludeAppointmentId));
  }
  const conflictingAppointments = await db
    .select({ groomerId: appointments.groomerId })
    .from(appointments)
    .where(and(...conflictConditions));

  const busyGroomerIds = new Set(
    conflictingAppointments
      .map((appointment) => appointment.groomerId)
      .filter((groomerId): groomerId is string => Boolean(groomerId)),
  );

  return (
    candidates.find((groomer) => !busyGroomerIds.has(groomer.groomerId))
      ?.groomerId ?? null
  );
}

function timeOfDay(date: Date): string {
  const kst = toKstShifted(date);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(
    kst.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

const UNCANCELABLE_STATUSES = new Set(["cancelled", "completed"]);
const AVAILABILITY_WINDOW_DAYS = 7;
const SLOT_STEP_MS = 60 * 60 * 1000;

type ActionError = { ok: false; error: "not_found" | "not_cancelable" | "no_groomer" };
type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | ActionError;

export async function cancelAppointmentByReference(
  reference: string,
): Promise<ActionResult> {
  const db = getDatabase();
  const [appointment] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.bookingReference, reference))
    .limit(1);

  if (!appointment) return { ok: false, error: "not_found" };
  if (UNCANCELABLE_STATUSES.has(appointment.status)) {
    return { ok: false, error: "not_cancelable" };
  }

  await db
    .update(appointments)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(appointments.id, appointment.id));

  return { ok: true };
}

export async function getRescheduleSlots(
  reference: string,
): Promise<ActionResult<{ slots: { startsAt: string; endsAt: string }[] }>> {
  const db = getDatabase();
  const [appointment] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.bookingReference, reference))
    .limit(1);

  if (!appointment) return { ok: false, error: "not_found" };
  if (UNCANCELABLE_STATUSES.has(appointment.status)) {
    return { ok: false, error: "not_cancelable" };
  }

  const [groomingPackage] = await db
    .select()
    .from(groomingPackages)
    .where(eq(groomingPackages.id, appointment.packageId))
    .limit(1);
  if (!groomingPackage) return { ok: false, error: "not_found" };

  const durationMs = groomingPackage.durationMinutes * 60 * 1000;
  const now = new Date();
  const kstNow = toKstShifted(now);
  const slots: { startsAt: string; endsAt: string }[] = [];

  for (let dayOffset = 0; dayOffset < AVAILABILITY_WINDOW_DAYS; dayOffset++) {
    const kstDay = new Date(
      Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth(),
        kstNow.getUTCDate() + dayOffset,
      ),
    );
    const weekday = kstDay.getUTCDay();

    const window = await db
      .select({
        startTime: groomerSchedules.startTime,
        endTime: groomerSchedules.endTime,
      })
      .from(groomers)
      .innerJoin(
        groomerServiceAreas,
        eq(groomerServiceAreas.groomerId, groomers.id),
      )
      .innerJoin(
        groomerSchedules,
        and(
          eq(groomerSchedules.groomerId, groomers.id),
          eq(groomerSchedules.weekday, weekday),
        ),
      )
      .where(
        and(
          eq(groomers.active, true),
          eq(groomerServiceAreas.neighborhood, appointment.neighborhood),
          eq(groomerSchedules.available, true),
        ),
      );

    if (window.length === 0) continue;

    const earliestStart = window.reduce(
      (min, row) => (row.startTime < min ? row.startTime : min),
      window[0].startTime,
    );
    const latestEnd = window.reduce(
      (max, row) => (row.endTime > max ? row.endTime : max),
      window[0].endTime,
    );

    const [startHour, startMinute] = earliestStart.split(":").map(Number);
    const [endHour, endMinute] = latestEnd.split(":").map(Number);

    let candidateKst = new Date(kstDay);
    candidateKst.setUTCHours(startHour, startMinute, 0, 0);
    const dayEndKst = new Date(kstDay);
    dayEndKst.setUTCHours(endHour, endMinute, 0, 0);

    while (candidateKst.getTime() + durationMs <= dayEndKst.getTime()) {
      const candidateStart = fromKstShifted(candidateKst);
      const candidateEnd = new Date(candidateStart.getTime() + durationMs);

      if (candidateStart.getTime() > now.getTime()) {
        const groomerId = await findAvailableGroomer(
          appointment.neighborhood,
          candidateStart,
          candidateEnd,
          appointment.id,
        );
        if (groomerId) {
          slots.push({
            startsAt: candidateStart.toISOString(),
            endsAt: candidateEnd.toISOString(),
          });
        }
      }

      candidateKst = new Date(candidateKst.getTime() + SLOT_STEP_MS);
    }
  }

  return { ok: true, slots };
}

export async function rescheduleAppointmentByReference(
  reference: string,
  startsAt: Date,
): Promise<ActionResult> {
  const db = getDatabase();
  const [appointment] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.bookingReference, reference))
    .limit(1);

  if (!appointment) return { ok: false, error: "not_found" };
  if (UNCANCELABLE_STATUSES.has(appointment.status)) {
    return { ok: false, error: "not_cancelable" };
  }

  const [groomingPackage] = await db
    .select()
    .from(groomingPackages)
    .where(eq(groomingPackages.id, appointment.packageId))
    .limit(1);
  if (!groomingPackage) return { ok: false, error: "not_found" };

  const endsAt = new Date(
    startsAt.getTime() + groomingPackage.durationMinutes * 60 * 1000,
  );

  const groomerId = await findAvailableGroomer(
    appointment.neighborhood,
    startsAt,
    endsAt,
    appointment.id,
  );
  if (!groomerId) return { ok: false, error: "no_groomer" };

  await db
    .update(appointments)
    .set({ groomerId, startsAt, endsAt, updatedAt: new Date() })
    .where(eq(appointments.id, appointment.id));

  return { ok: true };
}
