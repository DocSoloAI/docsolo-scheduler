// src/lib/email.ts
import { Resend } from "resend";
import dotenv from "dotenv";

// Load env vars when running outside Next.js
dotenv.config({ path: ".env.local" });

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({
  to,
  subject,
  html,
  from = "noreply@docsoloscheduler.com",
}: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}) {
  try {
    const data = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    console.log("✅ Email sent:", data);
    return { success: true, data };
  } catch (error) {
    console.error("❌ Email error:", error);
    return { success: false, error };
  }
}
