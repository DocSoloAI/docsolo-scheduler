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

// === Email helper ===
async function sendDualEmail(
  templateType: "confirmation" | "update" | "cancellation" | "reminder",
  providerId: string,
  appointment: any
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
      "first_name, last_name, office_name, phone, street, city, state, zip, email"
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
    date: new Date(appointment.start_time).toLocaleDateString(),
    time: new Date(appointment.start_time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    service: service?.name || "",
    appointmentId: appointment.id,
    manageLink: `https://${providerId}.bookthevisit.com/manage/${appointment.id}`,
    officeName: provider?.office_name || "",
    providerName: provider?.first_name
      ? `${provider.first_name} ${provider.last_name}`
      : provider?.office_name || "Your provider",
    location: [provider?.street, provider?.city, provider?.state, provider?.zip]
      .filter(Boolean)
      .join(", "),
    providerPhone: provider?.phone || "",
  };

  if (patient?.email) {
    const { error: patientError } = await supabase.functions.invoke(
      "sendTemplatedEmail",
      {
        body: { templateType, to: patient.email, providerId, appointmentData },
      }
    );
    if (patientError) {
      console.error(
        `❌ Patient ${templateType} email error:`,
        patientError.message
      );
    }
  }

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

    if (provMailError) {
      console.error(
        `❌ Provider ${providerTemplateType} email error:`,
        provMailError.message
      );
    }
  }

  console.log(
    `✅ ${templateType} emails requested for ${patient?.email} + provider`
  );
}

interface AppointmentEvent {
  id: string;
  title?: string; // ✅ optional for background/availability events
  start: string;
  end: string;
  display?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps?: any;
}

export default function CalendarTab({ providerId }: { providerId: string }) {
  const { availability: ctxHours } = useSettings();
  console.log("🧩 CalendarTab ctxHours on mount:", ctxHours);
  const [providerTimezone, setProviderTimezone] = useState("America/New_York");

  const [currentView] = useState("timeGridWeek");
  const [timeOffMode, setTimeOffMode] = useState<"hours" | "day" | "range">(
    "hours"
  );

  const { services, patients, loading, reload, availability } = useSettings();
  console.log("🕓 Provider availability from context:", availability);
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // 🧠 Helper to mark form as dirty on any change
  const markDirty = () => setIsDirty(true);
  
  const safeReload = async () => {
    console.log("🔄 safeReload called (view state =", currentView, ")");
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
  const [isRepeating, setIsRepeating] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState(1);
  const [repeatUnit, setRepeatUnit] = useState<"days" | "weeks">("weeks");
  const [repeatUntil, setRepeatUntil] = useState<string>("");
  const [timeOffReason, setTimeOffReason] = useState("");
  const showConfirm = (message: string, action: () => void) => {
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(30);
  const [isTimeOff, setIsTimeOff] = useState(false);
  const [isAvailability, setIsAvailability] = useState(false);

  const [saving, setSaving] = useState(false);
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
    console.log("📅 Navigated to stored date:", target.toISOString());
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
  const { data, error } = await supabase
    .from("availability_overrides")
    .select("id, start_time, end_time, is_active")
    .eq("provider_id", providerId);

  if (error) {
    console.error("❌ Error loading availability overrides:", error.message);
    return [];
  }

  // map rows → FullCalendar availability override events
  const mapped = (data || [])
    .filter((r) => r.is_active)
    .map((r) => ({
      id: `avail-${r.id}`,
      start: r.start_time,
      end: r.end_time,
      display: "auto", // ✅ allow normal event behavior
      interactive: true, // ✅ allow clicking for delete
      backgroundColor: "#E0F7FA", // same light teal
      borderColor: "#B2EBF2",
      textColor: "#004D40",
      extendedProps: { status: "availability_override" },
    }));

  console.log("🩵 Overrides loaded:", mapped.length);
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
          patients ( first_name, last_name ),
          services ( name, color )
        `)
        .eq("provider_id", providerId)
        .not("status", "eq", "cancelled"); // ✅ show all non-cancelled appointments

      if (apptError) throw new Error(apptError.message);
      console.log("📋 Appointments loaded:", appts?.length ?? 0);

      const mappedAppts =
        appts?.map((appt: any) => {
          const patient = Array.isArray(appt.patients)
            ? appt.patients[0]
            : appt.patients;
          const serviceColor = appt.services?.color || "#3b82f6";
          const color =
            appt.status === "time_off" ? "#fca5a5" : serviceColor;

          // 🕐 Keep times as JS Dates (FullCalendar will handle timezone)
          const startFixed = new Date(appt.start_time);
          const endFixed   = new Date(appt.end_time);

          return {
            id: appt.id,
            title:
              appt.status === "time_off"
                ? "OFF"
                : `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim(),
            start: startFixed, // ✅ no .toISOString()
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
            },
          };
        }) ?? [];



      // ---------- Load Time-Off ----------
      const { data: offs, error: offError } = await supabase
        .from("time_off")
        .select("id, start_time, end_time, reason, meta_repeat, all_day")
        .eq("provider_id", providerId);

      if (offError) throw new Error(offError.message);

      const mappedOffs =
        (offs || []).map((o) => {
          const isHoliday = o.reason?.startsWith("holiday:");
          const startFixed = new Date(o.start_time);
          const endFixed = new Date(o.end_time);

          // ✅ If it's an all-day block, render as a full background closure
          if (o.all_day) {
            return {
              id: o.id,
              title: "OFF",
              start: startFixed,
              end: endFixed,
              allDay: false, // ✅ force it into the hourly grid
              display: "auto", // ✅ make it interactive
              backgroundColor: "#fca5a5",
              borderColor: "#f87171",
              textColor: "#fff",
              extendedProps: { source: "time_off", status: "time_off" },
            };
          }


          // ⏰ Otherwise, partial-day time off block
          return {
            id: o.id,
            title: isHoliday ? "Office Closed" : o.reason || "Closed",
            start: startFixed,
            end: endFixed,
            allDay: false,
            backgroundColor: "#fca5a5",
            borderColor: "#fca5a5",
            textColor: "#fff",
            extendedProps: { source: "time_off", status: "time_off", meta_repeat: o.meta_repeat || null },
          };
        });




      // ---------- Merge & Render ----------
      const overrides = await loadAvailabilityOverrides();

      // 🩵 Build background events from provider's base availability
console.log("🔍 Raw ctxHours sample:", ctxHours.slice(0, 3));

      const baseAvailability = (ctxHours || [])
        .filter((a: any) => a.is_active !== false)
        .map((a: any) => ({
          id: `base-${a.day_of_week}-${a.start_time}`,
          daysOfWeek: [a.day_of_week],
          startTime: a.start_time.slice(0, 5), // keep exact stored HH:mm
          endTime: a.end_time.slice(0, 5),
          display: "background",
          backgroundColor: "#E0F7FA",
          borderColor: "transparent",
          textColor: "transparent",
          extendedProps: { status: "base_availability" },
        }));


    console.log("🩵 Base availability preview:", baseAvailability);

    // ✅ Merge everything together into one master array
    const allEvents = [
      ...mappedAppts,      // normal appointments
      ...mappedOffs,       // time-off blocks (from modal)
      ...overrides,        // one-off availability overrides (from modal)
      ...baseAvailability, // recurring base availability (from Hours tab)
    ];

    // ✅ Force FullCalendar to reload fresh events
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.removeAllEvents();
      allEvents.forEach((e) => api.addEvent(e));
    }

    console.log("🧩 First few events:", allEvents.slice(0, 3));
    console.log(`✅ Calendar reloaded: ${allEvents.length} total events`);



    // ✅ Debug logs
    console.log("🧩 First few events:", allEvents.slice(0, 3));
    console.log(`✅ Calendar reloaded: ${allEvents.length} total events`);
    } catch (err: any) {
      console.error("❌ loadEvents failed:", err.message);
    }
  };


  useEffect(() => {
    // ⏳ Wait until provider hours (ctxHours) are loaded
    if (!ctxHours || ctxHours.length === 0) {
      console.log("🕓 Skipping loadEvents — ctxHours not ready yet");
      return;
    }

    console.log("🚀 Running loadEvents with ctxHours count:", ctxHours.length);
    loadEvents();

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
        async () => {
          console.log("🔄 Realtime: appointments changed → refreshing calendar");
          await loadEvents();
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
        async () => {
          console.log("🔄 Realtime: time_off changed → refreshing calendar");
          await loadEvents();
        }
      )
      .subscribe();

    // 🧹 Cleanup on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [providerId, ctxHours]);




  const resetForm = () => {
    setModalOpen(false);
    setEditingEvent(null);
    setSelectedDate(null);
    setSelectedPatient(null);
    setSelectedService(null);
    setDuration(30);
    setIsTimeOff(false);
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

      console.log("🌞 All-day block clicked:", start.toString());
      return;
    }

    // ⏰ Normal partial-day logic
    setTimeOffMode("hours");
    const start = new Date(info.date);
    const end = new Date(start.getTime() + 30 * 60000);
    setSelectedDate(start);
    setEndDate(end);
    setModalOpen(true);
    console.log("🕐 Time block clicked:", start.toString());
  };



  const handleSelect = (info: any) => {
    setEditingEvent(null);
    setIsAvailability(false);
    setIsTimeOff(true);
    setTimeOffMode("hours");

    console.log("🕐 Raw select:", info.start, "→", info.end);

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

        // ✅ Convert to UTC so times stay correct after drag
        const toUTC = (d: Date) =>
          new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();

        try {
          if (isTimeOff) {
            // 🟥 Move a time-off block
            const { error: offErr } = await supabase
              .from("time_off")
              .update({
                start_time: toUTC(start),
                end_time: toUTC(end),
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
              start_time: toUTC(start),
              end_time: toUTC(end),
            })
            .eq("id", info.event.id)
            .select(
              "id, start_time, patients(first_name,last_name,email), services(name)"
            )
            .single();

          if (error) throw error;

          await safeReload();
          if (updated) await sendDualEmail("update", providerId, updated);
          toast.success("Appointment moved ✅");
        } catch (err: any) {
          console.error("❌ Error updating event:", err.message);
          toast.error("Error moving event: " + err.message);
        }
      }
    );
  };

  const handleSave = async () => {
    if (!selectedDate) return;
    setSaving(true);

    // Normalize date objects
    const start = selectedDate instanceof Date ? selectedDate : new Date(selectedDate);
    const svc = services.find((s) => String(s.id) === String(selectedService));
    const svcDuration = svc?.duration_minutes ?? duration;
    const end =
      endDate instanceof Date
        ? endDate
        : new Date(endDate || start.getTime() + svcDuration * 60000);

    // ✅ Helper: convert local → UTC ISO safely once
    const toUTC = (d: Date) =>
      new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();

    try {
      // 🧩 1. UPDATE existing appointment or time off
      if (editingEvent) {
        if (isTimeOff) {
          const isFullDay =
            start.getHours() === 0 &&
            start.getMinutes() === 0 &&
            end.getHours() === 23 &&
            end.getMinutes() === 59;

          // ✅ Use toUTC() instead of .toISOString()
          const { error: offErr } = await supabase
            .from("time_off")
            .update({
              start_time: toUTC(start),
              end_time: toUTC(end),
              reason: timeOffReason || "Time Off",
              all_day: isFullDay,
            })
            .eq("id", editingEvent.id);

          if (offErr) throw offErr;

          toast.success("Time off updated ✅");
          await loadEvents();
          resetForm();
          setSaving(false);
          return;
        }

        // ✅ Appointment update
        const { data: updated, error } = await supabase
          .from("appointments")
          .update({
            start_time: toUTC(start),
            end_time: toUTC(end),
            status: "booked",
            patient_id: selectedPatient,
            service_id: selectedService,
          })
          .eq("id", editingEvent.id)
          .select("id, start_time, patients(first_name,last_name,email), services(name)")
          .single();

        if (error) throw error;

        await safeReload();
        resetForm();
        if (updated) await sendDualEmail("update", providerId, updated);
        setSaving(false);
        return;
      }

      // 🧩 2. CREATE repeating time off series
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

        let current = new Date(start);
        while (current <= until) {
          const endCurrent = new Date(current.getTime() + duration * 60000);
          repeats.push({
            provider_id: providerId,
            start_time: toUTC(current),
            end_time: toUTC(endCurrent),
            reason: timeOffReason || "Repeating time off",
            meta_repeat: {
              group_id: groupId,
              frequency: repeatFrequency,
              unit: repeatUnit,
              reason: timeOffReason || "Repeating time off",
              start_date: toUTC(start),
            },
          });
          if (repeatUnit === "weeks") {
            current.setDate(current.getDate() + repeatFrequency * 7);
          } else {
            current.setDate(current.getDate() + repeatFrequency);
          }
        }

        const { error: repeatErr } = await supabase.from("time_off").insert(repeats);
        if (repeatErr) throw repeatErr;

        await safeReload();
        resetForm();
        toast.success(`Added ${repeats.length} repeating time-off blocks ✅`);
        setSaving(false);
        return;
      }

      // 🟩 3A. CREATE one-off availability override
      if (isAvailability) {
        const { error: availErr } = await supabase.from("availability_overrides").insert([
          {
            provider_id: providerId,
            start_time: toUTC(start),
            end_time: toUTC(end),
            note: "One-off availability",
          },
        ]);
        if (availErr) throw availErr;
        await loadEvents();
        resetForm();
        toast.success("Added custom availability");
        setSaving(false);
        return;
      }

      // 🟩 3B. CREATE single time-off block
      if (isTimeOff) {
        const isFullDay =
          start.getHours() === 0 &&
          start.getMinutes() === 0 &&
          end.getHours() === 23 &&
          end.getMinutes() === 59;

        const { data: newOff, error: offErr } = await supabase
          .from("time_off")
          .insert([
            {
              provider_id: providerId,
              start_time: toUTC(start),
              end_time: toUTC(end),
              reason: timeOffReason || "Time Off",
              all_day: isFullDay,
            },
          ])
          .select()
          .single();

        if (offErr) throw offErr;

        // 🧩 Instant render for full-day off
        if (calendarRef.current && isFullDay && newOff) {
          const api = calendarRef.current.getApi();
          api.addEvent({
            id: newOff.id,
            title: "OFF",
            start: new Date(newOff.start_time),
            end: new Date(newOff.end_time),
            allDay: false,
            display: "auto",
            backgroundColor: "#fca5a5",
            borderColor: "#f87171",
            textColor: "#fff",
            extendedProps: { source: "time_off", status: "time_off" },
          });
        }

        await loadEvents();
        resetForm();
        toast.success("Time off added ✅");
        setSaving(false);
        return;
      }

      // 🩵 4. CREATE new appointment
      const { data: newAppt, error: apptErr } = await supabase
        .from("appointments")
        .insert([
          {
            provider_id: providerId,
            start_time: toUTC(start),
            end_time: toUTC(end),
            status: "booked",
            patient_id: selectedPatient,
            service_id: selectedService,
          },
        ])
        .select("id, start_time, patients(first_name,last_name,email), services(name)")
        .single();

      if (apptErr) throw apptErr;

      await loadEvents();
      resetForm();
      if (newAppt) await sendDualEmail("confirmation", providerId, newAppt);
      toast.success("Appointment saved ✅");
      setSaving(false);
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
        console.log("🗑️ Deleted entire repeating series", groupId);
      } else {
        await supabase
          .from("time_off")
          .delete()
          .eq("id", editingEvent.id)
          .eq("provider_id", providerId);
        console.log("🗑️ Deleted single time-off block");
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

      console.log("✅ Time-off deleted and calendar fully refreshed");
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

    console.log("🗑️ Deleted appointment");

    // 🔄 Refresh UI
    await loadEvents();

    // 🧹 Reset modal + local state
    resetForm();
    setModalOpen(false);
    setEditingEvent(null);
    setPendingGroupId(null);
    setSeriesDeleteOpen(false);

    console.log("✅ Appointment deleted and calendar state refreshed");

    // ✉️ Send cancellation email only for patient appointments
    let patient: any = null;

    if (appt?.patients) {
      patient = Array.isArray(appt.patients)
        ? appt.patients[0] ?? null
        : appt.patients;
    }

    if (patient?.first_name && appt?.services) {
      await sendDualEmail("cancellation", providerId, appt);
      console.log("✉️ Sent cancellation email to patient + provider");
    } else {
      console.log("🧩 Skipped email — provider time off or non-patient event");
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
  console.log("🧩 FullCalendar updateSize patched");
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
        `}
        </style>

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
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="sm:max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden rounded-xl shadow-lg bg-white"
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
                      <Input
                        type="time"
                        value={
                          selectedDate
                            ? (() => {
                                const d = new Date(selectedDate);
                                return d.toTimeString().slice(0, 5);
                              })()
                            : ""
                        }
                        onChange={(e) => {
                          const [hours, minutes] = e.target.value.split(":").map(Number);
                          const updated = selectedDate ? new Date(selectedDate) : new Date();
                          updated.setHours(hours, minutes, 0, 0);
                          setSelectedDate(updated);
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div>
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={
                          endDate
                            ? (() => {
                                const d = new Date(endDate);
                                return d.toTimeString().slice(0, 5);
                              })()
                            : ""
                        }
                        onChange={(e) => {
                          const [hours, minutes] = e.target.value.split(":").map(Number);
                          const updated = endDate ? new Date(endDate) : new Date();
                          updated.setHours(hours, minutes, 0, 0);
                          setEndDate(updated);
                          setIsDirty(true);
                        }}
                      />
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
                          <Input
                            type="time"
                              value={
                                selectedDate
                                  ? (() => {
                                      const d = new Date(selectedDate);
                                      return d.toTimeString().slice(0, 5); // ✅ local HH:MM
                                    })()
                                  : ""
                              }
                            onChange={(e) => {
                              const [hours, minutes] = e.target.value.split(":").map(Number);
                              const updated = selectedDate ? new Date(selectedDate) : new Date();
                              updated.setHours(hours, minutes, 0, 0);
                              setSelectedDate(updated); // ✅ use 'updated', not 'newDate'
                              markDirty();
                            }}
                          />
                        </div>
                        <div>
                          <Label>End Time</Label>
                          <Input
                            type="time"
                            value={
                              endDate
                                ? (() => {
                                    const d = new Date(endDate);
                                    return d.toTimeString().slice(0, 5); // ✅ local HH:MM
                                  })()
                                : ""
                            }
                            onChange={(e) => {
                              const [hours, minutes] = e.target.value.split(":").map(Number);
                              const updated = endDate ? new Date(endDate) : new Date();
                              updated.setHours(hours, minutes, 0, 0);
                              setEndDate(updated); // ✅ update endDate state
                              setIsDirty(true);
                            }}
                          />
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
                          }
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
                <Button onClick={handleSave} disabled={saving}>
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
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>{confirmMessage}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmAction) confirmAction();
                setConfirmOpen(false);
              }}
            >
              Confirm
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

