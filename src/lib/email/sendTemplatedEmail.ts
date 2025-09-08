import { supabase } from "@/lib/supabaseClient";
import { resend } from "@/lib/resend"; // You must configure this
import stripHtml from "./stripHtml.ts";

type TemplateType = "confirmation" | "reminder" | "update" | "cancellation";

interface SendTemplatedEmailOptions {
  templateType: TemplateType;
  to: string;
  providerId: string;
  appointmentData: {
    patientName: string;
    date: string;
    time: string;
    service: string;
    appointmentId: string;
    manageLink: string;
  };
}

export async function sendTemplatedEmail({
  templateType,
  to,
  providerId,
  appointmentData,
}: SendTemplatedEmailOptions) {
  // Fetch provider info
  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("*")
    .eq("id", providerId)
    .single();

  if (providerError || !provider) {
    console.error("Provider fetch failed", providerError);
    return;
  }

  // Fetch email template
  const { data: templates } = await supabase
    .from("email_templates")
    .select("*")
    .eq("provider_id", providerId)
    .eq("template_type", templateType);

  const template = templates?.[0];
  if (!template) {
    console.warn(`No template found for type ${templateType}`);
    return;
  }

  // Construct variables
  const variables: Record<string, string> = {
    providerName: `${provider.first_name} ${provider.last_name}${provider.suffix ? ", " + provider.suffix : ""}`,
    officeName: provider.office_name,
    location: [provider.street, provider.city, provider.state, provider.zip].filter(Boolean).join(", "),
    providerPhone: provider.phone || "",
    patientName: appointmentData.patientName,
    date: appointmentData.date,
    time: appointmentData.time,
    service: appointmentData.service,
    appointmentId: appointmentData.appointmentId,
    manageLink: appointmentData.manageLink,
  };

  const subject = injectVariables(template.subject, variables);
  const html = injectVariables(template.html_body, variables);
  const text = stripHtml(html);

  // Send via Resend
  try {
    await resend.emails.send({
      from: `${provider.office_name} <no-reply@docsoloscheduler.com>`, // ✅ use single domain
      to,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error("Resend send failed:", err);
  }
}

// Helper to inject template variables
function injectVariables(template: string, variables: Record<string, string>) {
  return template.replace(/{{(.*?)}}/g, (_, key) => variables[key.trim()] || "");
}
