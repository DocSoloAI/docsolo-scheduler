// @ts-nocheck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { supabase } from "../_shared/supabaseClient.ts";
import { sendTemplatedEmail } from "../_shared/sendTemplatedEmail.ts";
import { format } from "https://esm.sh/date-fns@2.30.0";

serve(async () => {
  console.log("📨 Running reminder job...");

  const now = new Date();
  const windowStart = new Date(now.getTime() + 90 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 24.25 * 60 * 60 * 1000);

  // 🧠 Fetch appointments in the next ~24h
  const { data: appts, error } = await supabase
    .from("appointments")
    .select(`
      id,
      start_time,
      end_time,
      provider_id,
      patient:patients!appointments_patient_id_fkey ( first_name, last_name, email ),
      services ( name ),
      providers ( subdomain, announcement )
    `)
    .gte("start_time", windowStart.toISOString())
    .lte("start_time", windowEnd.toISOString())
    .eq("status", "booked");

  if (error) {
    console.error("❌ Error fetching appointments:", error.message);
    return new Response("Error", { status: 500 });
  }

  if (!appts?.length) {
    console.log("ℹ️ No reminders due.");
    return new Response("No reminders", { status: 200 });
  }

  for (const appt of appts) {
    try {
      const startRaw = appt.start_time;
      const startISO = startRaw
        ? startRaw.replace(" ", "T").replace(/\+00:?00?$/, "Z")
        : "";

      const startUTC = new Date(startISO);
      const providerTZ = "America/New_York"; // ✅ could later be dynamic per provider
      const startLocal = new Date(
        startUTC.toLocaleString("en-US", { timeZone: providerTZ })
      );

      const diffMinutes = (startUTC.getTime() - now.getTime()) / 60000;
      const is24hReminder = diffMinutes >= 1380 && diffMinutes <= 1470; // 23–24.5h window
      if (!is24hReminder) continue;

      const patient = appt.patient;
      const service = appt.services?.[0];
      const provider = appt.providers?.[0];
      if (!patient?.email) continue;

      await sendTemplatedEmail({
        templateType: "reminder",
        to: patient.email,
        providerId: appt.provider_id,
        appointmentData: {
          patientName: `${patient.first_name} ${patient.last_name}`,
          date: format(startLocal, "MMMM d, yyyy"),
          time: format(startLocal, "h:mm a"),
          service: service?.name || "Appointment",
          appointmentId: appt.id,
          manageLink: `https://${provider?.subdomain || "demo"}.bookthevisit.com/manage/${appt.id}`,
          announcement: provider?.announcement?.trim()
            ? provider.announcement
            : null,
        },
      });

      console.log(`✅ Reminder sent to ${patient.email}`);
    } catch (err) {
      console.error("❌ Error inside loop for appt", appt.id, err);
    }
  }

  console.log("🏁 Reminder job complete.");
  return new Response("Done", { status: 200 });
});
