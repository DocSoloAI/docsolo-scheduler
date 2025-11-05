// src/lib/email/sendTemplatedEmail.ts

interface AppointmentData {
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  date: string;
  time: string;
  service: string;
  appointmentId: string;
  manageLink: string;
  officeName?: string;
  providerName?: string;
  location?: string;
  providerPhone?: string;
  announcement?: string | null;
  logoUrl?: string;
  patientNote?: string;
  subdomain?: string;
}


interface SendTemplatedEmailOptions {
  templateType:
    | "confirmation"
    | "reminder"
    | "update"
    | "cancellation"
    | "provider_confirmation"
    | "provider_update"
    | "provider_cancellation";
  to: string;
  providerId: string;
  appointmentData: AppointmentData;
}

export async function sendTemplatedEmail({
  templateType,
  to,
  providerId,
  appointmentData,
}: SendTemplatedEmailOptions) {
  try {
    // 🩵 Normalize empty or null announcements to null so {{#if announcement}} hides the yellow bar
    appointmentData.announcement =
      appointmentData.announcement && appointmentData.announcement.trim() !== ""
        ? appointmentData.announcement
        : null;

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sendTemplatedEmail`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          templateType,
          to,
          providerId,
          appointmentData,
        }),
      }
    );

    const text = await res.text();
    if (!res.ok) throw new Error(text);
    console.log(`✅ ${templateType} email sent to ${to}`);
  } catch (err) {
    console.error("❌ Error sending templated email:", err);
  }
}
