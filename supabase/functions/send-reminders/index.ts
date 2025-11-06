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

  const { data: appts, error } = await supabase
    .from("appointments")
    .select(`
      id,
      start_time,
      end_time,
      provider_id,
      patients ( first_name, last_name, email ),
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
    const patient = appt.patients?.[0];
    const service = appt.services?.[0];
    const provider = appt.providers?.[0];
    if (!patient?.email) continue;

    const start = new Date(appt.start_time);
    const diffMinutes = (start.getTime() - now.getTime()) / 60000;

    // ✅ Only 24-hour reminders (no 2-hour reminders)
    const is24hReminder = diffMinutes >= 1380 && diffMinutes <= 1470;
    if (!is24hReminder) continue;

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
        // ✅ Only include announcement if it has text
        announcement:
          provider?.announcement?.trim() ? provider.announcement : null,
      },
    });

    console.log(`✅ 24-hour reminder sent to ${patient.email}`);
  }

  return new Response("Done", { status: 200 });
});
