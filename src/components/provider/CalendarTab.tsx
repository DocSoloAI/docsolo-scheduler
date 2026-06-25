import { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import rrulePlugin from "@fullcalendar/rrule";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/context/SettingsContext";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { toast } from "react-hot-toast";

import { fromUTCToTZ, fromTZToUTC, formatInTZ } from "@/utils/timezone";

// === Email helper ===
async function sendDualEmail(
  templateType: "confirmation" | "update" | "cancellation" | "reminder",
  providerId: string,
  appointment: any,
  previousAppointment?: {
    previousDate?: string;
    previousTime?: string;
  }
) {
  const patient = Array.isArray(appointment.patients)
    ? appointment.patients[0]
    : appointment.patients;

  const service = Array.isArray(appointment.services)
    ? appointment.services[0]
    : appointment.services;

  const { data: provider, error: provError } = await supabase
    .from("providers")
    .select(
      "first_name, last_name, office_name, phone, street, city, state, zip, email, subdomain"
    )
    .eq("id", providerId)
    .single();

  if (provError) {
    console.error("❌ Could not fetch provider details:", provError.message);
  }

  const appointmentData = {
    patientName: `${patient?.first_name || ""} ${patient?.last_name || ""}`,
    patientEmail: patient?.email || "",
    patientPhone: patient?.cell_phone || "",

    // New appointment date/time
    date: new Date(appointment.start_time).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    time: new Date(appointment.start_time).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),

    // Previous appointment date/time for update emails
    previousDate: previousAppointment?.previousDate || "",
    previousTime: previousAppointment?.previousTime || "",

    service: service?.name || "",
    appointmentId: appointment.id,
    manageLink:
      provider?.subdomain && appointment?.manage_token
        ? `https://${provider.subdomain}.bookthevisit.com/manage/${appointment.id}?token=${appointment.manage_token}`
        : "",

    officeName: provider?.office_name || "",
    providerName: provider?.first_name
      ? `${provider.first_name} ${provider.last_name}`
      : provider?.office_name || "Your provider",
    location: [provider?.street, provider?.city, provider?.state, provider?.zip]
      .filter(Boolean)
      .join(", "),
    providerPhone: provider?.phone || "",
  };

  // 🩵 Patient email (non-blocking)
  try {
    if (patient?.email) {
      const { error: patientError } = await supabase.functions.invoke(
        "sendTemplatedEmail",
        {
          body: { templateType, to: patient.email, providerId, appointmentData },
        }
      );
      if (patientError) throw patientError;
    }
  } catch (err: any) {
    console.warn("⚠️ Non-blocking patient email error:", err.message);
  }

  // 💼 Provider email (non-blocking)
  try {
    if (provider?.email) {
      const providerTemplateType =
        templateType === "confirmation"
          ? "provider_confirmation"
          : templateType === "update"
          ? "provider_update"
          : templateType === "cancellation"
          ? "provider_cancellation"
          : templateType;

      const { error: provMailError } = await supabase.functions.invoke(
        "sendTemplatedEmail",
        {
          body: {
            templateType: providerTemplateType,
            to: provider.email,
            providerId,
            appointmentData,
          },
        }
      );
      if (provMailError) throw provMailError;
    }
  } catch (err: any) {
    console.warn("⚠️ Non-blocking provider email error:", err.message);
  }
}


interface AppointmentEvent {
  id: string;
  title?: string; // ✅ optional for background/availability events
  start: string | Date; // ✅ allow Date objects (required for FullCalendar)
  end: string | Date;
  display?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps?: any;
}

interface AppointmentRow {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  patient_id?: string;
  service_id?: string;
  patient_note?: string | null;
  patients?: { first_name: string; last_name: string; email?: string }[];
  services?: { name: string; color?: string }[];
}


export default function CalendarTab({ providerId }: { providerId: string }) {
  const { availability: ctxHours } = useSettings();
  const [providerTimezone, setProviderTimezone] = useState("America/New_York");

  const [currentView] = useState("timeGridWeek");
  const [timeOffMode, setTimeOffMode] = useState<"hours" | "day" | "range">(
    "hours"
  );

  const { services, patients, loading, reload, availability } = useSettings();
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // 🧠 Helper to mark form as dirty on any change
  const markDirty = () => setIsDirty(true);

  const hasAppointmentChanges = () => {
    if (!editingEvent || isTimeOff || !selectedDate) return true;

    const originalStart = new Date(editingEvent.start).getTime();
    const currentStart = new Date(selectedDate).getTime();

    const originalDuration =
      editingEvent.start && editingEvent.end
        ? Math.round(
            (new Date(editingEvent.end).getTime() -
              new Date(editingEvent.start).getTime()) /
              60000
          )
        : duration;

    const currentDuration = Number(duration);

    return (
      originalStart !== currentStart ||
      String(editingEvent.patient_id || "") !== String(selectedPatient || "") ||
      String(editingEvent.service_id || "") !== String(selectedService || "") ||
      originalDuration !== currentDuration
    );
  };

  const safeReload = async () => {
    await reload();
  };

  // 🕓 derive earliest & latest hours from provider availability — convert UTC→local first
  const [minTime, setMinTime] = useState("08:00:00");
  const [maxTime, setMaxTime] = useState("18:00:00");

  useEffect(() => {
    if (!availability || availability.length === 0 || !providerTimezone) return;

    const active = availability.filter((d: any) => d.is_active ?? d.enabled);
    if (active.length === 0) return;

    const startTimes = active.map((d: any) => new Date(`1970-01-01T${d.start_time}`));
    const endTimes   = active.map((d: any) => new Date(`1970-01-01T${d.end_time}`));


    const toMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
    const earliest = Math.min(...startTimes.map(toMinutes));
    const latest = Math.max(...endTimes.map(toMinutes));
    const buffer = 60;

    const toTimeString = (mins: number) =>
      `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(
        mins % 60
      ).padStart(2, "0")}:00`;

    setMinTime(toTimeString(Math.max(0, earliest - buffer)));
    setMaxTime(toTimeString(Math.min(24 * 60, latest + buffer)));
  }, [availability, providerTimezone]);



  const [events, setEvents] = useState<AppointmentEvent[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmType, setConfirmType] = useState<"appointment" | "time_off">(
    "appointment"
  );
  const [isRepeating, setIsRepeating] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState(1);
  const [repeatUnit, setRepeatUnit] = useState<"days" | "weeks">("weeks");
  const [repeatUntil, setRepeatUntil] = useState<string>("");
  const [timeOffReason, setTimeOffReason] = useState("");

  const showConfirm = (
    message: string,
    action: () => void,
    type: "appointment" | "time_off" = "appointment"
  ) => {
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmType(type);
    setConfirmOpen(true);
  };

  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(30);
  const [isTimeOff, setIsTimeOff] = useState(false);
  const [isAvailability, setIsAvailability] = useState(false);

  const [saving, setSaving] = useState(false);
  const [sendUpdateEmail, setSendUpdateEmail] = useState(true);
  const sendUpdateEmailRef = useRef(true);
  const [seriesDeleteOpen, setSeriesDeleteOpen] = useState(false);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const calendarRef = useRef<any>(null);

useEffect(() => {
  const loadProviderTimezone = async () => {
    if (!providerId) return;
    const { data, error } = await supabase
      .from("providers")
      .select("timezone")
      .eq("id", providerId)
      .single();
    if (error) {
      console.error("❌ Error loading provider timezone:", error.message);
      return;
    }
    if (data?.timezone) setProviderTimezone(data.timezone);
  };
  loadProviderTimezone();
}, [providerId]);

useEffect(() => {
  const handleResize = () => {
    if (calendarRef.current) {
      calendarRef.current.getApi().updateSize();
    }
  };
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, []);

useEffect(() => {
  const storedDate = localStorage.getItem("calendarFocusDate");
  if (!storedDate) return;

  const target = new Date(storedDate);
  if (isNaN(target.getTime())) return;

const tryGoto = () => {
  const api = calendarRef.current?.getApi?.();
  if (api) {
    api.gotoDate(target);
    localStorage.removeItem("calendarFocusDate");
    clearInterval(timer);

    // 🕓 Wait for FullCalendar to render cells before highlighting
    setTimeout(() => {
      const ymd = target.toISOString().split("T")[0];
      const cell = document.querySelector(`[data-date="${ymd}"]`);
      if (cell) {
        // Target the inner day content element, not the <td> itself
        const inner = cell.querySelector(".fc-daygrid-day-frame, .fc-daygrid-day-top") as HTMLElement;
        if (inner) {
          inner.classList.add("day-pulse");
          setTimeout(() => inner.classList.remove("day-pulse"), 1500);
        } else {
          // fallback
          cell.classList.add("day-pulse");
          setTimeout(() => cell.classList.remove("day-pulse"), 1500);
        }
      }
    }, 250); // wait ¼ second after render
  }
};


  const timer = setInterval(tryGoto, 200);
  const timeout = setTimeout(() => clearInterval(timer), 2000);

  return () => {
    clearInterval(timer);
    clearTimeout(timeout);
  };
}, []);

// 🩵 Load provider one-off availability overrides (read-only background)
async function loadAvailabilityOverrides() {
  // 🔍 Track when this runs

  if (!providerId) {
    console.warn("⚠️ Skipping overrides load — providerId missing");
    return [];
  }

  const { data, error } = await supabase
    .from("availability_overrides")
    .select("id, start_time, end_time, is_active, note")
    .eq("provider_id", providerId)
    .eq("is_active", true); // ✅ explicitly match true

  if (error) {
    console.error("❌ Error loading availability overrides:", error.message);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  const mapped = (data || [])
    .map((r) => {
      // 🧩 Safe parser for Postgres timestamptz and nulls
      const safeDate = (ts?: string | null) => {
        if (!ts || typeof ts !== "string") return null;
        const cleaned = ts.trim();
        if (cleaned === "" || cleaned.toLowerCase() === "null") return null;

        // Normalize Postgres output: "YYYY-MM-DD hh:mm:ss" → ISO
        const normalized =
          cleaned.includes("T") ? cleaned : cleaned.replace(" ", "T");

        // Append Z if no timezone info present
        const hasTZ = /[zZ]|[+\-]\d\d:?(\d\d)?$/.test(normalized);
        const iso = hasTZ ? normalized : normalized + "Z";

        const d = new Date(iso);
        if (isNaN(d.getTime())) {
          console.warn("⚠️ Skipping invalid timestamp:", ts);
          return null;
        }
        return d;
      };


      const start = safeDate(r.start_time);
      const end = safeDate(r.end_time);
      if (!start || !end) return null; // ✅ skip invalid or null rows

      return {
        id: `avail-${r.id}`,
        title: "",
        start,
        end,
        allDay: false,
        display: "auto",
        overlap: true,
        editable: false,
        backgroundColor: "#E0F7FA",
        borderColor: "transparent",
        textColor: "transparent",
        classNames: ["availability-block"],
        extendedProps: {
          status: "availability_override",
          source: "availability_override",
        },
      };
    })
    .filter(Boolean); // ✅ strip out nulls so loadEvents never fails

  return mapped;

}



  // ✅ Resilient calendar loader that merges appointments + time off reliably
  const loadEvents = async () => {
    try {
      // ---------- Load Appointments ----------
      const { data: appts, error: apptError } = await supabase
        .from("appointments")
        .select(`
          id, start_time, end_time, status, patient_id, service_id, patient_note,
          patients ( first_name, last_name, email ),
          services ( name, color )
        `)
        .eq("provider_id", providerId)
        .not("status", "eq", "cancelled") as unknown as { data: AppointmentRow[]; error: any };

      if (apptError) throw new Error(apptError.message);

      // 🟩 Corrected appointment mapping
      const mappedAppts =
        appts?.map((appt: any) => {
          const patient = Array.isArray(appt.patients)
            ? appt.patients[0]
            : appt.patients;
          const serviceColor = appt.services?.color || "#3b82f6";
          const color = appt.status === "time_off" ? "#fca5a5" : serviceColor;

          // ✅ Parse UTC timestamp from database → local Date in provider timezone
          const parseAppointmentTime = (utcString: string) => {
            return fromUTCToTZ(utcString, providerTimezone);
          };

          // ✅ Use the new helper
          const startFixed = parseAppointmentTime(appt.start_time);
          const endFixed = parseAppointmentTime(appt.end_time);

          return {
            id: appt.id,
            title:
              appt.status === "time_off"
                ? "OFF"
                : `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim(),
            start: startFixed,
            end: endFixed,
            backgroundColor: color,
            borderColor: color,
            textColor: "#fff",
            extendedProps: {
              source: "appointments",
              patient_id: appt.patient_id,
              service_id: appt.service_id,
              status: appt.status,
              patient_note: appt.patient_note || null,
              patient_first_name: patient?.first_name || "",
              patient_last_name: patient?.last_name || "",
            },
          };
        }) ?? [];


        // ---------- Load Time-Off ----------
        const { data: offs, error: offError } = await supabase
          .from("time_off")
          .select("id, start_time, end_time, off_date, reason, meta_repeat, all_day")
          .eq("provider_id", providerId);

        if (offError) throw new Error(offError.message);

        // ✅ Normalize and include off_date-based records
        const mappedOffs =
          (offs || [])
            .map((o) => {
              try {
                const isHoliday = o.reason?.startsWith("holiday:");
                let start: Date | null = null;
                let end: Date | null = null;

                // 🟩 Full-day off (off_date + all_day)
                if (o.off_date && o.all_day) {
                  const dateStr = o.off_date.trim();
                  if (dateStr) {
                    const [year, month, day] = dateStr.split("-").map(Number);
                    start = new Date(year, month - 1, day, 0, 0, 0, 0);
                    end = new Date(year, month - 1, day, 23, 59, 59, 999);
                  }
                }

                // 🟦 Partial-day off (start_time + end_time)
                if (!start && o.start_time && o.end_time) {
                  const startStr = String(o.start_time).trim();
                  const endStr = String(o.end_time).trim();
                  if (startStr && endStr) {
                    const startUTC = new Date(startStr.includes("T") ? startStr : startStr.replace(" ", "T") + "Z");
                    const endUTC = new Date(endStr.includes("T") ? endStr : endStr.replace(" ", "T") + "Z");
                    if (!isNaN(startUTC.getTime()) && !isNaN(endUTC.getTime())) {
                      start = fromUTCToTZ(startUTC.toISOString(), providerTimezone);
                      end = fromUTCToTZ(endUTC.toISOString(), providerTimezone);
                    }
                  }
                }

                // 🧩 Repeating meta_repeat with start_date
                if (!start && o.meta_repeat?.start_date) {
                  const base = fromUTCToTZ(o.meta_repeat.start_date, providerTimezone);
                  start = new Date(base);
                  end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);
                }

                if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
                  console.warn("⏭️ Skipping bad time_off record:", o);
                  return null;
                }

                return {
                  id: o.id,
                  title: isHoliday ? "Office Closed" : o.reason || "OFF",
                  start,
                  end,
                  allDay: false, // ✅ Force time-grid rendering even for full-day events                  display: "auto",
                  backgroundColor: isHoliday ? "#fde68a" : "#fecaca",
                  borderColor: isHoliday ? "#facc15" : "#f87171",
                  textColor: isHoliday ? "#78350f" : "#7f1d1d",
                  extendedProps: {
                    source: "time_off",
                    status: "time_off",
                    meta_repeat: o.meta_repeat || null,
                  },
                };
              } catch (err) {
                console.error("⚠️ Error parsing time_off record:", o, err);
                return null;
              }
            })
            .filter(Boolean);

        // ---------- Merge & Render ----------
        const overrides = await loadAvailabilityOverrides();

        const baseAvailability = (ctxHours || [])
          .filter((a: any) => a.is_active !== false)
          .map((a: any) => ({
            id: `base-${a.day_of_week}-${a.start_time}`,
            daysOfWeek: [a.day_of_week],
            startTime: a.start_time.slice(0, 5),
            endTime: a.end_time.slice(0, 5),
            display: "background",
            backgroundColor: "#E0F7FA",
            borderColor: "transparent",
            textColor: "transparent",
            extendedProps: { status: "base_availability" },
          }));

          const allEvents = [
            ...(baseAvailability || []),
            ...(mappedOffs || []),
            ...(mappedAppts || []),
            ...(overrides || []), // ✅ render on top
          ];

        // ✅ Force FullCalendar to reload fresh events
        if (calendarRef.current) {
          const api = calendarRef.current.getApi();
          api.removeAllEvents();

          // Add all events to calendar
          allEvents.forEach((e: any) => {
            api.addEvent(e);
          });
        }
        
        // ✅ Keep React state in sync so prop-based re-renders don’t wipe changes
        setEvents(allEvents.filter(Boolean) as AppointmentEvent[]);

        } catch (err: any) {
          console.error("❌ loadEvents failed:", err.message);
        }
          };


  useEffect(() => {
    if (!providerId || !ctxHours || ctxHours.length === 0) {
      return;
    }

    loadEvents();

    // 🧠 Debounce helper — prevents overlapping reloads from firing too fast
    let reloadTimer: NodeJS.Timeout | null = null;
    const triggerReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        loadEvents();
      }, 400); // adjust delay if needed
    };

    // 🪄 Subscribe to realtime updates for both appointments and time_off
    const channel = supabase
      .channel("calendar-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          triggerReload();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_off",
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          triggerReload();
        }
      )
      .subscribe();

    // 🧹 Cleanup on unmount
        return () => {
          supabase.removeChannel(channel);
          if (reloadTimer) clearTimeout(reloadTimer);
        };
      }, [providerId, ctxHours]);


  const resetForm = () => {
    setModalOpen(false);
    setEditingEvent(null);
    setSelectedDate(null);
    setEndDate(null);
    setSelectedPatient(null);
    setSelectedService(null);
    setDuration(30);
    setIsTimeOff(false);
    setIsAvailability(false);
    setSendUpdateEmail(true);
    sendUpdateEmailRef.current = true;

    // 🧩 Reset repeating + time-off fields
    setIsRepeating(false);
    setRepeatFrequency(1);
    setRepeatUnit("weeks");
    setRepeatUntil("");
    setTimeOffReason("");
    setTimeOffMode("hours");

    // 🧹 Clean flags
    setIsDirty(false);
  };


  const handleDateClick = (info: any) => {
    setEditingEvent(null);
    setIsTimeOff(false);

    if (info.allDay) {
      // 🕓 Create local midnight → 23:59 block
      const start = new Date(info.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      setTimeOffMode("day");
      setIsTimeOff(true);
      setSelectedDate(start);
      setEndDate(end);
      setModalOpen(true);

      return;
    }

    // ⏰ Normal partial-day logic
    setTimeOffMode("hours");
    const start = new Date(info.date);
    const end = new Date(start.getTime() + 30 * 60000);
    setSelectedDate(start);
    setEndDate(end);
    setModalOpen(true);
  };



  const handleSelect = (info: any) => {
    setEditingEvent(null);
    setIsAvailability(false);
    setIsTimeOff(true);
    setTimeOffMode("hours");

    const start = new Date(info.start);
    const end = new Date(info.end);

    setSelectedDate(start);
    setEndDate(end);
    setModalOpen(true);
  };

  const handleEventClick = async (info: any) => {
    const event = info.event;
    const status = event.extendedProps?.status;

    // 🩵 Delete one-off availability blocks
    if (status === "availability_override") {
      info.jsEvent.preventDefault();
      info.jsEvent.stopPropagation();

      toast(
        (t) => (
          <div>
            <p className="text-sm font-medium">Delete this availability block?</p>
            <div className="flex justify-end gap-2 mt-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  try {
                    const id = event.id.replace("avail-", "");
                    const { error } = await supabase
                      .from("availability_overrides")
                      .delete()
                      .eq("id", id);

                    if (error) throw error;

                    await loadEvents();
                    toast.dismiss(t.id);
                    toast.success("Availability deleted");
                  } catch (err: any) {
                    console.error("❌ Error deleting availability:", err.message);
                    toast.error("Error deleting availability.");
                  }
                }}
              >
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.dismiss(t.id)}
              >
                Undo
              </Button>
            </div>
          </div>
        ),
        { duration: 5000 }
      );

      return;
    }


    // ignore true background blocks
    if (event.display === "background") return;

    // normal modal logic
    const isOff = event.extendedProps.status === "time_off";

    // ✅ Convert UTC times from FullCalendar back to local JS Dates
    const startLocal = new Date(event.start);
    const endLocal = new Date(event.end);

    setEditingEvent({
      id: event.id,
      start: startLocal,
      end: endLocal,
      patient_id: event.extendedProps.patient_id,
      patient_first_name: event.extendedProps.patient_first_name,
      patient_last_name: event.extendedProps.patient_last_name,
      service_id: event.extendedProps.service_id,
      status: event.extendedProps.status,
      patient_note: event.extendedProps.patient_note || null,
    });

    setSelectedDate(startLocal);
    setEndDate(endLocal);
    setSelectedPatient(event.extendedProps.patient_id || null);
    setSelectedService(event.extendedProps.service_id || null);
    setDuration((endLocal.getTime() - startLocal.getTime()) / 60000);

    setIsTimeOff(isOff);
    setModalOpen(true);
  };


  const handleEventDrop = async (info: any) => {
    // Immediately revert the visual change until confirmed
    info.revert();

    const status = info.event.extendedProps?.status;
    const source = info.event.extendedProps?.source;
    const isTimeOff =
      status === "time_off" ||
      source === "time_off" ||
      info.event.title?.toLowerCase()?.includes("off");

    showConfirm(
      `Move this ${isTimeOff ? "time off" : "appointment"} from ${info.oldEvent.start?.toLocaleString()} to ${info.event.start?.toLocaleString()}?`,
      async () => {
        const start = info.event.start;
        const end = info.event.end;

        try {
          if (isTimeOff) {
            // 🟥 Move a time-off block
            const { error: offErr } = await supabase
              .from("time_off")
              .update({
                start_time: fromTZToUTC(start, providerTimezone).toISOString(), // ✅ NEW
                end_time: fromTZToUTC(end, providerTimezone).toISOString(),     // ✅ NEW
              })
              .eq("id", info.event.id);

            if (offErr) throw offErr;

            toast.success("Time off moved ✅");
            await loadEvents();
            return;
          }

          // 🟦 Move a patient appointment
          const { data: updated, error } = await supabase
            .from("appointments")
            .update({
              start_time: fromTZToUTC(start, providerTimezone).toISOString(), // ✅ NEW
              end_time: fromTZToUTC(end, providerTimezone).toISOString(),     // ✅ NEW

            })
            .eq("id", info.event.id)
            .select(
              "id, start_time, manage_token, patients(first_name,last_name,email,cell_phone), services(name)"              
            )
            .single();

          if (error) throw error;

          await safeReload();
          if (updated) {
            const previousDate = info.oldEvent.start
              ? new Date(info.oldEvent.start).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "";

            const previousTime = info.oldEvent.start
              ? new Date(info.oldEvent.start).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "";
            if (sendUpdateEmailRef.current) {
              await sendDualEmail("update", providerId, updated, {
                previousDate,
                previousTime,
              });
            }
          }
          toast.success("Appointment moved ✅");
        } catch (err: any) {
          console.error("❌ Error updating event:", err.message);
          toast.error("Error moving event: " + err.message);
        }
      },
      isTimeOff ? "time_off" : "appointment"
    );
  };

  const handleEventResize = async (info: any) => {
    // Immediately revert the visual change until confirmed
    info.revert();

    const status = info.event.extendedProps?.status;
    const source = info.event.extendedProps?.source;
    const isTimeOff =
      status === "time_off" ||
      source === "time_off" ||
      info.event.title?.toLowerCase()?.includes("off");

    const oldDuration = Math.round(
      (info.oldEvent.end - info.oldEvent.start) / 60000
    );
    const newDuration = Math.round((info.event.end - info.event.start) / 60000);

    showConfirm(
      `Change this ${isTimeOff ? "time off" : "appointment"} from ${oldDuration} minutes to ${newDuration} minutes?`,
      async () => {
        const start = info.event.start;
        const end = info.event.end;

        try {
          if (isTimeOff) {
            // 🟥 Resize a time-off block
            const { error: offErr } = await supabase
              .from("time_off")
              .update({
                start_time: fromTZToUTC(start, providerTimezone).toISOString(),
                end_time: fromTZToUTC(end, providerTimezone).toISOString(),
              })
              .eq("id", info.event.id);

            if (offErr) throw offErr;

            toast.success("Time off resized ✅");
            await loadEvents();
            return;
          }

          // 🟦 Resize a patient appointment
          const { data: updated, error } = await supabase
            .from("appointments")
            .update({
              start_time: fromTZToUTC(start, providerTimezone).toISOString(),
              end_time: fromTZToUTC(end, providerTimezone).toISOString(),
            })
            .eq("id", info.event.id)
            .select(
              "id, start_time, manage_token, patients(first_name,last_name,email,cell_phone), services(name)"              
            )
            .single();

          if (error) throw error;

          await safeReload();
          if (updated) {
            const previousDate = info.oldEvent.start
              ? new Date(info.oldEvent.start).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "";

            const previousTime = info.oldEvent.start
              ? new Date(info.oldEvent.start).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "";

            if (sendUpdateEmailRef.current) {
              await sendDualEmail("update", providerId, updated, {
                previousDate,
                previousTime,
              });
            }
          }          
          toast.success("Appointment resized ✅");
        } catch (err: any) {
          console.error("❌ Error resizing event:", err.message);
          toast.error("Error resizing event: " + err.message);
        }
      },
      isTimeOff ? "time_off" : "appointment"
    );
  };

  const handleSave = async () => {
    if (!selectedDate) return;
    setSaving(true);

  const start = selectedDate instanceof Date ? selectedDate : new Date(selectedDate);
  const svc = services.find((s) => String(s.id) === String(selectedService));
  const svcDuration = svc?.duration_minutes ?? duration;

  // Used for time off / availability blocks, where the user may choose a custom end time.
  const end =
    endDate instanceof Date
      ? endDate
      : new Date(endDate || start.getTime() + svcDuration * 60000);

  // Used for patient appointments, where the end time should follow the selected service duration.
  const appointmentEnd = new Date(start.getTime() + svcDuration * 60000);

    try {
      // 🧩 1️⃣ UPDATE existing appointment or time off
      if (editingEvent) {
        if (isTimeOff) {
          const isFullDay =
            start.getHours() === 0 &&
            start.getMinutes() === 0 &&
            end.getHours() === 23 &&
            end.getMinutes() === 59;

          const updateData: any = {
            reason: timeOffReason || "Time Off",
            all_day: isFullDay,
          };

          if (isFullDay) {
            updateData.off_date = selectedDate.toISOString().slice(0, 10);
            updateData.start_time = null;
            updateData.end_time = null;
          } else {
            updateData.start_time = fromTZToUTC(start, providerTimezone).toISOString(); // ✅ NEW
            updateData.end_time = fromTZToUTC(end, providerTimezone).toISOString();     // ✅ NEW
            updateData.off_date = null;
          }

          const { error: offErr } = await supabase
            .from("time_off")
            .update(updateData)
            .eq("id", editingEvent.id);

          if (offErr) throw offErr;

          toast.success("Time off updated ✅");
          await loadEvents();
          resetForm();
          setSaving(false);
          return;
        }

        // Appointment update
        const { data: updated, error } = await supabase
          .from("appointments")
          .update({
            start_time: fromTZToUTC(start, providerTimezone).toISOString(), // ✅ NEW
            end_time: fromTZToUTC(appointmentEnd, providerTimezone).toISOString(),            
            status: "booked",
            patient_id: selectedPatient,
            service_id: selectedService,
          })
          .eq("id", editingEvent.id)
          .select(
            "id, start_time, manage_token, patients(first_name,last_name,email,cell_phone), services(name)"
          )          
          .single();

        if (error) throw error;

        await safeReload();
        resetForm();
        if (updated && sendUpdateEmail) {
          const previousDate = editingEvent.start
            ? new Date(editingEvent.start).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "";

          const previousTime = editingEvent.start
            ? new Date(editingEvent.start).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })
            : "";

          await sendDualEmail("update", providerId, updated, {
            previousDate,
            previousTime,
          });
        }       
        setSaving(false);
        return;
      }

      // 🧩 2️⃣ CREATE repeating time off series
      if (isTimeOff && isRepeating) {
        const repeats: any[] = [];
        const groupId = crypto.randomUUID();
        const until = repeatUntil
          ? new Date(repeatUntil)
          : (() => {
              const d = new Date();
              d.setFullYear(d.getFullYear() + 1);
              return d;
            })();

        const baseDuration = (end.getTime() - start.getTime()) / 60000;
        const isFullDay =
          start.getHours() === 0 &&
          start.getMinutes() === 0 &&
          end.getHours() === 23 &&
          end.getMinutes() === 59;

        let current = new Date(start);
        while (current <= until) {
          const [y, m, d] = [
            current.getFullYear(),
            current.getMonth(),
            current.getDate(),
          ];

          if (isFullDay) {
            // 🟩 full-day repeating off
            repeats.push({
              provider_id: providerId,
              off_date: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(
                2,
                "0"
              )}`,
              all_day: true,
              reason: timeOffReason || "Repeating full-day time off",
              meta_repeat: {
                group_id: groupId,
                frequency: repeatFrequency,
                unit: repeatUnit,
                reason: timeOffReason || "Repeating time off",
                start_date: fromTZToUTC(start, providerTimezone).toISOString(),
              },

            });
          } else {
            // 🕓 partial repeating off
            const endCurrent = new Date(current.getTime() + baseDuration * 60000);
            repeats.push({
              provider_id: providerId,
              start_time: fromTZToUTC(current, providerTimezone).toISOString(),  // ✅ NEW
              end_time: fromTZToUTC(endCurrent, providerTimezone).toISOString(), // ✅ NEW
              reason: timeOffReason || "Repeating time off",
              meta_repeat: {
                group_id: groupId,
                frequency: repeatFrequency,
                unit: repeatUnit,
                reason: timeOffReason || "Repeating time off",
                start_date: fromTZToUTC(start, providerTimezone).toISOString(), // ✅ NEW
              },
            });
          }

          current.setDate(
            current.getDate() +
              (repeatUnit === "weeks" ? repeatFrequency * 7 : repeatFrequency)
          );
        }

        const { error: repeatErr } = await supabase.from("time_off").insert(repeats);
        if (repeatErr) throw repeatErr;

        await safeReload();
        resetForm();
        toast.success(`✅ Added ${repeats.length} repeating time-off blocks`);
        setSaving(false);
        return;
      }


      // 🟩 3️⃣ CREATE one-off availability override
      if (isAvailability) {
        const { error: availErr } = await supabase
          .from("availability_overrides")
          .insert([
            {
              provider_id: providerId,
              start_time: selectedDate.toISOString(), // ✅ directly save ISO string
              end_time: endDate?.toISOString(),
              is_active: true,
              note: "One-off availability",
            },
          ]);

        if (availErr) {
          console.error("❌ Error adding availability:", availErr.message);
          toast.error("Error adding availability");
          setSaving(false);
          return;
        }

        // ✅ Immediately refresh UI
        await loadEvents();
        resetForm();
        toast.success("Added custom availability");
        setSaving(false);
        return;
      }


      // 🟥 4️⃣ CREATE new single time-off block
      if (isTimeOff) {
        const isFullDay =
          start.getHours() === 0 &&
          start.getMinutes() === 0 &&
          end.getHours() === 23 &&
          end.getMinutes() === 59;

        const insertData: any = {
          provider_id: providerId,
          reason: timeOffReason || "Time Off",
          all_day: isFullDay,
          off_date: isFullDay ? selectedDate.toISOString().slice(0,10) : null,
          start_time: isFullDay ? null : fromTZToUTC(start, providerTimezone).toISOString().slice(0,19).replace("T"," "),
          end_time: isFullDay ? null : fromTZToUTC(end, providerTimezone).toISOString().slice(0,19).replace("T"," "),
        };


        if (isFullDay) {
          insertData.off_date = selectedDate.toISOString().slice(0, 10);
        } else {
          insertData.start_time = fromTZToUTC(start, providerTimezone).toISOString().slice(0, 19).replace('T', ' ');
          insertData.end_time = fromTZToUTC(end, providerTimezone).toISOString().slice(0, 19).replace('T', ' ');
        }

        const { data: newOff, error: offErr } = await supabase
          .from("time_off")
          .insert([insertData])
          .select()
          .single();

        if (offErr) throw offErr;

        // 🧩 Instant render for full-day off
        if (calendarRef.current && isFullDay && newOff) {
          const api = calendarRef.current.getApi();
          api.addEvent({
            id: newOff.id,
            title: "OFF",
            start: new Date(`${insertData.off_date}T00:00:00`),
            end: new Date(`${insertData.off_date}T23:59:59`),
            allDay: false, // ✅ ensures full-day column fill
            display: "auto",
            backgroundColor: "#fecaca",
            borderColor: "#f87171",
            textColor: "#7f1d1d",
            extendedProps: { source: "time_off", status: "time_off" },
          });
        }

        await loadEvents();
        resetForm();
        toast.success("Time off added ✅");
        setSaving(false);
        return;
      }

      // 🩵 5️⃣ CREATE new appointment
      const { data: newAppt, error: apptErr } = await supabase
        .from("appointments")
        .insert([
          {
            provider_id: providerId,
            start_time: fromTZToUTC(start, providerTimezone).toISOString(),
            end_time: fromTZToUTC(appointmentEnd, providerTimezone).toISOString(),
            status: "booked",
            patient_id: selectedPatient,
            service_id: selectedService,
          },
        ])
        .select(
          "id, start_time, manage_token, patients(first_name,last_name,email,cell_phone), services(name)"
        )
        .single();

      if (apptErr) throw apptErr;

      // ✅ Refresh the calendar and send notifications
      await loadEvents();
      resetForm();
      if (newAppt) await sendDualEmail("confirmation", providerId, newAppt);
      toast.success("Appointment saved ✅");
      setSaving(false);
      return;

    } catch (err: any) {
      console.error("❌ handleSave failed:", err);
      toast.error(`Error saving: ${err.message}`);
      setSaving(false);
    }
  };

  const renderEventContent = (eventInfo: any) => {
    const { event, view } = eventInfo;
    const { status } = event.extendedProps;

    if (view.type === "dayGridMonth") {
      return null;
    }

    if (status === "time_off") {
      return (
        <div className="flex items-center justify-center h-full px-1 text-[11px] font-semibold text-red-800 bg-red-100 rounded-sm">
          OFF
        </div>
      );
    }

    return (
      <div className="px-1 py-0.5 text-[11px] leading-tight text-white rounded-sm">
        <div className="font-medium truncate">{event.title}</div>
      </div>
    );
  };

const handleDelete = async () => {
  if (!editingEvent) return;

  try {
    // ✅ Robust detection for Time-Off events
    const isTimeOff = (() => {
      const props = editingEvent.extendedProps || {};
      const title = editingEvent.title?.toLowerCase?.() || "";
      const status =
        editingEvent.status?.toLowerCase?.() ||
        props.status?.toLowerCase?.() ||
        "";
      const source =
        editingEvent.source?.toLowerCase?.() ||
        props.source?.toLowerCase?.() ||
        "";
      const reason = props.reason?.toLowerCase?.() || "";
      return (
        title.includes("off") ||
        title.includes("closed") ||
        status.includes("off") ||
        status.includes("time_off") ||
        source.includes("off") ||
        source.includes("time_off") ||
        reason.includes("off") ||
        reason.includes("closed")
      );
    })();

    // ---------- 🟥 TIME-OFF ----------
    if (isTimeOff) {
      // 1️⃣ Identify if part of repeating group
      const { data: match, error: matchErr } = await supabase
        .from("time_off")
        .select("id, meta_repeat, provider_id")
        .eq("id", editingEvent.id)
        .maybeSingle();

      if (matchErr) throw matchErr;
      const groupId = match?.meta_repeat?.group_id ?? null;

      // 2️⃣ Delete record(s)
      if (groupId && pendingGroupId === groupId) {
        await supabase
          .from("time_off")
          .delete()
          .eq("provider_id", providerId)
          .eq("meta_repeat->>group_id", groupId);
      } else {
        await supabase
          .from("time_off")
          .delete()
          .eq("id", editingEvent.id)
          .eq("provider_id", providerId);
      }

      // 3️⃣ Clear and reload the calendar
      setEvents([]);
      if (calendarRef.current) {
        const api = calendarRef.current.getApi();
        api.removeAllEvents();
      }

      const { data: refreshedOffs, error: reloadErr } = await supabase
        .from("time_off")
        .select("id, start_time, end_time, reason")
        .eq("provider_id", providerId);

      if (!reloadErr && refreshedOffs) {
        const mappedOffs = refreshedOffs.map((o) => ({
          id: o.id,
          title: o.reason || "Closed",
          start: o.start_time,
          end: o.end_time,
          backgroundColor: "#fca5a5",
          borderColor: "#fca5a5",
          textColor: "#fff",
          extendedProps: { status: "time_off", source: "time_off" },
        }));
        setEvents(mappedOffs);
        if (calendarRef.current) {
          const api = calendarRef.current.getApi();
          mappedOffs.forEach((e) => api.addEvent(e));
        }
      }

      // 4️⃣ Reset modal/UI
      resetForm();
      setModalOpen(false);
      setEditingEvent(null);
      setPendingGroupId(null);
      setSeriesDeleteOpen(false);

      // ✅ Reload everything so availability + appointments reappear
      await loadEvents();

      return;
    }

    // ---------- 🟦 APPOINTMENT ----------
    const { data: appt, error: fetchErr } = await supabase
      .from("appointments")
      .select(
        "id, start_time, patients(first_name,last_name,email), services(name)"
      )
      .eq("id", editingEvent.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    const { error: delErr } = await supabase
      .from("appointments")
      .delete()
      .eq("id", editingEvent.id);

    if (delErr) throw delErr;


    // 🔄 Refresh UI
    await loadEvents();

    // 🧹 Reset modal + local state
    resetForm();
    setModalOpen(false);
    setEditingEvent(null);
    setPendingGroupId(null);
    setSeriesDeleteOpen(false);


    // ✉️ Send cancellation email only for patient appointments
    let patient: any = null;

    if (appt?.patients) {
      patient = Array.isArray(appt.patients)
        ? appt.patients[0] ?? null
        : appt.patients;
    }

    if (patient?.first_name && appt?.services) {
          await sendDualEmail("cancellation", providerId, appt);
        }
  } catch (err: any) {
    console.error("❌ Delete failed:", err);
    toast.error(`Error deleting: ${err.message}`);
  }
};

// 🧩 Patch: freeze FullCalendar's scrollbar compensation once mounted
useEffect(() => {
  if (!calendarRef.current) return;

  const calendarApi = calendarRef.current.getApi();
  const origUpdateSize = calendarApi.updateSize;
  calendarApi.updateSize = function () {
    document.querySelectorAll(".fc-scroller").forEach((el) => {
      (el as HTMLElement).style.paddingRight = "0px";
      (el as HTMLElement).style.marginRight = "0px";
    });
    try {
      return origUpdateSize.call(this);
    } catch (e) {
      console.warn("🧩 updateSize patch caught:", e);
    }
  };
}, []);


// 🟩 keep the conditional after all hooks
if (loading) return <div className="p-4 text-gray-500">Loading calendar…</div>;

  return (
    <div className="p-2">
      <div className="calendar-wrapper relative w-full overflow-hidden">
        <style>
        {`
          .fc-header-toolbar {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            gap: 0.3rem !important;
          }

          .fc-toolbar-title {
            display: block !important;
            width: 100% !important;
            text-align: center !important;
            font-size: 1rem !important;
            font-weight: 600 !important;
            margin-bottom: 0.3rem !important;
            order: -1 !important;
          }

          .fc-toolbar-chunk {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            width: 100% !important;
          }

          @media (max-width: 640px) {
            .fc-toolbar-chunk {
              justify-content: center !important;
              flex-wrap: wrap !important;
              gap: 0.4rem !important;
            }
          }

          /* ✅ Force availability events above background */
          .z-top-override {
            z-index: 9999 !important;
            position: relative !important;
          }
            /* ✅ Full-height teal availability block (not wafer thin) */
          .availability-block {
            height: 100% !important;
            min-height: 100% !important;
            border-radius: 0 !important;
            opacity: 1 !important;
          }

          .availability-block .fc-event-main {
            height: 100% !important;
            min-height: 100% !important;
            background-color: #E0F7FA !important;
            border: none !important;
          }
        `}
        </style>

        {/* 🌀 Step 2: Spinner overlay */}
        {saving && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-[9999]">
            <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, rrulePlugin]}
          initialView={currentView}
          timeZone="local"
          eventTimeFormat={{
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }}
          height="auto"
          fixedWeekCount
          showNonCurrentDates
          slotMinTime={minTime}
          slotMaxTime={maxTime}
          scrollTime={minTime}

          selectable
          editable
          events={events}
          select={handleSelect}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventContent={renderEventContent}
          handleWindowResize={false}
          titleFormat={{ year: "numeric", month: "short", day: "numeric" }}

          /* ✅ Single, elegant toolbar */
          headerToolbar={{
            start: "title",
            center: "prev,next,today viewDropdown",
            end: "",
          }}

          customButtons={{
            viewDropdown: {
              text: "View",
              click: function (e) {
                const menuId = "fc-view-dropdown-menu";
                let menu = document.getElementById(menuId);

                if (menu) {
                  menu.remove();
                  document.removeEventListener("click", handleOutsideClick);
                  document.removeEventListener("scroll", handleScroll, true);
                  return;
                }

                menu = document.createElement("div");
                menu.id = menuId;
                menu.style.position = "absolute";
                menu.style.background = "rgba(255, 255, 255, 0.9)";
                menu.style.border = "1px solid #d1d5db";
                menu.style.borderRadius = "12px";
                menu.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
                menu.style.padding = "6px 0";
                menu.style.zIndex = "9999";
                menu.style.fontSize = "0.9rem";
                menu.style.minWidth = "150px";
                menu.style.touchAction = "manipulation";
                // @ts-ignore
                menu.style.webkitTapHighlightColor = "transparent";
                menu.style.backdropFilter = "blur(6px)";
                // @ts-ignore
                menu.style.webkitBackdropFilter = "blur(6px)";
                menu.style.overflow = "hidden";

                const views = [
                  { key: "dayGridMonth", label: "Month" },
                  { key: "timeGridWeek", label: "Week" },
                  { key: "timeGridDay", label: "Day" },
                ];
                const currentView = calendarRef.current?.getApi()?.view?.type;

                views.forEach((v, i) => {
                  const item = document.createElement("div");
                  item.textContent = v.label;
                  item.style.padding = "10px 16px";
                  item.style.cursor = "pointer";
                  item.style.userSelect = "none";
                  item.style.fontWeight = v.key === currentView ? "600" : "500";
                  item.style.color =
                    v.key === currentView ? "#111827" : "#374151";
                  item.style.background =
                    v.key === currentView ? "#f3f4f6" : "transparent";

                  if (i === 0)
                    item.style.borderTopLeftRadius =
                      item.style.borderTopRightRadius =
                        "12px";
                  if (i === views.length - 1)
                    item.style.borderBottomLeftRadius =
                      item.style.borderBottomRightRadius =
                        "12px";

                  item.addEventListener("mouseover", () => {
                    if (v.key !== currentView) item.style.background = "#f9fafb";
                  });
                  item.addEventListener("mouseout", () => {
                    if (v.key !== currentView) item.style.background = "transparent";
                  });

                  item.addEventListener("click", () => {
                    calendarRef.current?.getApi()?.changeView(v.key);
                    closeMenu();
                  });

                  menu.appendChild(item);
                });

                const rect = (e.target as HTMLElement).getBoundingClientRect();
                const menuWidth = 150;
                const screenWidth = window.innerWidth;

                let left = rect.left;
                if (left + menuWidth > screenWidth - 8)
                  left = screenWidth - menuWidth - 8;

                menu.style.left = `${left}px`;
                menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
                document.body.appendChild(menu);

                function closeMenu() {
                  menu?.remove();
                  document.removeEventListener("click", handleOutsideClick);
                  document.removeEventListener("scroll", handleScroll, true);
                }
                function handleOutsideClick(ev: MouseEvent) {
                  if (!menu?.contains(ev.target as Node)) closeMenu();
                }
                function handleScroll() {
                  closeMenu();
                }

                setTimeout(() => {
                  document.addEventListener("click", handleOutsideClick);
                  document.addEventListener("scroll", handleScroll, true);
                }, 50);
              },
            },
          }}

          /* ✅ Views and cell formatting */
          views={{
            dayGridMonth: { dayHeaderFormat: { weekday: "short" } },
            timeGridWeek: {
              dayHeaderFormat: { weekday: "short", day: "numeric" },
            },
            timeGridDay: {
              dayHeaderFormat: { weekday: "long", day: "numeric" },
            },
          }}
          
          eventBackgroundColor="#E0F7FA"
          eventDisplay="auto"
          eventColor="#E0F7FA"
          eventDidMount={(info) => {
            if (info.event.display === "background") {
              info.el.style.pointerEvents = "none";
            }
          }}

          dayCellContent={(arg) => {
            if (arg.view.type === "dayGridMonth") {
              const dayEvents = events.filter((e) => {
                if (!e.start) return false;
                const eventDate = new Date(e.start as string).toDateString();
                return eventDate === arg.date.toDateString();
              });

              const bookedCount = dayEvents.filter(
                (e) => e.extendedProps?.status === "booked"
              ).length;
              const hasClosure = dayEvents.some(
                (e) => e.extendedProps?.status === "time_off"
              );

              return (
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium">{arg.date.getDate()}</span>
                  {bookedCount > 0 && (
                    <div className="inline-block px-1 mt-0.5 text-[10px] rounded-full bg-green-600 text-white">
                      {bookedCount}
                    </div>
                  )}
                  {hasClosure && <div className="mt-0.5 text-red-500 text-sm">🚫</div>}
                </div>
              );
            }
            return arg.dayNumberText;
          }}
          
        />


      {/* Appointment Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setTimeout(() => {
              const firstInput = document.querySelector("input, select, textarea");
              if (firstInput instanceof HTMLElement) firstInput.focus();
            }, 50);
          }}
          className="sm:max-w-lg ..."
        >

          {/* 🧩 Hidden header for accessibility only (no visible spacing) */}
          <VisuallyHidden>
            <DialogHeader>
              <DialogTitle>
                {editingEvent
                  ? isTimeOff
                    ? "Edit Time Off"
                    : "Edit Appointment"
                  : "New Appointment"}
              </DialogTitle>
              <DialogDescription>
                Modal for creating or editing appointments or time off.
              </DialogDescription>
            </DialogHeader>
          </VisuallyHidden>


          {/* ===== Scrollable Body ===== */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* 🧭 Mode Selector — only visible when creating new entry */}
            {!editingEvent && (
              <div className="mt-2 mb-6 text-center">
                <p className="text-sm text-gray-500 mb-3">
                  What would you like to add?
                </p>
                <div className="flex justify-center gap-3">
                  {/* Appointment */}
                  <button
                    onClick={() => {
                      setIsTimeOff(false);
                      setIsAvailability(false);
                      markDirty();
                    }}
                    className={`flex-1 max-w-[150px] py-2.5 rounded-lg font-medium border transition-all duration-150 ${
                      !isTimeOff && !isAvailability
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Appointment
                  </button>

                  {/* Time Off */}
                  <button
                    onClick={() => {
                      setIsTimeOff(true);
                      setIsAvailability(false);
                      markDirty();
                    }}
                    className={`flex-1 max-w-[150px] py-2.5 rounded-lg font-medium border transition-all duration-150 ${
                      isTimeOff
                        ? "bg-red-500 text-white border-red-500 shadow-sm hover:bg-red-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Time Off
                  </button>

                  {/* Availability */}
                  <button
                    onClick={() => {
                      setIsAvailability(true);
                      setIsTimeOff(false);
                      markDirty();
                    }}
                    className={`flex-1 max-w-[150px] py-2.5 rounded-lg font-medium border transition-all duration-150 ${
                      isAvailability
                        ? "bg-teal-500 text-white border-teal-500 shadow-sm hover:bg-teal-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Availability
                  </button>
                </div>

              </div>
            )}

            {/* 🧩 Conditional forms */}
            <div className="animate-fadeIn transition-all duration-300">
              {isAvailability ? (
                // 🟩 One-off Availability Form
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <Label>Start Time</Label>
                      <Select
                        value={selectedDate ? formatInTZ(selectedDate, providerTimezone, "HH:mm") : ""}
                        onValueChange={(value) => {
                          const [hours, minutes] = value.split(":").map(Number);
                          const updated = selectedDate ? new Date(selectedDate) : new Date();
                          updated.setHours(hours, minutes, 0, 0);
                          setSelectedDate(updated);
                          markDirty();
                        }}
                      >
                        <SelectTrigger className="font-sans tabular-nums font-medium">
                          <SelectValue placeholder="Select time..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {Array.from({ length: 288 }, (_, i) => {
                            const totalMinutes = i * 5;
                            const minutes = totalMinutes % 60;
                            // Skip :05, :25, :35, :50, :55
                            if (minutes === 5 || minutes === 25 || minutes === 35 || minutes === 50 || minutes === 55) return null;
                            
                            const hours = Math.floor(totalMinutes / 60);
                            const time24 = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
                            const hours12 = hours % 12 || 12;
                            const ampm = hours >= 12 ? "PM" : "AM";
                            const timeDisplay = `${hours12}:${String(minutes).padStart(2, "0")} ${ampm}`;
                            
                            return (
                              <SelectItem key={time24} value={time24} className="font-sans tabular-nums">
                                {timeDisplay}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>End Time</Label>
                      <Select
                        value={endDate ? formatInTZ(endDate, providerTimezone, "HH:mm") : ""}
                        onValueChange={(value) => {
                          const [hours, minutes] = value.split(":").map(Number);
                          const updated = selectedDate ? new Date(selectedDate) : new Date();
                          updated.setHours(hours, minutes, 0, 0);
                          setEndDate(updated);
                          markDirty();
                        }}
                      >
                        <SelectTrigger className="font-sans tabular-nums font-medium">
                          <SelectValue placeholder="Select time..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {Array.from({ length: 288 }, (_, i) => {
                            const totalMinutes = i * 5;
                            const minutes = totalMinutes % 60;
                            // Skip :05, :25, :35, :50, :55
                            if (minutes === 5 || minutes === 25 || minutes === 35 || minutes === 50 || minutes === 55) return null;
                            
                            const hours = Math.floor(totalMinutes / 60);
                            const time24 = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
                            const hours12 = hours % 12 || 12;
                            const ampm = hours >= 12 ? "PM" : "AM";
                            const timeDisplay = `${hours12}:${String(minutes).padStart(2, "0")} ${ampm}`;
                            
                            return (
                              <SelectItem key={time24} value={time24} className="font-sans tabular-nums">
                                {timeDisplay}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Note (optional)</Label>
                    <Input
                      type="text"
                      placeholder="e.g., Staying late today"
                      onChange={() => setIsDirty(true)}
                    />
                  </div>
                </div>
              ) : isTimeOff ? (
                // 🕒 Time Off Form
                <div className="space-y-4">
                  <div>
                    <Label>Time Off Type</Label>
                    <Select
                      value={timeOffMode}
                      onValueChange={(val) => {
                        setTimeOffMode(val as any);
                        markDirty();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Partial Day (hours)</SelectItem>
                        <SelectItem value="day">Full Day</SelectItem>
                        <SelectItem value="range">Date Range</SelectItem>
                      </SelectContent>
                    </Select>
                    {/* 🧩 Conditional inputs based on Time Off Type */}
                    {timeOffMode === "hours" && (
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <Label>Start Time</Label>
                          <Select
                            value={selectedDate ? formatInTZ(selectedDate, providerTimezone, "HH:mm") : ""}
                            onValueChange={(value) => {
                              const [hours, minutes] = value.split(":").map(Number);
                              const updated = selectedDate ? new Date(selectedDate) : new Date();
                              updated.setHours(hours, minutes, 0, 0);
                              setSelectedDate(updated);
                              markDirty();
                            }}
                          >
                            <SelectTrigger className="font-sans tabular-nums font-medium">
                              <SelectValue placeholder="Select time..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              {Array.from({ length: 288 }, (_, i) => {
                                const totalMinutes = i * 5;
                                const minutes = totalMinutes % 60;
                                // Skip :05, :25, :35, :55
                                if (minutes === 5 || minutes === 25 || minutes === 35 || minutes === 50 || minutes === 55) return null;                                
                                const hours = Math.floor(totalMinutes / 60);
                                const time24 = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
                                const hours12 = hours % 12 || 12;
                                const ampm = hours >= 12 ? "PM" : "AM";
                                const timeDisplay = `${hours12}:${String(minutes).padStart(2, "0")} ${ampm}`;
                                
                                return (
                                  <SelectItem key={time24} value={time24} className="font-sans tabular-nums">
                                    {timeDisplay}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>End Time</Label>
                          <Select
                            value={endDate ? formatInTZ(endDate, providerTimezone, "HH:mm") : ""}
                            onValueChange={(value) => {
                              const [hours, minutes] = value.split(":").map(Number);
                              const updated = selectedDate ? new Date(selectedDate) : new Date();
                              updated.setHours(hours, minutes, 0, 0);
                              setEndDate(updated);
                              markDirty();
                            }}
                          >
                            <SelectTrigger className="font-sans tabular-nums font-medium">
                              <SelectValue placeholder="Select time..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              {Array.from({ length: 288 }, (_, i) => {
                                const totalMinutes = i * 5;
                                const minutes = totalMinutes % 60;
                                // Skip :05, :25, :35, :55
                                if (minutes === 5 || minutes === 25 || minutes === 35 || minutes === 50 || minutes === 55) return null;                                
                                const hours = Math.floor(totalMinutes / 60);
                                const time24 = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
                                const hours12 = hours % 12 || 12;
                                const ampm = hours >= 12 ? "PM" : "AM";
                                const timeDisplay = `${hours12}:${String(minutes).padStart(2, "0")} ${ampm}`;
                                
                                return (
                                  <SelectItem key={time24} value={time24} className="font-sans tabular-nums">
                                    {timeDisplay}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {timeOffMode === "range" && (
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <Label>Start Date</Label>
                          <Input
                            type="date"
                            value={selectedDate ? new Date(selectedDate).toISOString().split("T")[0] : ""}
                              onChange={(e) => {
                                const start = new Date(e.target.value);
                                setSelectedDate(start); // ✅ use 'start' here, matches the variable you just created
                                markDirty();
                              }}
                          />
                        </div>
                        <div>
                          <Label>End Date</Label>
                          <Input
                            type="date"
                            onChange={(e) => {
                              const end = new Date(e.target.value);
                              const d = selectedDate ? new Date(selectedDate) : new Date();
                              const diff = (end.getTime() - d.getTime()) / 60000;
                              setDuration(diff > 0 ? diff : 0);
                              markDirty();
                            }}
                          />
                        </div>
                      </div>
                    )}

                  </div>

                  {/* 🆕 Repeating Time Off Section */}
                  <div className="space-y-3 pt-2 border-t border-gray-200 mt-4">
                    <div className="flex items-center gap-2">
                      <input
                        id="repeating"
                        type="checkbox"
                        checked={isRepeating}
                        onChange={(e) => {
                          setIsRepeating(e.target.checked);
                          markDirty();
                        }}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                      />
                      <Label htmlFor="repeating">Repeating time off?</Label>
                    </div>

                    {isRepeating && (
                      <div className="space-y-3 pl-1">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm text-gray-600">Repeat every</Label>
                          <Input
                            type="number"
                            min={1}
                            value={repeatFrequency}
                            onChange={(e) => setRepeatFrequency(Number(e.target.value))}
                            className="w-20"
                          />
                          <Select
                            value={repeatUnit}
                            onValueChange={(val) => setRepeatUnit(val as "days" | "weeks")}
                          >
                            <SelectTrigger className="w-[110px]">
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="days">Days</SelectItem>
                              <SelectItem value="weeks">Weeks</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm text-gray-600">
                            Repeat until (optional)
                          </Label>
                          <Input
                            type="date"
                            value={repeatUntil}
                            onChange={(e) => setRepeatUntil(e.target.value)}
                            className="max-w-xs"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Leave blank to repeat for 1 year ahead
                          </p>
                        </div>

                        <div>
                          <Label className="text-sm text-gray-600">Reason / Description</Label>
                          <Input
                            type="text"
                            placeholder="e.g., Closed for personal time"
                            value={timeOffReason}
                            onChange={(e) => setTimeOffReason(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
              ) : (
                // 💬 Appointment Form
                <div className="space-y-5">
                  {/* 🧍 Patient Selector */}
                  <div className="space-y-1">
                    <Label>Patient</Label>
                    {selectedPatient ? (
                      <div className="p-3 border rounded-md bg-gray-50 flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-800">
                            {patients.find((p) => p.id === selectedPatient)?.first_name}{" "}
                            {patients.find((p) => p.id === selectedPatient)?.last_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {patients.find((p) => p.id === selectedPatient)?.email}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedPatient("")}
                          className="ml-3 text-xs"
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between"
                          >
                            Select or search patient...
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0 max-h-[260px] overflow-y-auto rounded-md shadow-md">
                          <Command>
                            <CommandInput placeholder="Type a name or email..." />
                            <CommandList>
                              <CommandEmpty>No matches found.</CommandEmpty>
                              <CommandGroup>
                                {patients.map((p) => (
                                  <CommandItem
                                    key={p.id}
                                    value={`${p.first_name} ${p.last_name} ${p.email}`}
                                    onSelect={() => setSelectedPatient(p.id)}
                                  >
                                    <div className="flex flex-col">
                                      <span className="font-medium text-sm">
                                        {p.first_name} {p.last_name}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {p.email}
                                      </span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>

                  {/* 💼 Service */}
                  <div className="space-y-1">
                    <Label>Service</Label>
                    <Select
                      value={selectedService ?? ""}
                      onValueChange={(val) => {
                        setSelectedService(val);
                        const svc = services.find((s) => s.id === val);
                        if (svc?.duration_minutes)
                          setDuration(svc.duration_minutes);
                        markDirty();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* ⏱ Duration */}
                  <div className="space-y-1">
                    <Label>Duration (minutes)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={480}
                      value={duration === 0 ? "" : duration}
                      onChange={(e) =>
                        setDuration(
                          e.target.value === "" ? 0 : Number(e.target.value)
                        )
                      }
                    />
                  </div>

                  {/* 🗓 Date & Time */}
                  <div className="grid grid-cols-2 gap-4 items-end">
                    <div className="space-y-1">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        className="cursor-pointer"
                        value={
                          selectedDate
                            ? (() => {
                                const d = new Date(selectedDate);
                                const local = new Date(
                                  d.getTime() - d.getTimezoneOffset() * 60000
                                );
                                return local.toISOString().split("T")[0];
                              })()
                            : ""
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          if (!value) return;
                          const [y, m, day] = value.split("-").map(Number);
                          const current = selectedDate ? new Date(selectedDate) : new Date();
                          const newDate = new Date(
                            y,
                            m - 1,
                            day,
                            current.getHours(),
                            current.getMinutes()
                          );
                          setSelectedDate(newDate); // ✅ use the variable you created above
                          setIsDirty(true);
                        }}
                      />
                      <p className="text-xs text-gray-500">
                        Tap to change date
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label>Time</Label>
                      <select
                        className="w-full border rounded-md p-2 text-sm bg-white cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={
                          selectedDate
                            ? (() => {
                                const d = new Date(selectedDate);
                                let hours = d.getHours();
                                const minutes = d.getMinutes();
                                const ampm = hours >= 12 ? "PM" : "AM";
                                hours = hours % 12 || 12;
                                return `${hours}:${minutes
                                  .toString()
                                  .padStart(2, "0")} ${ampm}`;
                              })()
                            : ""
                        }
                        onChange={(e) => {
                          const [time, ampm] = e.target.value.split(" ");
                          let [hours, minutes] = time.split(":").map(Number);

                          if (ampm === "PM" && hours < 12) hours += 12;
                          if (ampm === "AM" && hours === 12) hours = 0;

                          const updated = selectedDate ? new Date(selectedDate) : new Date();
                          updated.setHours(hours, minutes, 0, 0);

                          setSelectedDate(updated); // ✅ keep as Date object, not ISO string
                          setIsDirty(true);
                        }}
                      >
                        <option value="">Select time...</option>
                        {Array.from({ length: 24 * 4 }, (_, i) => {
                          const totalMinutes = i * 15;
                          const hours24 = Math.floor(totalMinutes / 60);
                          const minutes = totalMinutes % 60;
                          const ampm = hours24 >= 12 ? "PM" : "AM";
                          const displayHour = hours24 % 12 || 12;
                          const label = `${displayHour}:${minutes
                            .toString()
                            .padStart(2, "0")} ${ampm}`;
                          return (
                            <option key={i} value={label}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-xs text-gray-500">
                        Select start time (15-minute intervals)
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ===== Fixed Footer ===== */}
          <div className="shrink-0 border-t border-gray-200 px-6 py-4 bg-white">
            {editingEvent && !isTimeOff && (
              <div className="flex justify-end mb-3">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={sendUpdateEmail}
                    onChange={(e) => {
                      setSendUpdateEmail(e.target.checked);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  Send patient and provider emails for this appointment change
                </label>
              </div>
            )}

            <div className="flex justify-between items-center">
              {/* Left: Cancel/Delete */}
              {editingEvent && !isTimeOff && (
                <Button
                  variant="destructive"
                  onClick={() =>
                    showConfirm(
                      "Are you sure you want to cancel this appointment?",
                      handleDelete
                    )
                  }
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  Cancel Appointment
                </Button>
              )}

              {editingEvent && isTimeOff && (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    try {
                      // check if this event is part of a repeating group
                      const { data: match, error } = await supabase
                        .from("time_off")
                        .select("meta_repeat")
                        .eq("id", editingEvent.id)
                        .maybeSingle();

                      if (error) throw error;

                      const groupId = match?.meta_repeat?.group_id || null;

                      if (groupId) {
                        // 🔁 repeating time-off → open custom delete-series dialog
                        setPendingGroupId(groupId);
                        setSeriesDeleteOpen(true);
                      } else {
                        // 🕐 one-time time-off → use standard confirm modal
                        showConfirm(
                          "Are you sure you want to delete this time off?",
                          async () => {
                            await handleDelete();
                          },
                          "time_off"
                        );
                      }
                    } catch (err: any) {
                      console.error("Delete button error:", err);
                      toast.error(`Error preparing delete: ${err.message}`);
                    }
                  }}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  Delete Time Off
                </Button>
              )}

              {/* Right: Close/Save */}
              <div className="flex justify-end gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (isDirty) setShowDiscardDialog(true);
                    else {
                      resetForm();
                      setIsDirty(false);
                    }
                  }}
                >
                  Close
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={
                    saving ||
                    (editingEvent && !isTimeOff && !hasAppointmentChanges()) ||
                    (editingEvent && isTimeOff && !isDirty)
                  }
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Confirmation Modal ===== */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {confirmType === "time_off"
                ? "Confirm Time-Off Change"
                : "Confirm Appointment Change"}
            </DialogTitle>
            <DialogDescription>{confirmMessage}</DialogDescription>
          </DialogHeader>

          {confirmType === "appointment" && (
            <div className="pt-3">
              <label className="flex items-start gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={sendUpdateEmail}
                  onChange={(e) => {
                    setSendUpdateEmail(e.target.checked);
                    sendUpdateEmailRef.current = e.target.checked;
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span>Send patient and provider emails for this appointment change</span>
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmAction) confirmAction();
                setConfirmOpen(false);
              }}
            >
              {confirmType === "time_off" ? "Confirm Time Off" : "Confirm Change"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🧩 Discard Changes Dialog */}
        <Dialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
          <DialogContent className="max-w-sm" data-centered>
            <DialogHeader>
              <DialogTitle>Discard unsaved changes?</DialogTitle>
              <DialogDescription>
                You’ve made changes that haven’t been saved.  
                If you close now, your edits will be lost.
              </DialogDescription>              
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowDiscardDialog(false)}>
                Keep Editing
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  resetForm();
                  setIsDirty(false);
                  setShowDiscardDialog(false);
                }}
              >
                Discard Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {/* 🧩 Delete Repeating Series Dialog */}
      <Dialog open={seriesDeleteOpen} onOpenChange={setSeriesDeleteOpen}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Repeating Time-Off</DialogTitle>
            <DialogDescription>
              This time-off is part of a repeating series. What would you like to do?
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 pt-4">
            <Button
              variant="destructive"
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                await handleDelete(); // entire series path
              }}
            >
              Delete Entire Series
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                setPendingGroupId(null);
                await handleDelete(); // single occurrence path
              }}
            >
              Delete Only This Occurrence
            </Button>

            <Button
              variant="outline"
              className="w-full text-gray-600"
              onClick={() => {
                setSeriesDeleteOpen(false);
                setPendingGroupId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

  </div>   
  );
}

