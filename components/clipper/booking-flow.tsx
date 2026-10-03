"use client";

import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, Button, Input } from "@/components/ui";
import { dateKeyInTimeZone, formatDateLabel, formatTimeLabel, toSafeDate } from "@/lib/clipper/format";
import { cn } from "@/lib/utils";

type PackageOption = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
};

type NeighborhoodOption = string | { id?: string; name: string };

type ApiSlot = {
  id?: string;
  startsAt?: string | number;
  endsAt?: string | number;
  date?: string;
  time?: string;
  label?: string;
  groomerName?: string;
};

type BookingOptionsResponse = {
  packages: PackageOption[];
  neighborhoods: NeighborhoodOption[];
  availableSlots?: ApiSlot[];
  slots?: ApiSlot[];
};

type SlotOption = {
  id: string;
  startsAt: string;
  endsAt?: string | number;
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
  groomerName?: string;
};

type FieldName = "petName" | "petBreed" | "packageId" | "address" | "neighborhood" | "slot";

function formatMoney(cents: number) {
  return `₩${cents.toLocaleString("ko-KR")}`;
}

function normalizeSlot(slot: ApiSlot, index: number): SlotOption | null {
  const startsAt = slot.startsAt ?? (slot.date && slot.time ? `${slot.date}T${slot.time}` : undefined);
  if (!startsAt) return null;
  const date = toSafeDate(startsAt);
  if (!date) return null;
  return {
    id: slot.id ?? `slot-${index}-${date.toISOString()}`,
    startsAt: String(startsAt),
    endsAt: slot.endsAt,
    dateKey: dateKeyInTimeZone(date),
    dateLabel: formatDateLabel(date, "short"),
    timeLabel: slot.label ?? formatTimeLabel(date),
    groomerName: slot.groomerName,
  };
}

function mergeOptions(current: BookingOptionsResponse, incoming: Partial<BookingOptionsResponse>): BookingOptionsResponse {
  return {
    ...current,
    packages: incoming.packages?.length ? incoming.packages : current.packages,
    neighborhoods: incoming.neighborhoods?.length ? incoming.neighborhoods : current.neighborhoods,
  };
}

export function BookingFlow({ sectionId = "book", variant = "prism", theme = { ink: "#0a2540", accent: "#635bff" } }: { sectionId?: string; variant?: "prism"; theme?: { ink: string; accent: string } }) {
  const fallbackOptions: BookingOptionsResponse = {
    packages: [
      { id: "pkg_bath_brush", name: "Bath & Brush", description: "A refreshing bath, blow dry, brush-out, and nail trim.", durationMinutes: 60, priceCents: 65000 },
      { id: "pkg_full_groom", name: "Full Groom", description: "Bath, brush-out, haircut, nail trim, and ear cleaning.", durationMinutes: 90, priceCents: 95000 },
      { id: "pkg_deluxe", name: "Deluxe Spa", description: "Full grooming plus teeth brushing and a soothing paw treatment.", durationMinutes: 120, priceCents: 135000 },
    ],
    neighborhoods: ["Hannam-dong", "Yeonnam-dong", "Seongsu-dong", "Itaewon", "Gangnam", "Mangwon-dong"],
    availableSlots: [
      { id: "fallback-fri-10", startsAt: "2026-08-21T10:00:00Z", label: "10:00 AM" },
      { id: "fallback-fri-13", startsAt: "2026-08-21T13:00:00Z", label: "1:00 PM" },
      { id: "fallback-sat-11", startsAt: "2026-08-22T11:00:00Z", label: "11:00 AM" },
      { id: "fallback-sat-14", startsAt: "2026-08-22T14:00:00Z", label: "2:00 PM" },
    ],
  };

  const [options, setOptions] = useState<BookingOptionsResponse>(fallbackOptions);
  const [petName, setPetName] = useState("");
  const [petBreed, setPetBreed] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [totalPrice, setTotalPrice] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});

  const petNameRef = useRef<HTMLInputElement>(null);
  const breedRef = useRef<HTMLSelectElement>(null);
  const packageGroupRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const neighborhoodRef = useRef<HTMLSelectElement>(null);
  const slotGroupRef = useRef<HTMLDivElement>(null);

  const selectedPackage = options.packages.find((pkg) => pkg.id === selectedPackageId);
  const neighborhoods = options.neighborhoods.map((neighborhood) => typeof neighborhood === "string" ? neighborhood : neighborhood.name);
  const slots = (options.availableSlots ?? options.slots ?? []).map(normalizeSlot).filter((slot): slot is SlotOption => Boolean(slot));
  const groupedSlots = slots.reduce<Record<string, SlotOption[]>>((groups, slot) => {
    groups[slot.dateKey] = [...(groups[slot.dateKey] ?? []), slot];
    return groups;
  }, {});
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId);

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    fetch("/api/booking-options")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load booking options");
        return response.json() as Promise<BookingOptionsResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        const incomingSlots = data.availableSlots ?? data.slots ?? [];
        setOptions((current) => ({
          ...mergeOptions(current, data),
          availableSlots: incomingSlots,
          slots: incomingSlots,
        }));
      })
      .catch(() => {
        // Keep the local booking options available when the API is offline.
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setTotalPrice(selectedPackage?.priceCents ?? 0);
    setDurationMinutes(selectedPackage?.durationMinutes ?? 0);
  }, [selectedPackage]);

  function focusFirstInvalid(errors: Partial<Record<FieldName, string>>) {
    const order: { name: FieldName; element: HTMLElement | null }[] = [
      { name: "petName", element: petNameRef.current },
      { name: "petBreed", element: breedRef.current as HTMLElement | null },
      { name: "packageId", element: packageGroupRef.current },
      { name: "address", element: addressRef.current },
      { name: "neighborhood", element: neighborhoodRef.current as HTMLElement | null },
      { name: "slot", element: slotGroupRef.current },
    ];
    const first = order.find((field) => errors[field.name]);
    first?.element?.focus();
    first?.element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function validateAndSubmit() {
    const errors: Partial<Record<FieldName, string>> = {};
    if (!petName.trim()) errors.petName = "Enter your pet's name.";
    if (!petBreed) errors.petBreed = "Choose a breed.";
    if (!selectedPackageId) errors.packageId = "Choose a service.";
    if (!address.trim()) errors.address = "Enter a street address.";
    if (!selectedNeighborhood) errors.neighborhood = "Choose a neighborhood.";
    if (!selectedSlot) errors.slot = "Pick an arrival time.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Please complete each step before booking your Clipper visit.");
      focusFirstInvalid(errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    setFormError("");
    fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        petName: petName.trim(),
        petBreed,
        packageId: selectedPackageId,
        neighborhood: selectedNeighborhood,
        address,
        addressDetail: addressDetail.trim(),
        startsAt: selectedSlot!.startsAt,
        endsAt: selectedSlot!.endsAt,
        priceCents: totalPrice,
        durationMinutes,
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Could not create booking");
        return response.json() as Promise<{ reference?: string; bookingReference?: string }>;
      })
      .then((data) => {
        const reference = data.reference ?? data.bookingReference;
        if (!reference) throw new Error("Booking reference missing");
        window.location.assign(`/appointments/${encodeURIComponent(reference)}`);
      })
      .catch(() => {
        setSubmitting(false);
        setFormError("We couldn’t save that visit. Please check your details and try again.");
      });
  }

  const prism = true;
  const ink = theme.ink;
  const accent = theme.accent;

  return (
      <section id={sectionId} className={cn("clipper-booking scroll-mt-5", `clipper-booking--${variant}`)}>
        <div className="mx-auto max-w-7xl px-5 pb-24 sm:px-8 lg:px-12">
          <div className={cn("mb-10 max-w-3xl", prism ? "pt-2" : "pt-4")}>
            <p className="text-sm font-bold" style={{ color: accent }}>{prism ? "Book a Clipper visit" : "Create an appointment"}</p>
            <h2 className="mt-3 text-[clamp(2.7rem,6vw,5.25rem)] font-bold leading-[0.95] tracking-[-0.06em]" style={{ color: ink }}>
              {prism ? "Everything your pet needs. One calm visit." : "Build the right grooming visit."}
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#53627a]">Choose the pet, service, location, and time. We’ll match the route with a trusted Seoul groomer.</p>
          </div>

          <div className={cn("overflow-hidden border bg-white", prism ? "rounded-2xl border-[#dbe3ef] shadow-[0_32px_90px_rgb(38_46_77/12%)]" : "rounded-xl border-[#eadbd6] shadow-[0_32px_90px_rgb(66_35_45/10%)] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]")}>
            <div className={cn("grid", prism ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : "lg:grid-cols-[minmax(0,1fr)_19rem]")}>
              <div className="space-y-10 p-5 sm:p-8 lg:p-10">
                {formError && <Alert className="border-[#f3aaa0] bg-[#fff3f0] text-[#8f3d30]"><AlertDescription>{formError}</AlertDescription></Alert>}
                {loadingOptions && <p className="text-xs font-semibold text-[#8898aa]">Checking this week’s available routes…</p>}

                <fieldset>
                  <legend className="mb-4 text-lg font-bold tracking-[-0.025em]" style={{ color: ink }}>1. Who are we grooming?</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-[#53627a]">
                      Pet name
                      <Input
                        ref={petNameRef}
                        value={petName}
                        onChange={(event) => { setPetName(event.target.value); setFieldErrors((errors) => ({ ...errors, petName: undefined })); }}
                        placeholder="e.g. Luna"
                        autoComplete="off"
                        aria-invalid={Boolean(fieldErrors.petName)}
                        aria-describedby={fieldErrors.petName ? "pet-name-error" : undefined}
                        className="mt-2 h-12 rounded-md border-[#dbe3ef] bg-white px-4 text-base font-normal text-[#0a2540] focus-visible:ring-[#635bff]"
                      />
                      {fieldErrors.petName && <span id="pet-name-error" className="mt-1 block text-xs font-semibold text-[#9f3f38]">{fieldErrors.petName}</span>}
                    </label>
                    <label className="text-xs font-bold text-[#53627a]">
                      Breed
                      <select
                        ref={breedRef}
                        value={petBreed}
                        onChange={(event) => { setPetBreed(event.target.value); setFieldErrors((errors) => ({ ...errors, petBreed: undefined })); }}
                        aria-invalid={Boolean(fieldErrors.petBreed)}
                        aria-describedby={fieldErrors.petBreed ? "pet-breed-error" : undefined}
                        className="mt-2 h-12 w-full rounded-md border border-[#dbe3ef] bg-white px-4 text-base font-normal text-[#0a2540] outline-none focus:border-[#635bff]"
                      >
                        <option value="">Choose a breed</option>
                        <option>Golden Retriever</option>
                        <option>Labrador Retriever</option>
                        <option>French Bulldog</option>
                        <option>German Shepherd</option>
                        <option>Poodle</option>
                        <option>Miniature Poodle</option>
                        <option>Pomeranian</option>
                        <option>Shiba Inu</option>
                        <option>Welsh Corgi</option>
                        <option>Yorkshire Terrier</option>
                        <option>Mixed Breed</option>
                      </select>
                      {fieldErrors.petBreed && <span id="pet-breed-error" className="mt-1 block text-xs font-semibold text-[#9f3f38]">{fieldErrors.petBreed}</span>}
                    </label>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-4 text-lg font-bold tracking-[-0.025em]" style={{ color: ink }}>2. Choose a service</legend>
                  <div ref={packageGroupRef} tabIndex={-1} role="group" aria-describedby={fieldErrors.packageId ? "package-error" : undefined} className="divide-y divide-[#e6ebf1] border-y border-[#e6ebf1]">{options.packages.map((pkg) => <button type="button" key={pkg.id} onClick={() => { setSelectedPackageId(pkg.id); setFormError(""); setFieldErrors((errors) => ({ ...errors, packageId: undefined })); }} className={cn("grid w-full grid-cols-[1fr_auto] items-center gap-5 px-1 py-5 text-left", selectedPackageId === pkg.id ? "" : "opacity-70 hover:opacity-100")}><span><span className="flex items-center gap-2 font-bold" style={{ color: ink }}><span className="size-2 rounded-full" style={{ background: selectedPackageId === pkg.id ? accent : "#dbe3ef" }} />{pkg.name}</span><span className="mt-1 block pl-4 text-xs leading-5 text-[#8898aa]">{pkg.description}</span></span><span className="text-right"><span className="block font-bold" style={{ color: ink }}>{formatMoney(pkg.priceCents)}</span><span className="text-xs text-[#8898aa]">{pkg.durationMinutes} min</span></span></button>)}</div>
                  {fieldErrors.packageId && <span id="package-error" className="mt-2 block text-xs font-semibold text-[#9f3f38]">{fieldErrors.packageId}</span>}
                </fieldset>

                <fieldset>
                  <legend className="mb-4 text-lg font-bold tracking-[-0.025em]" style={{ color: ink }}>3. Where should we arrive?</legend>
                  <div className="grid gap-3 sm:grid-cols-[1.25fr_0.75fr]">
                    <label className="text-xs font-bold text-[#53627a]">
                      Street address
                      <Input
                        ref={addressRef}
                        value={address}
                        onChange={(event) => { setAddress(event.target.value); setFieldErrors((errors) => ({ ...errors, address: undefined })); }}
                        placeholder="Street address"
                        autoComplete="street-address"
                        aria-invalid={Boolean(fieldErrors.address)}
                        aria-describedby={fieldErrors.address ? "address-error" : undefined}
                        className="mt-2 h-12 rounded-md border-[#dbe3ef] bg-white px-4 focus-visible:ring-[#705cf6]"
                      />
                      {fieldErrors.address && <span id="address-error" className="mt-1 block text-xs font-semibold text-[#9f3f38]">{fieldErrors.address}</span>}
                    </label>
                    <label className="text-xs font-bold text-[#53627a]">
                      Neighborhood
                      <select
                        ref={neighborhoodRef}
                        value={selectedNeighborhood}
                        onChange={(event) => { setSelectedNeighborhood(event.target.value); setFieldErrors((errors) => ({ ...errors, neighborhood: undefined })); }}
                        aria-invalid={Boolean(fieldErrors.neighborhood)}
                        aria-describedby={fieldErrors.neighborhood ? "neighborhood-error" : undefined}
                        className="mt-2 h-12 w-full rounded-md border border-[#dbe3ef] bg-white px-4 text-sm outline-none"
                      >
                        <option value="">Neighborhood</option>
                        {neighborhoods.map((neighborhood) => <option key={neighborhood} value={neighborhood}>{neighborhood}</option>)}
                      </select>
                      {fieldErrors.neighborhood && <span id="neighborhood-error" className="mt-1 block text-xs font-semibold text-[#9f3f38]">{fieldErrors.neighborhood}</span>}
                    </label>
                  </div>
                  <label className="mt-3 block text-xs font-bold text-[#53627a]">
                    Apartment, floor, or gate code (optional)
                    <Input
                      value={addressDetail}
                      onChange={(event) => setAddressDetail(event.target.value)}
                      placeholder="e.g. Unit 4B, gate code 1234"
                      autoComplete="address-line2"
                      className="mt-2 h-11 rounded-md border-[#dbe3ef] bg-white px-4 text-base font-normal text-[#0a2540]"
                    />
                  </label>
                </fieldset>

                <fieldset>
                  <legend className="mb-1 text-lg font-bold tracking-[-0.025em]" style={{ color: ink }}>4. Pick an arrival time</legend>
                  <p className="mb-4 text-xs text-[#8898aa]">All times KST · matched against live groomer routes</p>
                  <div ref={slotGroupRef} tabIndex={-1} role="group" aria-describedby={fieldErrors.slot ? "slot-error" : undefined} className="grid gap-5 sm:grid-cols-2">{Object.entries(groupedSlots).map(([dateKey, dateSlots]) => <div key={dateKey}><p className="mb-2 text-sm font-bold" style={{ color: ink }}>{dateSlots[0]?.dateLabel}</p><div className="grid grid-cols-2 gap-2">{dateSlots.map((slot) => <button type="button" key={slot.id} onClick={() => { setSelectedSlotId(slot.id); setFormError(""); setFieldErrors((errors) => ({ ...errors, slot: undefined })); }} className={cn("rounded-md border px-3 py-3 text-sm font-bold", selectedSlotId === slot.id ? "text-white" : "border-[#dbe3ef] bg-white text-[#425466]")} style={selectedSlotId === slot.id ? { background: accent, borderColor: accent } : undefined}>{slot.timeLabel}</button>)}</div></div>)}{!slots.length && <p className="text-sm text-[#53627a]">No routes are open for this address yet.</p>}</div>
                  {fieldErrors.slot && <span id="slot-error" className="mt-2 block text-xs font-semibold text-[#9f3f38]">{fieldErrors.slot}</span>}
                </fieldset>
              </div>

              <aside className={cn("border-t p-5 sm:p-7 lg:border-l lg:border-t-0", prism ? "border-[#e6ebf1] bg-[#f7f9fc]" : "border-[#eadbd6] bg-[#fff8f4]")}>
                <div className="lg:sticky lg:top-6">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#8898aa]">Visit summary</p>
                  <p className="mt-5 text-2xl font-bold tracking-[-0.04em]" style={{ color: ink }}>{petName || "Your pet"}</p>
                  <p className="mt-1 text-sm text-[#53627a]">{selectedPackage?.name ?? "Choose a service"}</p>
                  <dl className="mt-7 space-y-4 border-y border-[#dbe3ef] py-5 text-sm"><div className="flex justify-between gap-3"><dt className="text-[#8898aa]">Arrival</dt><dd className="text-right font-semibold" style={{ color: ink }}>{selectedSlot ? `${selectedSlot.dateLabel}, ${selectedSlot.timeLabel}` : "Not selected"}</dd></div><div className="flex justify-between"><dt className="text-[#8898aa]">Duration</dt><dd className="font-semibold" style={{ color: ink }}>{durationMinutes} min</dd></div><div className="flex justify-between"><dt className="text-[#8898aa]">Neighborhood</dt><dd className="font-semibold" style={{ color: ink }}>{selectedNeighborhood || "Not selected"}</dd></div></dl>
                  <div className="my-6 flex items-end justify-between"><span className="text-sm font-semibold text-[#53627a]">Total</span><span className="text-3xl font-bold tracking-[-0.05em]" style={{ color: ink }}>{formatMoney(totalPrice)}</span></div>
                  <Button type="button" onClick={validateAndSubmit} disabled={submitting || loadingOptions} className="h-12 w-full rounded-md text-sm font-bold !text-white shadow-none" style={{ background: accent }}>{submitting ? "Saving your spot…" : "Confirm visit →"}</Button>
                  <p className="mt-3 text-center text-[0.68rem] leading-5 text-[#8898aa]">No charge until your groomer is confirmed.</p>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>
  );
}
