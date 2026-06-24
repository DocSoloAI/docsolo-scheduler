// supabase/functions/createBooking/index.ts
// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { supabaseAdmin } from "../_shared/supabaseAdminClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function normalizeName(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

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

    const { patient, appointment } = body;

    if (!patient || !appointment) {
      return new Response(JSON.stringify({ error: "Missing patient or appointment data" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const providerId = patient.provider_id;
    const serviceId = appointment.service_id;
    const startTime = appointment.start_time;
    const endTime = appointment.end_time;

    const incomingEmail = normalizeEmail(patient.email);
    const incomingPhone = normalizePhone(patient.cell_phone);
    const incomingFirst = normalizeName(patient.first_name);
    const incomingLast = normalizeName(patient.last_name);

    if (!providerId || !serviceId || !startTime || !endTime) {
      return new Response(JSON.stringify({ error: "Missing required booking fields" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!patient.first_name || !patient.last_name || !incomingEmail || !incomingPhone) {
      return new Response(JSON.stringify({ error: "Missing required patient fields" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 1. Confirm provider exists and is active.
    const { data: provider, error: providerError } = await supabaseAdmin
      .from("providers")
      .select("id, is_active")
      .eq("id", providerId)
      .maybeSingle();

    if (providerError) throw providerError;

    if (!provider || provider.is_active === false) {
      return new Response(JSON.stringify({ error: "Provider not found or inactive" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // 2. Confirm service belongs to this provider and is active.
    const { data: service, error: serviceError } = await supabaseAdmin
      .from("services")
      .select("id, provider_id, is_active")
      .eq("id", serviceId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (serviceError) throw serviceError;

    if (!service || service.is_active === false) {
      return new Response(JSON.stringify({ error: "Service not found or inactive" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 3. Check for appointment conflicts.
    // Note: this is safer than browser-side checking, but not yet a true DB-level atomic lock.
    const { data: conflicts, error: conflictError } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("provider_id", providerId)
      .eq("status", "booked")
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .limit(1);

    if (conflictError) throw conflictError;

    if (conflicts && conflicts.length > 0) {
      return new Response(JSON.stringify({ error: "That time slot is no longer available." }), {
        status: 409,
        headers: corsHeaders,
      });
    }

    let existingPatient: any | null = null;

    // 4. Match existing patient by phone first.
    if (incomingPhone) {
      const { data: phoneCandidates, error: phoneError } = await supabaseAdmin
        .from("patients")
        .select("id, email, other_emails, cell_phone, first_name, last_name, allow_text")
        .eq("provider_id", providerId);

      if (phoneError) throw phoneError;

      existingPatient =
        phoneCandidates?.find((p) => {
          const digits = String(p.cell_phone || "").replace(/\D/g, "");
          return digits === incomingPhone;
        }) || null;
    }

    // 5. Match by primary or secondary email.
    if (!existingPatient && incomingEmail) {
      const { data: emailMatches, error: emailError } = await supabaseAdmin
        .from("patients")
        .select("id, email, other_emails, cell_phone, first_name, last_name, allow_text")
        .eq("provider_id", providerId)
        .or(`email_lower.eq.${incomingEmail},other_emails_lower.cs.{"${incomingEmail}"}`)
        .limit(1);

      if (emailError) throw emailError;

      if (emailMatches && emailMatches.length > 0) {
        existingPatient = emailMatches[0];
      }
    }

    // 6. Fallback match by name + email.
    if (!existingPatient && incomingEmail) {
      const { data: nameMatches, error: nameError } = await supabaseAdmin
        .from("patients")
        .select("id, email, other_emails, cell_phone, first_name, last_name, allow_text")
        .eq("provider_id", providerId)
        .eq("first_name_lower", incomingFirst)
        .eq("last_name_lower", incomingLast)
        .eq("email_lower", incomingEmail)
        .limit(1);

      if (nameError) throw nameError;

      if (nameMatches && nameMatches.length > 0) {
        existingPatient = nameMatches[0];
      }
    }

    let patientId: string;

    // 7. Update existing patient.
    if (existingPatient) {
      patientId = existingPatient.id;

      const currentPrimary = normalizeEmail(existingPatient.email);
      const currentOthers: string[] = existingPatient.other_emails ?? [];
      let updatedOthers = [...currentOthers];

      if (incomingEmail && incomingEmail !== currentPrimary) {
        if (currentPrimary && !updatedOthers.includes(currentPrimary)) {
          updatedOthers.push(currentPrimary);
        }

        if (!updatedOthers.includes(incomingEmail)) {
          updatedOthers.push(incomingEmail);
        }

        const { error: updateError } = await supabaseAdmin
          .from("patients")
          .update({
            email: incomingEmail,
            other_emails: updatedOthers,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", patientId)
          .eq("provider_id", providerId);

        if (updateError) throw updateError;
      } else {
        const { error: updateError } = await supabaseAdmin
          .from("patients")
          .update({
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", patientId)
          .eq("provider_id", providerId);

        if (updateError) throw updateError;
      }
    }

    // 8. Insert new patient.
    else {
      const { data: newPatient, error: insertPatientError } = await supabaseAdmin
        .from("patients")
        .insert({
          provider_id: providerId,
          first_name: patient.first_name,
          last_name: patient.last_name,
          email: incomingEmail,
          other_emails: [],
          cell_phone: incomingPhone,
          last_seen_at: new Date().toISOString(),
          allow_email: patient.allow_email ?? true,
          allow_text: patient.allow_text ?? true,
        })
        .select("id")
        .single();

      if (insertPatientError) throw insertPatientError;

      patientId = newPatient.id;
    }

    // 9. Create appointment.
    const { data: newAppt, error: insertApptError } = await supabaseAdmin
      .from("appointments")
      .insert({
        provider_id: providerId,
        patient_id: patientId,
        service_id: serviceId,
        start_time: startTime,
        end_time: endTime,
        status: appointment.status ?? "booked",
        patient_note: appointment.patient_note ?? null,
      })
      .select()
      .single();

    if (insertApptError) throw insertApptError;

    return new Response(
      JSON.stringify({
        appointment: newAppt,
        existingPatientAllowText: existingPatient?.allow_text ?? null,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err) {
    console.error("❌ createBooking error:", err);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unexpected booking error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});