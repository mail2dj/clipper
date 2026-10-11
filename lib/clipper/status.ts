export const APPOINTMENT_STATUSES = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

type StatusDisplay = { label: string; className: string };

const STATUS_DISPLAY: Record<AppointmentStatus, StatusDisplay> = {
  pending: {
    label: "Pending",
    className: "border-[#e4d5a3] bg-[#fff8dc] text-[#775d13]",
  },
  confirmed: {
    label: "Confirmed",
    className: "border-[#bfe8db] bg-[#e7f8f1] text-[#08775d]",
  },
  completed: {
    label: "Completed",
    className: "border-[#cbd8ff] bg-[#eef1ff] text-[#4353a3]",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-[#f3c4c0] bg-[#fff0ef] text-[#9f3f38]",
  },
};

export function getStatusDisplay(status: string): StatusDisplay {
  return (
    STATUS_DISPLAY[status as AppointmentStatus] ?? {
      label: status || "Booked",
      className: STATUS_DISPLAY.completed.className,
    }
  );
}

// A visit is upcoming while it is still open (pending/confirmed) and has not ended yet.
export function isUpcoming(
  appointment: { status: string; endsAt: string | Date },
  now: Date = new Date(),
): boolean {
  return (
    (appointment.status === "pending" || appointment.status === "confirmed") &&
    new Date(appointment.endsAt).getTime() > now.getTime()
  );
}
