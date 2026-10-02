import { rescheduleAppointmentByReference } from "@/lib/clipper/data";

type RouteParams = {
  params: Promise<{ reference: string }>;
};

type RescheduleRequest = {
  startsAt?: unknown;
};

export async function POST(request: Request, { params }: RouteParams) {
  const { reference } = await params;

  let input: RescheduleRequest;
  try {
    input = (await request.json()) as RescheduleRequest;
  } catch {
    return Response.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof input.startsAt !== "string" || input.startsAt.trim().length === 0) {
    return Response.json(
      { ok: false, error: "startsAt is required." },
      { status: 400 },
    );
  }

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return Response.json(
      { ok: false, error: "startsAt must be a valid date." },
      { status: 400 },
    );
  }

  const result = await rescheduleAppointmentByReference(reference, startsAt);

  if (!result.ok) {
    if (result.error === "not_found") {
      return Response.json(
        { ok: false, error: "Appointment was not found." },
        { status: 404 },
      );
    }
    if (result.error === "no_groomer") {
      return Response.json(
        {
          ok: false,
          error: "That time just got booked. Please pick another slot.",
        },
        { status: 409 },
      );
    }
    return Response.json(
      { ok: false, error: "This appointment can no longer be rescheduled." },
      { status: 409 },
    );
  }

  return Response.json({ ok: true });
}
