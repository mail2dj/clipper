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
import { fromKst, kstParts, parseTimeOfDay } from "./format";
import type {
  AppointmentDetails,
  BookingOption,
  GroomingPackage,
} from "./types";

const SLOT_DAYS_AHEAD = 7;
const SLOT_STEP_MINUTES = 60;

export async function getBookingOptions(): Promise<BookingOption> {
  const db = getDatabase();

  const packageRows = await db.select().from(groomingPackages);
  const neighborhoodRows = await db
    .select({ neighborhood: groomerServiceAreas.neighborhood })
    .from(groomerServiceAreas);

  const neighborhoods = [
    ...new Set(neighborhoodRows.map((row) => row.neighborhood)),
  ].sort();

  return {
    packages: packageRows,
    neighborhoods,
  };
}

type AppointmentRow = {
  appointment: typeof appointments.$inferSelect;
  groomer: typeof groomers.$inferSelect | null;
  groomingPackage: GroomingPackage;
};

function toAppointmentDetails(row: AppointmentRow): AppointmentDetails {
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

function selectAppointmentRows() {
  return getDatabase()
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
    );
}

export async function getAppointmentByReference(
  reference: string,
): Promise<AppointmentDetails | null> {
  const rows = await selectAppointmentRows()
    .where(eq(appointments.bookingReference, reference))
    .limit(1);

  return rows[0] ? toAppointmentDetails(rows[0]) : null;
}

export async function getAppointments(): Promise<AppointmentDetails[]> {
  const rows = await selectAppointmentRows().orderBy(
    desc(appointments.startsAt),
  );

  return rows.map(toAppointmentDetails);
}

// Schedule times are KST wall-clock times, so the weekday and time-of-day checks use KST.
export async function findAvailableGroomer(
  neighborhood: string,
  startsAt: Date,
  endsAt: Date,
  excludeAppointmentId?: string,
): Promise<string | null> {
  const db = getDatabase();
  const start = kstParts(startsAt);
  const requestedStart = start.minutesOfDay;
  const requestedEnd = kstParts(endsAt).minutesOfDay;
  // A visit that runs past midnight can't fit inside a single day's schedule.
  if (requestedEnd <= requestedStart) return null;

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
        eq(groomerSchedules.weekday, start.weekday),
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
      parseTimeOfDay(groomer.startTime) <= requestedStart &&
      parseTimeOfDay(groomer.endTime) >= requestedEnd,
  );
  if (candidates.length === 0) return null;

  const candidateIds = candidates.map((groomer) => groomer.groomerId);
  const conflictingAppointments = await db
    .select({ groomerId: appointments.groomerId })
    .from(appointments)
    .where(
      and(
        inArray(appointments.groomerId, candidateIds),
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, startsAt),
        ne(appointments.status, "cancelled"),
        excludeAppointmentId
          ? ne(appointments.id, excludeAppointmentId)
          : undefined,
      ),
    );

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

// Bookable start times (ISO strings) for the next week, using the same rules as
// findAvailableGroomer but with two queries total instead of two per slot.
export async function getAvailableSlots(
  neighborhood: string,
  durationMinutes: number,
  { now = new Date(), excludeAppointmentId }: {
    now?: Date;
    excludeAppointmentId?: string;
  } = {},
): Promise<string[]> {
  const db = getDatabase();

  const schedules = await db
    .select({
      groomerId: groomers.id,
      weekday: groomerSchedules.weekday,
      startTime: groomerSchedules.startTime,
      endTime: groomerSchedules.endTime,
    })
    .from(groomers)
    .innerJoin(
      groomerServiceAreas,
      eq(groomerServiceAreas.groomerId, groomers.id),
    )
    .innerJoin(groomerSchedules, eq(groomerSchedules.groomerId, groomers.id))
    .where(
      and(
        eq(groomers.active, true),
        eq(groomerServiceAreas.neighborhood, neighborhood),
        eq(groomerSchedules.available, true),
      ),
    );
  if (schedules.length === 0) return [];

  const today = kstParts(now);
  const rangeStart = fromKst(today.year, today.month, today.day);
  const rangeEnd = fromKst(
    today.year,
    today.month,
    today.day + SLOT_DAYS_AHEAD,
  );

  const groomerIds = [...new Set(schedules.map((row) => row.groomerId))];
  const busy = await db
    .select({
      groomerId: appointments.groomerId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
    })
    .from(appointments)
    .where(
      and(
        inArray(appointments.groomerId, groomerIds),
        lt(appointments.startsAt, rangeEnd),
        gt(appointments.endsAt, rangeStart),
        ne(appointments.status, "cancelled"),
        excludeAppointmentId
          ? ne(appointments.id, excludeAppointmentId)
          : undefined,
      ),
    );

  const slots: string[] = [];
  for (let offset = 0; offset < SLOT_DAYS_AHEAD; offset += 1) {
    const dayStart = fromKst(today.year, today.month, today.day + offset);
    const weekday = kstParts(dayStart).weekday;
    const daySchedules = schedules.filter((row) => row.weekday === weekday);

    for (
      let minutes = 0;
      minutes + durationMinutes <= 24 * 60;
      minutes += SLOT_STEP_MINUTES
    ) {
      const startsAt = fromKst(
        today.year,
        today.month,
        today.day + offset,
        minutes,
      );
      if (startsAt.getTime() <= now.getTime()) continue;
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

      const hasFreeGroomer = daySchedules.some(
        (row) =>
          parseTimeOfDay(row.startTime) <= minutes &&
          parseTimeOfDay(row.endTime) >= minutes + durationMinutes &&
          !busy.some(
            (appointment) =>
              appointment.groomerId === row.groomerId &&
              appointment.startsAt < endsAt &&
              appointment.endsAt > startsAt,
          ),
      );
      if (hasFreeGroomer) slots.push(startsAt.toISOString());
    }
  }

  return slots;
}

type ActionError = {
  ok: false;
  error: "not_found" | "not_changeable" | "no_groomer";
};
type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | ActionError;

async function getChangeableAppointment(reference: string) {
  const db = getDatabase();
  const [appointment] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.bookingReference, reference))
    .limit(1);

  if (!appointment) return { ok: false, error: "not_found" } as const;
  if (appointment.status === "cancelled" || appointment.status === "completed") {
    return { ok: false, error: "not_changeable" } as const;
  }
  return { ok: true, appointment } as const;
}

async function getPackageDuration(packageId: string): Promise<number | null> {
  const [groomingPackage] = await getDatabase()
    .select({ durationMinutes: groomingPackages.durationMinutes })
    .from(groomingPackages)
    .where(eq(groomingPackages.id, packageId))
    .limit(1);

  return groomingPackage?.durationMinutes ?? null;
}

export async function cancelAppointmentByReference(
  reference: string,
): Promise<ActionResult> {
  const found = await getChangeableAppointment(reference);
  if (!found.ok) return found;

  await getDatabase()
    .update(appointments)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(appointments.id, found.appointment.id));

  return { ok: true };
}

export async function getRescheduleSlots(
  reference: string,
): Promise<ActionResult<{ slots: { startsAt: string; endsAt: string }[] }>> {
  const found = await getChangeableAppointment(reference);
  if (!found.ok) return found;

  const { appointment } = found;
  const durationMinutes = await getPackageDuration(appointment.packageId);
  if (durationMinutes === null) return { ok: false, error: "not_found" };

  const starts = await getAvailableSlots(
    appointment.neighborhood,
    durationMinutes,
    { excludeAppointmentId: appointment.id },
  );

  return {
    ok: true,
    slots: starts.map((startsAt) => ({
      startsAt,
      endsAt: new Date(
        new Date(startsAt).getTime() + durationMinutes * 60_000,
      ).toISOString(),
    })),
  };
}

export async function rescheduleAppointmentByReference(
  reference: string,
  startsAt: Date,
): Promise<ActionResult> {
  const found = await getChangeableAppointment(reference);
  if (!found.ok) return found;

  const { appointment } = found;
  const durationMinutes = await getPackageDuration(appointment.packageId);
  if (durationMinutes === null) return { ok: false, error: "not_found" };

  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const groomerId =
    startsAt.getTime() > Date.now()
      ? await findAvailableGroomer(
          appointment.neighborhood,
          startsAt,
          endsAt,
          appointment.id,
        )
      : null;
  if (!groomerId) return { ok: false, error: "no_groomer" };

  await getDatabase()
    .update(appointments)
    .set({ groomerId, startsAt, endsAt, updatedAt: new Date() })
    .where(eq(appointments.id, appointment.id));

  return { ok: true };
}
