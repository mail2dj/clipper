import { getRescheduleSlots } from "@/lib/clipper/data";

type RouteParams = {
  params: Promise<{ reference: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { reference } = await params;
  const result = await getRescheduleSlots(reference);

  if (!result.ok) {
    if (result.error === "not_found") {
      return Response.json(
        { ok: false, error: "Appointment was not found." },
        { status: 404 },
      );
    }
    return Response.json(
      { ok: false, error: "This appointment can no longer be rescheduled." },
      { status: 409 },
    );
  }

  return Response.json({ ok: true, slots: result.slots });
}
