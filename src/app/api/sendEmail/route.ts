// src/app/api/sendEmail/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { to, subject, text, html } = await req.json();

    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL!,
      to,
      subject,
      text,
      html,
    });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    console.error("Resend API error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
