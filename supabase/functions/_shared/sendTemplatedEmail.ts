// supabase/functions/_shared/sendTemplatedEmail.ts
// @ts-nocheck
import { supabase } from "./supabaseClient.ts";

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
  location?: string;
  providerPhone?: string;
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
  // fetch template
  const { data: template, error } = await supabase
    .from("email_templates")
    .select("subject, html_body")
    .eq("provider_id", providerId)
    .eq("template_type", templateType)
    .single();

  if (error || !template) {
    console.error("❌ Template fetch error:", error?.message);
    return;
  }

  // fetch provider announcement + logo
  const { data: provider } = await supabase
    .from("providers")
    .select("announcement, logo_url, office_name, phone, street, city, state, zip")
    .eq("id", providerId)
    .single();

  // replace placeholders with appointment + provider data
  const fill = (str: string | null) =>
    str
      ? str.replace(/{{(.*?)}}/g, (_, key) => {
          const k = key.trim();
          return (
            appointmentData[k as keyof AppointmentData] ||
            provider?.[k as keyof typeof provider] ||
            ""
          );
        })
      : "";

  const subject = fill(template.subject);
  let html = fill(template.html_body);

  // prepend logo if available
  if (provider?.logo_url) {
    html =
      `<div style="margin-bottom:16px;text-align:left;">
         <img src="${provider.logo_url}" 
              alt="${provider.office_name || "Logo"}" 
              style="max-height:60px;object-fit:contain;" />
       </div>` + html;
  }

  // append announcement if available
  if (provider?.announcement) {
    html += `<br/><br/><p style="font-size:12px;color:#555">
               <em>${provider.announcement}</em>
             </p>`;
  }

  try {
    console.log("📧 Sending email via Resend:", {
      to,
      subject,
      templateType,
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      },
      body: JSON.stringify({
        from: `${provider?.office_name || "DocSoloScheduler"} <noreply@${Deno.env.get("RESEND_DOMAIN")}>`,
        to,
        subject,
        html,
      }),
    });


    const msg = await res.text();
    console.log("📨 Resend response status:", res.status);
    console.log("📨 Resend response body:", msg);

    if (!res.ok) {
      throw new Error(`Resend API error: ${msg}`);
    }

    console.log(`✅ ${templateType} email sent to ${to}`);
  } catch (err) {
    console.error("❌ Send email error:", err);
  }
}
