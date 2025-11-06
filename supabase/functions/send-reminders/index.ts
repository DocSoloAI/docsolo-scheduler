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

  // 🧠 Fetch upcoming appointments in next ~24h
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

  console.log("Found appointments:", appts?.length || 0);
  if (appts && appts.length) {
    for (const a of appts) {
      console.log("⏰ Appt start_time (UTC):", a.start_time);
    }
  }

  if (error) {
    console.error("❌ Error fetching appointments:", error.message);
    return new Response("Error", { status: 500 });
  }

  if (!appts || appts.length === 0) {
    console.log("ℹ️ No reminders due.");
    return new Response("No reminders", { status: 200 });
  }

  for (const appt of appts) {
    console.log("➡️ Checking appt:", appt.id);

    try {
      console.log("Now (UTC):", now.toISOString());
      console.log("Raw start_time:", appt.start_time);

      const startRaw = appt.start_time;
      const startISO = startRaw
        ? startRaw.replace(" ", "T").replace(/\+00:?00?$/, "Z") // handle +00 or +00:00
        : "";

      console.log("Normalized ISO:", startISO);

      const start = new Date(startISO);
      console.log("Parsed start date:", start.toISOString());

      const diffMinutes = (start.getTime() - now.getTime()) / 60000;
      console.log("⏱ diffMinutes for", appt.id, "=", diffMinutes);

      const is24hReminder = diffMinutes >= 900 && diffMinutes <= 1470;
      if (!is24hReminder) {
        console.log("⏩ Skipping appt (outside 24h window):", diffMinutes);
        continue;
      }

      const patient = appt.patient;
      const service = appt.services?.[0];
      const provider = appt.providers?.[0];

      if (!patient?.email) {
        console.log("⚠️ No patient email, skipping");
        continue;
      }

      console.log("🚀 Sending reminder to", patient.email);

      await sendTemplatedEmail({
        templateType: "reminder",
        to: patient.email,
        providerId: appt.provider_id,
        appointmentData: {
          patientName: `${patient.first_name} ${patient.last_name}`,
          date: format(start, "MMMM d, yyyy"),
          time: format(start, "h:mm a"),
          service: service?.name || "Appointment",
          appointmentId: appt.id,
          manageLink: `https://${provider?.subdomain || "demo"}.bookthevisit.com/manage/${appt.id}`,
          announcement: provider?.announcement?.trim()
            ? provider.announcement
            : null,
        },
      });

      console.log(`✅ 24-hour reminder sent to ${patient.email}`);
    } catch (err) {
      console.error("❌ Error inside loop for appt", appt.id, err);
    }
  }

  console.log("🏁 Reminder job complete, exiting...");
  await new Promise((r) => setTimeout(r, 500)); // give logs time to flush
  return new Response("Done", { status: 200 });
});
