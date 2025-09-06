// @ts-nocheck

import { supabase } from "./supabaseClient.ts";

interface AppointmentData {
  patientName: string;
  date: string;
  time: string;
  service: string;
  appointmentId: string;
  manageLink: string;
}

interface SendTemplatedEmailOptions {
  templateType: "confirmation" | "reminder" | "update" | "cancellation";
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
  // fetch template from DB
  const { data: template, error } = await supabase
    .from("email_templates")
    .select("subject, body, html_body")
    .eq("provider_id", providerId)
    .eq("template_type", templateType)
    .single();

  if (error || !template) {
    console.error("❌ Template fetch error:", error?.message);
    return;
  }

  // replace {{placeholders}}
  const fill = (str: string | null) =>
    str
      ? str.replace(/{{(.*?)}}/g, (_, key) => {
          const k = key.trim() as keyof AppointmentData;
          return appointmentData[k] || "";
        })
      : "";

  const subject = fill(template.subject);
  const text = fill(template.body);
  const html = fill(template.html_body);

  // send email via your API route
  try {
    await fetch(`${Deno.env.get("EMAIL_API_URL")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject,
        text,
        html,
      }),
    });
    console.log(`✅ ${templateType} email sent to ${to}`);
  } catch (err) {
    console.error("❌ Send email error:", err);
  }
}
