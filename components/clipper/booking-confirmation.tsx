import { Check, Heart, Sparkles } from "lucide-react";
import Link from "next/link";

import { formatKstDate } from "@/lib/clipper/format";
import { getStatusDisplay } from "@/lib/clipper/status";
import type { AppointmentDetails } from "@/lib/clipper/types";

type BookingConfirmationProps = {
  appointment: AppointmentDetails;
};

export function BookingConfirmation({ appointment }: BookingConfirmationProps) {
  const petName = appointment.pet.name;
  const status = getStatusDisplay(appointment.status).label;
  const when = formatKstDate(appointment.startsAt, "long");
  const { headline, message } = {
    cancelled: {
      headline: `${petName}'s visit was cancelled.`,
      message: `The visit planned for ${when} will not go ahead. You're welcome to book another time.`,
    },
    completed: {
      headline: `${petName} is all freshened up.`,
      message: `Thanks for having us on ${when}. We hope to see you again soon.`,
    },
  }[appointment.status as string] ?? {
    headline: `${petName} is on the books.`,
    message: `We'll see you on ${when}. Your groomer will bring the good towels—and a little extra patience.`,
  };

  return (
    <section className="relative overflow-hidden rounded-2xl bg-[#0a2540] px-5 py-8 text-white shadow-[0_28px_80px_rgba(10,37,64,0.24)] sm:px-8 sm:py-10">
      <div className="relative max-w-xl">
        <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-white text-[#635bff] shadow-sm">
          <Check aria-hidden="true" className="size-6" strokeWidth={3} />
        </div>
        <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#80e9ff]">
          <Sparkles aria-hidden="true" className="size-3.5" /> {status}
        </p>
        <h1 className="max-w-lg text-4xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl">
          {headline}
        </h1>
        <p className="mt-5 max-w-md text-base leading-7 text-[#adbdcc] sm:text-lg">
          {message}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-[#d6e2ec]">
          <span className="inline-flex items-center gap-2"><Heart aria-hidden="true" className="size-4 fill-current" /> Made for good pets</span>
          <span className="font-mono text-xs tracking-[0.14em] text-[#80e9ff]">{appointment.reference}</span>
        </div>
      </div>
    </section>
  );
}
