// src/lib/email/sendTemplatedEmail.ts

interface AppointmentData {
  patientName: string;
  patientEmail?: string;   // 👈 ADD
  patientPhone?: string;   // 👈 ADD
  date: string;
  time: string;
  service: string;
  appointmentId: string;
  manageLink: string;
  officeName?: string;
  providerName?: string;
  location?: string;
  providerPhone?: string;
  announcement?: string;
  logoUrl?: string;
  patientNote?: string;
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
