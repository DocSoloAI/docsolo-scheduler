// scripts/sendReminders.ts
import { supabase } from "../src/lib/supabaseClient";
import { sendTemplatedEmail } from "../src/lib/email/sendTemplatedEmail";
import { format } from "date-fns";

interface ReminderAppt {
  id: string;
  start_time: string;
  end_time: string;
  provider_id: string;
  patients: { first_name: string; last_name: string; email: string }[];
  services: { name: string }[];
  providers: { office_name: string; send_reminders: boolean }[];
}

async function sendReminders() {
  console.log("📨 Checking for reminder emails...");

  const now = new Date();

  // Window: 1h30m → 24h15m ahead
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
      providers ( office_name, send_reminders )
    `)
    .gte("start_time", windowStart.toISOString())
    .lte("start_time", windowEnd.toISOString())
    .eq("status", "booked") as { data: ReminderAppt[]; error: any };

  if (error) {
    console.error("❌ Error fetching appointments:", error.message);
    return;
  }

  if (!appts || appts.length === 0) {
    console.log("ℹ️ No reminders due in this window.");
    return;
  }

  for (const appt of appts) {
    const patient = appt.patients?.[0];
    const service = appt.services?.[0];
    const provider = appt.providers?.[0];

    if (!patient?.email) {
      console.log(`⚠️ Skipping appt ${appt.id}: no patient email`);
      continue;
    }

    if (!provider?.send_reminders) {
      console.log(
        `🚫 Skipping appt ${appt.id}: reminders disabled for provider "${provider?.office_name}"`
      );
      continue;
    }

    const start = new Date(appt.start_time);
    const diffMinutes = (start.getTime() - now.getTime()) / 60000;

    // Day-before (≈24h) OR same-day (≈2h)
    const is24hReminder = diffMinutes >= 1380 && diffMinutes <= 1470; // 23h–24.5h
    const is2hReminder = diffMinutes >= 90 && diffMinutes <= 150;     // 1.5h–2.5h

    if (!is24hReminder && !is2hReminder) {
      console.log(`⏭️ Skipping appt ${appt.id}, not in reminder window`);
      continue;
    }

    const formattedDate = format(start, "MMMM d, yyyy");
    const formattedTime = format(start, "h:mm a");

    await sendTemplatedEmail({
      templateType: "reminder",
      to: patient.email,
      providerId: appt.provider_id,
      appointmentData: {
        patientName: `${patient.first_name} ${patient.last_name}`,
        date: formattedDate,
        time: formattedTime,
        service: service?.name || "Appointment",
        appointmentId: appt.id,
        manageLink: `https://${(provider?.office_name || "demo")
          .replace(/\s+/g, "")
          .toLowerCase()}.bookthevisit.com/manage/${appt.id}`,
      },
    });

    const reminderType = is24hReminder ? "24h" : "2h";
    console.log(
      `📧 [Reminder-${reminderType}] appt ${appt.id} | ${
        provider?.office_name || "Unknown Provider"
      } | ${formattedDate} ${formattedTime}`
    );
  }
}

sendReminders();
