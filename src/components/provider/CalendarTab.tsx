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
  title: string;
  start: string;
  end: string;
  backgroundColor?: string;
  extendedProps?: any;
}

export default function CalendarTab({ providerId }: { providerId: string }) {
  const calendarRef = useRef<any>(null);
  const [currentView, setCurrentView] = useState("timeGridWeek");
  const [timeOffMode, setTimeOffMode] = useState<"hours" | "day" | "range">(
    "hours"
  );

  const { services, patients, loading, reload } = useSettings();
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // 🧠 Helper to mark form as dirty on any change
  const markDirty = () => setIsDirty(true);
  
  const safeReload = async () => {
    console.log("🔄 safeReload called (view state =", currentView, ")");
    await reload();
  };

  const [events, setEvents] = useState<AppointmentEvent[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");

  const showConfirm = (message: string, action: () => void) => {
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(30);
  const [isTimeOff, setIsTimeOff] = useState(false);
  const [saving, setSaving] = useState(false);

  const colorPalette = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
  ];

  // ✅ Hoisted loadEvents so it’s reusable everywhere
  const loadEvents = async () => {
    const { data: appts, error: apptError } = await supabase
      .from("appointments")
      .select(`
        id, start_time, end_time, status, patient_id, service_id, patient_note,
        patients ( first_name, last_name ),
        services ( name )
      `)
      .eq("provider_id", providerId)
      .in("status", ["booked", "time_off"]);

    if (apptError) {
      console.error("Error loading appointments:", apptError.message);
      return;
    }

    const mappedAppts = appts.map((a: any) => {
      const patient = Array.isArray(a.patients) ? a.patients[0] : a.patients;
      const serviceIndex = services.findIndex((s) => s.id === a.service_id);
      const color =
        a.status === "time_off"
          ? "#fca5a5"
          : serviceIndex >= 0
          ? colorPalette[serviceIndex % colorPalette.length]
          : "#3b82f6";

      return {
        id: a.id,
        title:
          a.status === "time_off"
            ? "OFF"
            : `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim(),
        start: a.start_time,
        end: a.end_time,
        backgroundColor: color,
        borderColor: color,
        textColor: "#fff",
        extendedProps: {
          patient_id: a.patient_id,
          service_id: a.service_id,
          status: a.status,
          patient_note: a.patient_note || null,
        },
      };
    });

    const { data: offs, error: offError } = await supabase
      .from("time_off")
      .select("id, start_time, end_time, reason")
      .eq("provider_id", providerId);

    if (offError) {
      console.error("❌ Error loading time off:", offError.message);
    }

    const mappedOffs =
      offs?.map((o) => ({
        id: o.id,
        title: o.reason || "Closed",
        start: o.start_time,
        end: o.end_time,
        backgroundColor: "#fca5a5",
        extendedProps: { status: "time_off" },
      })) ?? [];

    setEvents([...mappedAppts, ...mappedOffs]);
  };

  useEffect(() => {
    // 🧭 Initial load
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
  }, [providerId]);



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

    if (info.allDay) {
      const start = new Date(info.date);
      start.setHours(0, 0, 0, 0);
      setSelectedDate(start.toISOString());
      setDuration(1440);
      setIsTimeOff(true);
      setIsTimeOff(true);
    } else {
      const start = new Date(info.date);
      setSelectedDate(start.toISOString());
      setDuration(30);
      setIsTimeOff(false);
      setIsTimeOff(false);
    }

    setModalOpen(true);
  };

  const handleSelect = (info: any) => {
    setEditingEvent(null);
    setIsTimeOff(true);
    setSelectedDate(info.startStr);
    const durationMinutes =
      (new Date(info.end).getTime() - new Date(info.start).getTime()) / 60000;
    setDuration(durationMinutes);
    setModalOpen(true);
  };

  const handleEventClick = (info: any) => {
    const event = info.event;
    const isOff = event.extendedProps.status === "time_off";

    setEditingEvent({
      id: event.id,
      start: event.startStr,
      end: event.endStr,
      patient_id: event.extendedProps.patient_id,
      service_id: event.extendedProps.service_id,
      status: event.extendedProps.status,
      patient_note: event.extendedProps.patient_note || null,
    });


    setSelectedDate(event.startStr);
    setSelectedPatient(event.extendedProps.patient_id || null);
    setSelectedService(event.extendedProps.service_id || null);
    setDuration(
      (new Date(event.endStr).getTime() - new Date(event.startStr).getTime()) /
        60000
    );

    setIsTimeOff(isOff);
    setIsTimeOff(isOff);
    setModalOpen(true);
  };

  const handleEventDrop = async (info: any) => {
    info.revert();

    showConfirm(
      `Move this appointment from ${info.oldEvent.start?.toLocaleString()} to ${info.event.start?.toLocaleString()}?`,
      async () => {
        const { data: updated, error } = await supabase
          .from("appointments")
          .update({
            start_time: info.event.start,
            end_time: info.event.end,
          })
          .eq("id", info.event.id)
          .select(
            "id, start_time, patients(first_name,last_name,email), services(name)"
          )
          .single();

        if (error) {
          console.error("❌ Error updating appointment:", error.message);
          return;
        }

        await safeReload();
        if (updated) {
          await sendDualEmail("update", providerId, updated);
        }
      }
    );
  };

  const handleSave = async () => {
    if (!selectedDate) return;
    setSaving(true);

    const start = new Date(selectedDate as string);
    const end = new Date(start.getTime() + duration * 60000);

    if (editingEvent) {
      const { data: updated, error } = await supabase
        .from("appointments")
        .update({
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: isTimeOff ? "time_off" : "booked",
          patient_id: isTimeOff ? null : selectedPatient,
          service_id: isTimeOff ? null : selectedService,
        })
        .eq("id", editingEvent.id)
        .select(
          "id, start_time, patients(first_name,last_name,email), services(name)"
        )
        .single();

      setSaving(false);
      if (error) {
        alert("Error updating: " + error.message);
        return;
      }

      await safeReload();
      resetForm();

      // ✅ Stay on the same date after saving
      if (calendarRef.current && selectedDate) {
        calendarRef.current.getApi().gotoDate(new Date(selectedDate));
      }

      if (!isTimeOff && updated) {
        await sendDualEmail("update", providerId, updated);
      }
      return;
    }

    const insertData: any = {
      provider_id: providerId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: isTimeOff ? "time_off" : "booked",
      patient_id: isTimeOff ? null : selectedPatient,
      service_id: isTimeOff ? null : selectedService,
    };

    const { data: newAppt, error } = await supabase
      .from("appointments")
      .insert(insertData)
      .select(
        "id, start_time, status, patients(first_name,last_name,email), services(name)"
      )
      .single();

    setSaving(false);
    if (error) {
      alert("Error saving: " + error.message);
      return;
    }

    await safeReload();
    resetForm();

    if (newAppt && newAppt.status !== "time_off") {
      await sendDualEmail("confirmation", providerId, newAppt);
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
      const isTimeOffDelete = editingEvent.status === "time_off";
      const table = isTimeOffDelete ? "appointments" : "appointments"; // both live in same table now

      // 🗑️ Delete the record
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", editingEvent.id);

      if (error) throw error;

      // ✅ Update local state immediately
      setEvents((prev) => prev.filter((e) => e.id !== editingEvent.id));

      // ✅ Reset form & close modal
      resetForm();
      setModalOpen(false);
      setEditingEvent(null);

      console.log(
        isTimeOffDelete
          ? "🗑️ Deleted time-off block"
          : "🗑️ Deleted appointment"
      );

      // ✉️ Send cancellation email for appointments only
      if (!isTimeOffDelete) {
        const { data: apptData, error: apptError } = await supabase
          .from("appointments")
          .select(
            "id, start_time, patients(first_name,last_name,email), services(name)"
          )
          .eq("id", editingEvent.id);

        if (apptError) {
          console.error("❌ Could not fetch appointment for email:", apptError.message);
        } else if (apptData && apptData.length > 0) {
          await sendDualEmail("cancellation", providerId, apptData[0]);
          console.log("✉️ Sent cancellation email to patient + provider");
        }
      }

      // ✅ Optional: trigger full reload if calendar is server-driven
      await loadEvents();

    } catch (err: any) {
      console.error("❌ Error deleting:", err);
      alert("Error deleting: " + err.message);
    }
  };
  
  // 🧩 Patch: freeze FullCalendar's scrollbar compensation once mounted
  useEffect(() => {
    if (!calendarRef.current) return;

    const calendarApi = calendarRef.current.getApi();
    const origUpdateSize = calendarApi.updateSize;

    // Override updateSize to ignore fake scrollbar width changes
    calendarApi.updateSize = function () {
      const scrollEls = document.querySelectorAll('.fc-scroller');
      scrollEls.forEach((el) => {
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

  if (loading) return <div className="p-4 text-gray-500">Loading calendar…</div>;


  return (
    <div className="p-2">
      <div className="calendar-wrapper relative w-full overflow-hidden">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={currentView}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          height="auto"
          fixedWeekCount={true}
          showNonCurrentDates={true}
          hiddenDays={[]}
          selectable
          select={handleSelect}
          editable
          events={events}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventContent={renderEventContent}
          viewDidMount={(arg) => setCurrentView(arg.view.type)}
          handleWindowResize={false}   // 👈 stops FullCalendar from re-measuring

          views={{
            dayGridMonth: { dayHeaderFormat: { weekday: "short" } },
            timeGridWeek: { dayHeaderFormat: { weekday: "short", day: "numeric" } },
            timeGridDay: { dayHeaderFormat: { weekday: "long", day: "numeric" } },
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
                {/* Always show date number */}
                <span className="text-xs font-medium">{arg.date.getDate()}</span>

                {/* If booked appts, show badge */}
                {bookedCount > 0 && (
                  <div className="inline-block px-1 mt-0.5 text-[10px] rounded-full bg-green-600 text-white">
                    {bookedCount}
                  </div>
                )}

                {/* If closed, show 🚫 */}
                {hasClosure && (
                  <div className="mt-0.5 text-red-500 text-sm">🚫</div>
                )}
              </div>
            );
          }

          // ✅ For week/day views, let FullCalendar handle defaults
          return arg.dayNumberText;
        }}
      />

      {/* Appointment Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="sm:max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden rounded-xl shadow-lg bg-white"
        >
          {/* Fixed Header — only shows for editing */}
          <DialogHeader className="shrink-0 border-b border-gray-200 px-6 py-3 bg-white sticky top-0 z-10">
            {editingEvent && (
              <DialogTitle className="text-lg font-semibold">
                {isTimeOff ? "Edit Time Off" : "Edit Appointment"}
              </DialogTitle>
            )}
          </DialogHeader>


          {/* ===== Scrollable Body ===== */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* 🧭 Mode Selector — only visible when creating new entry */}
            {!editingEvent && (
              <div className="mt-2 mb-6 text-center">
                <p className="text-sm text-gray-500 mb-3">
                  What would you like to add?
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => {
                      setIsTimeOff(false);
                      markDirty();
                    }}
                    className={`flex-1 max-w-[160px] py-2.5 rounded-lg font-medium border transition-all duration-150 ${
                      !isTimeOff
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Appointment
                  </button>
                  <button
                    onClick={() => {
                      setIsTimeOff(true);
                      markDirty();
                    }}
                    className={`flex-1 max-w-[160px] py-2.5 rounded-lg font-medium border transition-all duration-150 ${
                      isTimeOff
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Time Off
                  </button>
                </div>
              </div>
            )}

            {/* 🧩 Conditional forms */}
            <div className="animate-fadeIn transition-all duration-300">
              {isTimeOff ? (
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
                  </div>
                  {/* You can keep your existing time-off date/time inputs here */}
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
                          const current = selectedDate
                            ? new Date(selectedDate)
                            : new Date();
                          const newDate = new Date(
                            y,
                            m - 1,
                            day,
                            current.getHours(),
                            current.getMinutes()
                          );
                          setSelectedDate(newDate.toISOString());
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
                          const updated = selectedDate
                            ? new Date(selectedDate)
                            : new Date();
                          updated.setHours(hours, minutes, 0, 0);
                          setSelectedDate(updated.toISOString());
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
                  onClick={() =>
                    showConfirm(
                      "Are you sure you want to delete this time off?",
                      handleDelete
                    )
                  }
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
              You’ve made changes to this appointment that haven’t been saved.  
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
  </div>   
  );
}
