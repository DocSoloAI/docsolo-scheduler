// supabase/functions/rescheduleBooking/index.ts
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
      manageToken,
      providerId,
      serviceId,
      startTime,
      endTime,
    } = body;

    if (
      !appointmentId ||
      !manageToken ||
      !providerId ||
      !serviceId ||
      !startTime ||
      !endTime
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required reschedule fields" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // 1. Confirm provider exists and is active.
    const { data: provider, error: providerError } = await supabaseAdmin
      .from("providers")
      .select("id, is_active")
      .eq("id", providerId)
      .maybeSingle();

    if (providerError) throw providerError;

    if (!provider || provider.is_active === false) {
      return new Response(
        JSON.stringify({ error: "Provider not found or inactive" }),
        {
          status: 404,
          headers: corsHeaders,
        }
      );
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
      return new Response(
        JSON.stringify({ error: "Service not found or inactive" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // 3. Confirm appointment exists, belongs to provider, and token matches.
    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .select("id, provider_id, manage_token, status, start_time")
      .eq("id", appointmentId)
      .eq("provider_id", providerId)
      .eq("manage_token", manageToken)
      .maybeSingle();

    if (appointmentError) throw appointmentError;

    if (!appointment) {
      return new Response(
        JSON.stringify({ error: "Appointment not found or invalid link" }),
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    if (appointment.status === "cancelled") {
      return new Response(
        JSON.stringify({ error: "This appointment has already been cancelled" }),
        {
          status: 409,
          headers: corsHeaders,
        }
      );
    }

    // 4. Check for appointment conflicts, excluding the appointment being rescheduled.
    const { data: conflicts, error: conflictError } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("provider_id", providerId)
      .eq("status", "booked")
      .neq("id", appointmentId)
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .limit(1);

    if (conflictError) throw conflictError;

    if (conflicts && conflicts.length > 0) {
      return new Response(
        JSON.stringify({ error: "That time slot is no longer available." }),
        {
          status: 409,
          headers: corsHeaders,
        }
      );
    }

    // 5. Update the appointment.
    const { data: updatedAppointment, error: updateError } = await supabaseAdmin
      .from("appointments")
      .update({
        service_id: serviceId,
        start_time: startTime,
        end_time: endTime,
        status: "booked",
      })
      .eq("id", appointmentId)
      .eq("provider_id", providerId)
      .eq("manage_token", manageToken)
      .select("id, manage_token, start_time")
      .single();

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        appointment: updatedAppointment,
        previousStartTime: appointment.start_time,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err) {
    console.error("❌ rescheduleBooking error:", err);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unexpected reschedule error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});