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
      manage_token,
      patient:patients!appointments_patient_id_fkey ( first_name, last_name, email ),
      services ( name ),
      providers (
        subdomain,
        announcement,
        office_name,
        phone,
        street,
        city,
        state,
        zip,
        timezone
      )
    `)

    .gte("start_time", windowStart.toISOString())
    .lte("start_time", windowEnd.toISOString())
    .eq("status", "booked")
    .eq("reminder_sent", false);


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
      const patient = appt.patient;
      const service = appt.services?.[0];
      const provider = appt.providers;
      if (!patient?.email || !provider) continue;

      // 🕓 Convert to provider-local time
      const startRaw = appt.start_time;
      const startISO = startRaw
        ? startRaw.replace(" ", "T").replace(/\+00:?00?$/, "Z")
        : "";

      const startUTC = new Date(startISO);
      const providerTZ = provider.timezone || "America/New_York";
      const startLocal = new Date(
        startUTC.toLocaleString("en-US", { timeZone: providerTZ })
      );

      // 🕓 Use provider-local clock for comparison
      const providerTZ = provider.timezone || "America/New_York";

      // Convert both times to the provider’s local zone
      const nowLocal = new Date(
        new Date().toLocaleString("en-US", { timeZone: providerTZ })
      );
      const startLocal = new Date(
        startUTC.toLocaleString("en-US", { timeZone: providerTZ })
      );

      // Calculate difference in minutes (local time)
      const diffMinutes = (startLocal.getTime() - nowLocal.getTime()) / 60000;

      // Allow 22–25h window to catch any slight drift
      const is24hReminder = diffMinutes >= 1320 && diffMinutes <= 1500;

      console.log(
        `🧠 DEBUG: ${appt.id} | ${diffMinutes.toFixed(
          1
        )} min away | providerTZ=${providerTZ}`
      );

      if (!is24hReminder) continue;

      // ✉️ Send reminder
      await sendTemplatedEmail({
        templateType: "reminder",
        to: patient.email,
        providerId: appt.provider_id,
        appointmentData: {
          patientName: `${patient.first_name || ""} ${patient.last_name || ""}`.trim(),
          date: format(startLocal, "MMMM d, yyyy"),
          time: format(startLocal, "h:mm a"),
          service: service?.name || "Appointment",
          appointmentId: appt.id,
          manageLink: `https://${provider?.subdomain || "demo"}.bookthevisit.com/manage/${appt.id}?token=${appt.manage_token}`,
          officeName: provider?.office_name || "",
          providerName: provider?.first_name
            ? `${provider.first_name} ${provider.last_name}`
            : provider?.office_name || "Your provider",
          location: [provider?.street, provider?.city, provider?.state, provider?.zip]
            .filter(Boolean)
            .join(", "),
          providerPhone: provider?.phone || "",
          announcement:
            provider?.announcement?.trim() && provider.announcement.length > 0
              ? provider.announcement
              : null,
        },
      });

        // ✅ Mark this appointment so reminder never sends twice
        await supabase
          .from("appointments")
          .update({ reminder_sent: true })
          .eq("id", appt.id);

      console.log(`✅ Reminder sent to ${patient.email} (${providerTZ})`);
    } catch (err) {
      console.error("❌ Error inside loop for appt", appt.id, err);
    }
  }

  console.log("🏁 Reminder job complete.");
  return new Response("Done", { status: 200 });
});
