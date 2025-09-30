// src/pages/ManageAppointmentPage.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSubdomain } from "@/lib/getSubdomain";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Appointment {
  id: string;
  status: string;
  patient_name: string;
  provider_name: string;
  service_name: string;
  start_time: string;
  location: string;
}

export default function ManageAppointmentPage() {
  const { appointmentId } = useParams();
  const [searchParams] = useSearchParams();              // 👈 new
  const token = searchParams.get("token");      
    const navigate = useNavigate();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!appointmentId) return;

    const fetchAppointment = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          `
          id,
          status,
          start_time,
          patients ( first_name, last_name ),
          providers ( office_name, street, city, state, zip, phone, email, id ),
          services ( name )
        `
        )
        .eq("id", appointmentId)
        .eq("manage_token", token) 
        .single();

      if (error) {
        console.error("Error fetching appointment:", error.message);
      } else if (data) {
        const patient = Array.isArray(data.patients)
          ? data.patients[0]
          : data.patients;
        const provider = Array.isArray(data.providers)
          ? data.providers[0]
          : data.providers;
        const service = Array.isArray(data.services)
          ? data.services[0]
          : data.services;

        const location = provider
          ? [provider.street, provider.city, provider.state, provider.zip]
              .filter(Boolean)
              .join(", ")
          : "Unknown";

        setAppointment({
          id: data.id,
          status: data.status,
          patient_name: patient
            ? `${patient.first_name} ${patient.last_name}`
            : "Unknown",
          provider_name: provider?.office_name || "Unknown",
          service_name: service?.name || "Unknown",
          start_time: data.start_time,
          location,
        });
      }
      setLoading(false);
    };

    fetchAppointment();
  }, [appointmentId]);

  const handleCancel = async () => {
    if (!appointment) return;

    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointment.id);

    if (error) {
      alert("Error cancelling appointment.");
      return;
    }

    // Fetch full details for emails
    const { data: appt } = await supabase
      .from("appointments")
      .select(`
        id,
        start_time,
        services ( name ),
        patients ( first_name, last_name, email ),
        providers ( id, office_name, email )
      `)
      .eq("id", appointment.id)
      .single();

    if (appt) {
      const patient = Array.isArray(appt.patients)
        ? appt.patients[0]
        : appt.patients;
      const provider = Array.isArray(appt.providers)
        ? appt.providers[0]
        : appt.providers;
      const service = Array.isArray(appt.services)
        ? appt.services[0]
        : appt.services;

      const patientEmail = patient?.email;
      const providerEmail = provider?.email;
      const patientName = patient
        ? `${patient.first_name} ${patient.last_name}`
        : "Patient";
      const formattedDate = new Date(appt.start_time).toLocaleDateString(
        "en-US",
        { weekday: "long", month: "long", day: "numeric" }
      );
      const formattedTime = new Date(appt.start_time).toLocaleTimeString(
        "en-US",
        { hour: "numeric", minute: "2-digit" }
      );

      // Patient cancellation email (Edge Function)
      if (patientEmail) {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sendTemplatedEmail`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              templateType: "cancellation",
              to: patientEmail,
              providerId: provider?.id,
              appointmentData: {
                patientName,
                date: formattedDate,
                time: formattedTime,
                service: service?.name,
                appointmentId: appt.id,
                manageLink: `https://${getSubdomain()}.bookthevisit.com/manage/${appt.id}`,
              },
            }),
          }
        );
      }

      // Provider cancellation notification (Edge Function)
      if (providerEmail) {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sendTemplatedEmail`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              templateType: "provider_cancellation",
              to: providerEmail,
              providerId: provider?.id,
              appointmentData: {
                patientName,
                patientEmail,
                date: formattedDate,
                time: formattedTime,
                service: service?.name,
                appointmentId: appt.id,
              },
            }),
          }
        );
      }
    }

    setCancelled(true);
  };

  const handleReschedule = () => {
    if (!appointment) return;
    navigate(`/?reschedule=${appointment.id}`);
  };

  if (!appointmentId || !token) {
    return <p className="p-6 text-center text-red-600">Invalid or missing link.</p>;
  }

  if (loading) {
    return <p className="p-6 text-center">Loading...</p>;
  }

  if (!appointment) {
    return <p className="p-6 text-center text-red-600">Appointment not found or link expired.</p>;
  }

  return (
    <div className="p-6 flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-slate-100">
      {!cancelled ? (
        <Card className="shadow-lg border border-gray-200 rounded-2xl w-full max-w-lg">
          <CardContent className="p-8 space-y-6">
            <h2 className="text-2xl font-bold text-center text-gray-800">
              Manage Appointment
            </h2>

            <div className="space-y-2 text-sm text-gray-700">
              <p>
                <strong className="font-semibold text-gray-900">Patient:</strong>{" "}
                {appointment.patient_name}
              </p>
              <p>
                <strong className="font-semibold text-gray-900">Provider:</strong>{" "}
                {appointment.provider_name}
              </p>
              <p>
                <strong className="font-semibold text-gray-900">Service:</strong>{" "}
                {appointment.service_name}
              </p>
              <p>
                <strong className="font-semibold text-gray-900">Date/Time:</strong>{" "}
                {new Date(appointment.start_time).toLocaleString()}
              </p>
              <p>
                <strong className="font-semibold text-gray-900">Location:</strong>{" "}
                {appointment.location}
              </p>
            </div>

            <div className="flex gap-4 pt-6">
              <Button
                onClick={handleReschedule}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm"
              >
                Reschedule
              </Button>
              <Button
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                className="flex-1 rounded-lg shadow-sm"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-gradient-to-br from-green-50 to-green-100 shadow-lg rounded-2xl w-full max-w-lg">
          <CardContent className="p-8 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-green-700 mb-4">
              Appointment Cancelled
            </h2>
            <p className="text-gray-700">
              Your appointment has been successfully cancelled.
            </p>
            <div className="flex justify-center mt-6">
              <Button
                onClick={() => navigate("/booking")}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Book Another Visit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Cancel Modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Cancel Appointment?
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              This will permanently cancel your appointment. Are you sure you want
              to continue?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="rounded-lg"
            >
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await handleCancel();
                setConfirmOpen(false);
              }}
              className="rounded-lg"
            >
              Yes, Cancel It
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
