// supabase/functions/test-email/index.ts
// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { sendTemplatedEmail } from "../_shared/sendTemplatedEmail.ts";

serve(async (req) => {
  try {
    // Dummy appointment data
    const appointmentData = {
      patientName: "Test Patient",
      date: "Sep 15, 2025",
      time: "10:00 AM",
      service: "Test Service",
      appointmentId: "demo123",
      manageLink: "https://demo.bookthevisit.com/manage/demo123",
    };

    await sendTemplatedEmail({
      templateType: "confirmation",
      to: "jimcesca@gmail.com", // 👈 put your email here
      providerId: "58607fe5-b961-4819-86b6-48340afb1d21", // 👈 replace with your provider.id from DB
      appointmentData,
    });

    return new Response("✅ Test email sent", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("❌ Error sending email", { status: 500 });
  }
});
