import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/context/SettingsContext";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface AppointmentEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor?: string;
  extendedProps?: any;
}

// === EMAIL SENDER HELPER ===
const sendAppointmentEmail = async (
  type: "confirmation" | "update" | "cancellation" | "reminder",
  appointmentId: string,
  providerId: string
) => {
  // Skip emails for time-off blocks
  const { data: check } = await supabase
    .from("appointments")
    .select("status")
    .eq("id", appointmentId)
    .single();

  if (check?.status === "time_off") {
    console.log("⏭️ Skipping email for time-off block");
    return;
  }


  // fetch appointment with patient + service
  const { data: appointment, error: apptError } = await supabase
    .from("appointments")
    .select(
      "id, start_time, end_time, patients(first_name,last_name,email), services(name)"
    )
    .eq("id", appointmentId)
    .single();

  if (apptError || !appointment) {
    console.error("Appointment fetch error:", apptError?.message);
    return;
  }

  // normalize relations
  const patient = Array.isArray(appointment.patients)
    ? appointment.patients[0]
    : appointment.patients;

  const service = Array.isArray(appointment.services)
    ? appointment.services[0]
    : appointment.services;

  // fetch provider
  const { data: provider } = await supabase
    .from("providers")
    .select("name, phone, address, subdomain")
    .eq("id", providerId)
    .single();

  // fetch template
  const { data: template, error: tmplError } = await supabase
    .from("email_templates")
    .select("subject, body, html_body")
    .eq("provider_id", providerId)
    .eq("template_type", type)
    .single();

  if (tmplError || !template) {
    console.error("Template fetch error:", tmplError?.message);
    return;
  }

  const vars: Record<string, string> = {
    patientName: `${patient?.first_name || ""} ${patient?.last_name || ""}`,
    providerName: provider?.name || "",
    providerPhone: provider?.phone || "",
    location: provider?.address || "",
    date: new Date(appointment.start_time).toLocaleDateString(),
    time: new Date(appointment.start_time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    service: service?.name || "",
    // 🔄 switched to bookthevisit.com for patient-facing flow
    manageLink: `https://${provider?.subdomain || "demo"}.bookthevisit.com/manage/${appointment.id}`,
  };

  const fill = (str: string | null) =>
    str ? str.replace(/{{(.*?)}}/g, (_, key) => vars[key.trim()] || "") : "";

  const subject = fill(template.subject);
  const text = fill(template.body);
  const html = fill(template.html_body);

  try {
    await fetch("/api/sendEmail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: patient.email,
        subject,
        text,
        html,
      }),
    });
    console.log(`✅ ${type} email sent to ${patient.email}`);
  } catch (err) {
    console.error("Send email error:", err);
  }
};

export default function CalendarTab({ providerId }: { providerId: string }) {
  const { services, patients, appointments, loading, reload } = useSettings();

  const [events, setEvents] = useState<AppointmentEvent[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Form state
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(30);
  const [isTimeOff, setIsTimeOff] = useState(false);
  const [saving, setSaving] = useState(false);

  const colorPalette = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // yellow
    "#ef4444", // red
    "#8b5cf6", // purple
  ];

  // Map appointments → events
  useEffect(() => {
    if (!appointments) return;
    const mapped = appointments.map((a: any) => {
      const patient = Array.isArray(a.patients) ? a.patients[0] : a.patients;
      const serviceIndex = services.findIndex((s) => s.id === a.service_id);
      const color =
        a.status === "time_off"
          ? "#9ca3af"
          : serviceIndex >= 0
          ? colorPalette[serviceIndex % colorPalette.length]
          : "#9ca3af";

      return {
        id: a.id,
        title:
          a.status === "time_off"
            ? "OFF"
            : `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim(),
        start: a.start_time,
        end: a.end_time,
        backgroundColor: color,
        extendedProps: {
          patient_id: a.patient_id,
          service_id: a.service_id,
          status: a.status,
        },
      };
    });
    setEvents(mapped);
  }, [appointments, services]);

  // Reset form helper
  const resetForm = () => {
    setModalOpen(false);
    setEditingEvent(null);
    setSelectedDate(null);
    setSelectedPatient(null);
    setSelectedService(null);
    setDuration(30);
    setIsTimeOff(false);
  };

  // Slot click → add mode
  const handleDateClick = (info: any) => {
    setEditingEvent(null);
    setSelectedDate(info.dateStr);
    setModalOpen(true);
  };

  // Event click → edit mode
  const handleEventClick = (info: any) => {
    const event = info.event;
    setEditingEvent({
      id: event.id,
      start: event.startStr,
      end: event.endStr,
      patient_id: event.extendedProps.patient_id,
      service_id: event.extendedProps.service_id,
      status: event.extendedProps.status,
    });
    setSelectedDate(event.startStr);
    setSelectedPatient(event.extendedProps.patient_id || null);
    setSelectedService(event.extendedProps.service_id || null);
    setDuration(
      (new Date(event.endStr).getTime() - new Date(event.startStr).getTime()) /
        60000
    );
    setIsTimeOff(event.extendedProps.status === "time_off");
    setModalOpen(true);
  };

  // Drag/drop → update times
  const handleEventDrop = async (info: any) => {
    await supabase
      .from("appointments")
      .update({
        start_time: info.event.start,
        end_time: info.event.end,
      })
      .eq("id", info.event.id);

    reload();
    await sendAppointmentEmail("update", info.event.id, providerId);
  };

  // Save handler (insert or update)
  const handleSave = async () => {
    if (!selectedDate) return;
    setSaving(true);

    const start = new Date(selectedDate);
    const end = new Date(start.getTime() + duration * 60000);

    if (editingEvent) {
      // update existing
      const { error } = await supabase
        .from("appointments")
        .update({
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: isTimeOff ? "time_off" : "booked",
          patient_id: isTimeOff ? null : selectedPatient,
          service_id: isTimeOff ? null : selectedService,
        })
        .eq("id", editingEvent.id);

      setSaving(false);
      if (error) {
        alert("Error updating: " + error.message);
        return;
      }

      reload();
      resetForm();

      // ✅ Only send emails for real appointments
      if (!isTimeOff) {
        await sendAppointmentEmail("update", editingEvent.id, providerId);
      }
      return;
    }

    // insert new
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
      .select("id, status")
      .single();

    setSaving(false);

    if (error) {
      alert("Error saving: " + error.message);
      return;
    }

    reload();
    resetForm();

    // ✅ Only send emails for real appointments
    if (newAppt && newAppt.status !== "time_off") {
      await sendAppointmentEmail("confirmation", newAppt.id, providerId);
    }
  };


  // Custom renderer for events
  const renderEventContent = (eventInfo: any) => {
    const { event } = eventInfo;
    const { status } = event.extendedProps;

    if (status === "off") {
      return (
        <div className="flex flex-col items-center justify-center h-full text-xs font-semibold text-gray-800">
          OFF
        </div>
      );
    }

    return (
      <div className="flex flex-col text-xs">
        <span className="font-semibold">{event.title}</span>
        <span className="text-gray-700">
          {event.start.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
    );
  };

  // Delete handler
  const handleDelete = async () => {
    if (!editingEvent) return;

    // If this is a time_off block, just delete it (no email)
    if (editingEvent.status === "time_off") {
      await supabase.from("appointments").delete().eq("id", editingEvent.id);
      reload();
      resetForm();
      console.log("⏭️ Deleted time-off block (no email sent)");
      return;
    }

    // Otherwise, delete and send cancellation email
    await supabase.from("appointments").delete().eq("id", editingEvent.id);

    reload();
    resetForm();
    await sendAppointmentEmail("cancellation", editingEvent.id, providerId);
  };

  if (loading) return <div className="p-4 text-gray-500">Loading calendar…</div>;

  return (
    <div className="p-2">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        slotMinTime="08:00:00"
        slotMaxTime="20:00:00"
        height="auto"
        dayHeaderFormat={{ weekday: "short" }}
        hiddenDays={[0]}
        selectable
        editable
        events={events}
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        eventContent={renderEventContent}
      />

      {/* Appointment Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? "Edit Appointment" : "Add Appointment / Time Off"}
            </DialogTitle>
            <DialogDescription>
              Fill out the form below to save or update this entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Start:{" "}
              {selectedDate ? new Date(selectedDate).toLocaleString() : ""}
            </p>

            {/* Time Off Toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="timeoff"
                checked={isTimeOff}
                onCheckedChange={(val) => setIsTimeOff(!!val)}
              />
              <Label htmlFor="timeoff">Mark as Time Off</Label>
            </div>

            {/* Patient */}
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

            {/* Service */}
            <div className="space-y-1">
              <Label>Service</Label>
              <Select
                value={selectedService ?? ""}
                onValueChange={(val) => {
                  setSelectedService(val);
                  const svc = services.find((s) => s.id === val);
                  if (svc?.duration_minutes) setDuration(svc.duration_minutes);
                }}
                disabled={isTimeOff}
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

            {/* Duration */}
            <div className="space-y-1">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={1}
                max={480}
                value={duration === 0 ? "" : duration}
                onChange={(e) =>
                  setDuration(e.target.value === "" ? 0 : Number(e.target.value))
                }
              />
            </div>

            {/* Action buttons */}
            <div className="flex justify-between pt-2">
              {editingEvent ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to cancel this appointment? This
                        action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex justify-end gap-2 pt-4">
                      <AlertDialogCancel>Keep</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 text-white hover:bg-red-700"
                        onClick={handleDelete}
                      >
                        Yes, Cancel
                      </AlertDialogAction>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <div />
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
