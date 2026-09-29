import { getBookingOptions } from "@/lib/clipper/data";

export async function GET() {
  try {
    const options = await getBookingOptions();
    return Response.json(options);
  } catch (error) {
    console.error("Error in GET /api/booking-options:", error);

    return Response.json(
      { ok: false, error: "We could not load booking options." },
      { status: 500 },
    );
  }
}
