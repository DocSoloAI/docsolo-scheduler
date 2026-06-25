// supabase/functions/sendProviderBookingEmail/index.ts
// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseAdmin } from "../_shared/supabaseAdminClient.ts";
import { sendTemplatedEmail } from "../_shared/sendTemplatedEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    const {
      appointmentId,
      providerId,
      patientNote,
      street,
      city,
      state,
      zip,
      primaryInsurance,
      primaryID,
      secondaryInsurance,
      secondaryID,
      previousDate,
      previousTime,
      templateType,
    } = body;

    if (!appointmentId || !providerId) {
      return new Response(
        JSON.stringify({ error: "Missing appointmentId or providerId" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .select(
        `
        id,
        provider_id,
        start_time,
        status,
        patient_note,
        patients (
          first_name,
          last_name,
          email,
          cell_phone,
          home_phone
        ),
        providers (
          id,
          email,
          office_name,
          phone,
          street,
          city,
          state,
          zip,
          announcement,
          logo_url
        ),
        services (
          name
        )
      `
      )
      .eq("id", appointmentId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (appointmentError) throw appointmentError;

    if (!appointment) {
      return new Response(JSON.stringify({ error: "Appointment not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const provider = Array.isArray(appointment.providers)
      ? appointment.providers[0]
      : appointment.providers;

    const patient = Array.isArray(appointment.patients)
      ? appointment.patients[0]
      : appointment.patients;

    const service = Array.isArray(appointment.services)
      ? appointment.services[0]
      : appointment.services;

    if (!provider?.email) {
      return new Response(
        JSON.stringify({ error: "Provider email not found" }),
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    const appointmentDate = new Date(appointment.start_time);

    const formattedDate = appointmentDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const formattedTime = appointmentDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    const safeTemplateType =
      templateType === "provider_update"
        ? "provider_update"
        : "provider_confirmation";

    await sendTemplatedEmail({
      templateType: safeTemplateType,
      to: provider.email,
      providerId,
      appointmentData: {
        patientName: patient
          ? `${patient.first_name || ""} ${patient.last_name || ""}`.trim()
          : "Patient",
        patientEmail: patient?.email || "",
        patientPhone:
          patient?.cell_phone || patient?.home_phone || "(no phone provided)",
        date: formattedDate,
        time: formattedTime,
        previousDate: previousDate || "",
        previousTime: previousTime || "",
        service: service?.name || "",
        appointmentId: appointment.id,
        patientNote: patientNote || appointment.patient_note || "",

        street: street || "",
        city: city || "",
        state: state || "",
        zip: zip || "",
        primaryInsurance: primaryInsurance || "",
        primaryID: primaryID || "",
        secondaryInsurance: secondaryInsurance || "",
        secondaryID: secondaryID || "",

        manageLink: "",
        officeName: provider.office_name || "",
        providerPhone: provider.phone || "",
        announcement: provider.announcement || null,
        logoUrl: provider.logo_url || "",
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("❌ sendProviderBookingEmail error:", err);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unexpected provider email error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});