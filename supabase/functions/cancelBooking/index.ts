// supabase/functions/cancelBooking/index.ts
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

    const { appointmentId, manageToken } = body;

    if (!appointmentId || !manageToken) {
      return new Response(
        JSON.stringify({ error: "Missing appointment ID or management token" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // 1. Fetch appointment only if token matches.
    const { data: appointment, error: fetchError } = await supabaseAdmin
      .from("appointments")
      .select(
        `
        id,
        start_time,
        status,
        manage_token,
        provider_id,
        services ( name ),
        patients ( first_name, last_name, email, cell_phone, home_phone ),
        providers ( id, office_name, email, phone, street, city, state, zip )
      `
      )
      .eq("id", appointmentId)
      .eq("manage_token", manageToken)
      .maybeSingle();

    if (fetchError) throw fetchError;

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
        JSON.stringify({ error: "This appointment is already cancelled" }),
        {
          status: 409,
          headers: corsHeaders,
        }
      );
    }

    // 2. Cancel appointment, still requiring matching token.
    const { data: cancelledAppointment, error: updateError } =
      await supabaseAdmin
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appointmentId)
        .eq("manage_token", manageToken)
        .select("id, status")
        .single();

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        appointment: cancelledAppointment,
        appointmentDetails: appointment,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err) {
    console.error("❌ cancelBooking error:", err);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unexpected cancellation error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});