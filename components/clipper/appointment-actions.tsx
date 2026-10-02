"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, X } from "lucide-react";

import { Alert, AlertDescription, Button } from "@/components/ui";

type AppointmentActionsProps = {
  reference: string;
  status: string;
};

type Slot = { startsAt: string; endsAt: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(date: Date) {
  return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function formatTimeLabel(date: Date) {
  const hours = date.getHours();
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(date.getMinutes()).padStart(2, "0")} ${suffix}`;
}

export function AppointmentActions({ reference, status }: AppointmentActionsProps) {
  const router = useRouter();
  const [showReschedule, setShowReschedule] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submittingSlot, setSubmittingSlot] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  if (status === "cancelled" || status === "completed") {
    return (
      <div className="mt-8 rounded-2xl border border-[#dbe3ef] bg-white px-5 py-5 text-sm text-[#53627a] sm:px-7">
        <p className="font-semibold text-[#0a2540]">
          {status === "cancelled" ? "This appointment is cancelled." : "This appointment is complete."}
        </p>
      </div>
    );
  }

  function openReschedule() {
    setShowReschedule(true);
    setError("");
    if (slots.length === 0) {
      setLoadingSlots(true);
      fetch(`/api/bookings/${encodeURIComponent(reference)}/slots`)
        .then((response) => response.json() as Promise<{ ok: boolean; slots?: Slot[]; error?: string }>)
        .then((data) => {
          if (!data.ok) throw new Error(data.error ?? "Could not load available times.");
          setSlots(data.slots ?? []);
        })
        .catch(() => setError("We couldn't load available times. Please try again."))
        .finally(() => setLoadingSlots(false));
    }
  }

  function chooseSlot(slot: Slot) {
    setSubmittingSlot(slot.startsAt);
    setError("");
    fetch(`/api/bookings/${encodeURIComponent(reference)}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsAt: slot.startsAt }),
    })
      .then((response) => response.json() as Promise<{ ok: boolean; error?: string }>)
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Could not reschedule this visit.");
        setShowReschedule(false);
        router.refresh();
      })
      .catch((err: Error) => setError(err.message || "That time just got booked. Please pick another."))
      .finally(() => setSubmittingSlot(null));
  }

  function confirmCancel() {
    setCancelling(true);
    setError("");
    fetch(`/api/bookings/${encodeURIComponent(reference)}/cancel`, { method: "POST" })
      .then((response) => response.json() as Promise<{ ok: boolean; error?: string }>)
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Could not cancel this visit.");
        setShowCancelConfirm(false);
        router.refresh();
      })
      .catch((err: Error) => setError(err.message || "We couldn't cancel this visit. Please try again."))
      .finally(() => setCancelling(false));
  }

  const groupedSlots = slots.reduce<Record<string, Slot[]>>((groups, slot) => {
    const key = dateKey(new Date(slot.startsAt));
    groups[key] = [...(groups[key] ?? []), slot];
    return groups;
  }, {});

  return (
    <div className="mt-8 rounded-2xl border border-[#dbe3ef] bg-white px-5 py-5 sm:px-7">
      {error && (
        <Alert className="mb-4 border-[#f3aaa0] bg-[#fff3f0] text-[#8f3d30]">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!showReschedule ? (
        <div className="flex flex-col gap-4 text-sm text-[#53627a] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-[#0a2540]">Need to change something?</p>
            <p className="mt-1">Move your visit to a new time or cancel it below.</p>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={openReschedule} className="gap-2">
              <CalendarClock aria-hidden="true" className="size-4" /> Reschedule
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => { setShowCancelConfirm(true); setError(""); }}
              className="gap-2"
            >
              <X aria-hidden="true" className="size-4" /> Cancel appointment
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between">
            <p className="font-semibold text-[#0a2540]">Pick a new time</p>
            <button
              type="button"
              onClick={() => setShowReschedule(false)}
              className="text-sm font-semibold text-[#53627a] hover:text-[#635bff]"
            >
              Close
            </button>
          </div>
          <p className="mt-1 text-xs text-[#8898aa]">Next 7 days · matched against live groomer availability</p>

          {loadingSlots && <p className="mt-4 text-sm text-[#53627a]">Checking available times…</p>}

          {!loadingSlots && slots.length === 0 && (
            <p className="mt-4 text-sm text-[#53627a]">No other times are available right now. Please try again later or call us.</p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {Object.entries(groupedSlots).map(([key, dateSlots]) => (
              <div key={key}>
                <p className="mb-2 text-sm font-bold text-[#0a2540]">
                  {formatDateLabel(new Date(dateSlots[0].startsAt))}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {dateSlots.map((slot) => (
                    <button
                      type="button"
                      key={slot.startsAt}
                      disabled={submittingSlot !== null}
                      onClick={() => chooseSlot(slot)}
                      className="rounded-md border border-[#dbe3ef] bg-white px-3 py-3 text-sm font-bold text-[#425466] hover:border-[#635bff] disabled:opacity-50"
                    >
                      {submittingSlot === slot.startsAt ? "Saving…" : formatTimeLabel(new Date(slot.startsAt))}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a2540]/40 px-5">
          <div className="w-full max-w-sm rounded-2xl border border-[#dbe3ef] bg-white p-6 shadow-[0_28px_80px_rgba(10,37,64,0.24)]">
            <p className="text-lg font-bold text-[#0a2540]">Cancel this appointment?</p>
            <p className="mt-2 text-sm text-[#53627a]">This can&apos;t be undone. You&apos;ll need to book a new visit if you change your mind.</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelling}
              >
                Keep appointment
              </Button>
              <Button type="button" variant="destructive" onClick={confirmCancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Yes, cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
