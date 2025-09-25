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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

  const safeReload = async () => {
    console.log("🔄 safeReload called (view state =", currentView, ")");
    await reload();
  };

  const [events, setEvents] = useState<AppointmentEvent[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"appointment" | "timeoff">(
    "appointment"
  );

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
    loadEvents();

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
          console.log("🔄 Realtime: appointments changed → fetching fresh data");
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
          console.log("🔄 Realtime: time_off changed → fetching fresh data");
          await loadEvents();
        }
      )
      .subscribe();

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
      setActiveTab("timeoff");
    } else {
      const start = new Date(info.date);
      setSelectedDate(start.toISOString());
      setDuration(30);
      setIsTimeOff(false);
      setActiveTab("appointment");
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
    setActiveTab(isOff ? "timeoff" : "appointment");
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

    if (editingEvent.status === "time_off") {
      await supabase.from("time_off").delete().eq("id", editingEvent.id);
      await loadEvents(); // ✅ immediately refresh events
      resetForm();
      console.log("🗑️ Deleted time-off block");
      return;
    }

    const { data: appts, error: apptError } = await supabase
      .from("appointments")
      .select(
        "id, start_time, patients(first_name,last_name,email), services(name)"
      )
      .eq("id", editingEvent.id);

    const appt = appts?.[0] || null;
    if (apptError) {
      console.error(
        "❌ Could not fetch appointment before delete:",
        apptError.message
      );
    }

    await supabase.from("appointments").delete().eq("id", editingEvent.id);
    await loadEvents(); // ✅ refresh events immediately
    resetForm();

    if (appt) {
      await sendDualEmail("cancellation", providerId, appt);
    }
    console.log("🗑️ Deleted appointment and sent cancellation email");
  };


  if (loading) return <div className="p-4 text-gray-500">Loading calendar…</div>;

  return (
    <div className="p-2">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "Edit" : "Add"} Appointment / Time Off
            </DialogTitle>
            <DialogDescription>
              Fill out the form below to save or update this entry.
            </DialogDescription>
          </DialogHeader>

          {/* Tabs for appointment vs time off */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as any)}
          >
            <TabsList
              className={`w-full mb-4 ${
                isTimeOff ? "grid grid-cols-1" : "grid grid-cols-2"
              }`}
            >
              <TabsTrigger value="appointment">Appointment</TabsTrigger>
              {isTimeOff && <TabsTrigger value="timeoff">Time Off</TabsTrigger>}
            </TabsList>

            {/* Appointment Form */}
            <TabsContent value="appointment" className="min-h-[280px]">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Patient</Label>
                  <Select
                    value={selectedPatient ?? ""}
                    onValueChange={(val) => setSelectedPatient(val)}
                    disabled={isTimeOff}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select patient" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name} ({p.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Service</Label>
                  <Select
                    value={selectedService ?? ""}
                    onValueChange={(val) => {
                      setSelectedService(val);
                      const svc = services.find((s) => s.id === val);
                      if (svc?.duration_minutes) setDuration(svc.duration_minutes);
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
                {/* Patient Note */}
                {editingEvent?.extendedProps?.patient_note && (
                  <div className="space-y-1">
                    <Label>Patient Note</Label>
                    <div className="p-2 border rounded-md bg-gray-50 text-sm text-gray-700">
                      {editingEvent.extendedProps.patient_note}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Time Off Form */}
            <TabsContent value="timeoff" className="min-h-[280px]">
              <div className="space-y-3">
                <div>
                  <Label>Time Off Type</Label>
                  <Select
                    value={timeOffMode}
                    onValueChange={(val) => setTimeOffMode(val as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Partial Day (hours)</SelectItem>
                      <SelectItem value="day">Full Day</SelectItem>
                      <SelectItem value="range">Date Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {timeOffMode === "hours" && (
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-1">
                      <Label>Start</Label>
                      <Input
                        type="datetime-local"
                        value={selectedDate?.slice(0, 16) ?? ""}
                        onChange={(e) =>
                          setSelectedDate(
                            new Date(e.target.value).toISOString()
                          )
                        }
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label>End</Label>
                      <Input
                        type="datetime-local"
                        onChange={(e) => {
                          const start = new Date(
                            selectedDate ?? new Date()
                          );
                          const end = new Date(e.target.value);
                          setDuration(
                            Math.round((end.getTime() - start.getTime()) / 60000)
                          );
                        }}
                      />
                    </div>
                  </div>
                )}

                {timeOffMode === "day" && (
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={
                        selectedDate
                          ? new Date(selectedDate).toISOString().split("T")[0]
                          : ""
                      }
                      readOnly
                      className="bg-gray-100 cursor-not-allowed"
                    />
                  </div>
                )}

                {timeOffMode === "range" && (
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-1">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        onChange={(e) =>
                          setSelectedDate(
                            new Date(e.target.value).toISOString()
                          )
                        }
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        onChange={(e) => {
                          const d = new Date(e.target.value);
                          const start = new Date(selectedDate ?? d);
                          const minutes =
                            Math.round((d.getTime() - start.getTime()) / 60000) +
                            1440;
                          setDuration(minutes);
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-between pt-4">
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

            <div className="flex gap-2">
              <Button variant="outline" onClick={resetForm}>
                Close
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
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
    </div>
  );
}
