import { getAvailableSlots, getBookingOptions } from "@/lib/clipper/data";

export async function GET(request: Request) {
  try {
    const options = await getBookingOptions();

    // Slots depend on where and how long the visit is, so they are only
    // returned once the caller picks both a neighborhood and a package.
    const params = new URL(request.url).searchParams;
    const neighborhood = params.get("neighborhood")?.trim();
    const groomingPackage = options.packages.find(
      (pkg) => pkg.id === params.get("packageId"),
    );
    const slots =
      neighborhood && groomingPackage
        ? await getAvailableSlots(neighborhood, groomingPackage.durationMinutes)
        : [];

    return Response.json({ ...options, slots });
  } catch (error) {
    console.error("Failed to load booking options", error);

    return Response.json(
      { ok: false, error: "We could not load booking options." },
      { status: 500 },
    );
  }
}
