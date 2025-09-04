import { Resend } from "resend";

const apiKey = import.meta.env.VITE_RESEND_API_KEY;

if (!apiKey) {
  throw new Error("❌ VITE_RESEND_API_KEY is missing. Check your .env.local file.");
}

export const resend = new Resend(apiKey);
