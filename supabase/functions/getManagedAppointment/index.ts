// supabase/functions/getManagedAppointment/index.ts
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

    const { data: appointment, error } = await supabaseAdmin
      .from("appointments")
      .select(
        `
        id,
        status,
        start_time,
        patients ( first_name, last_name ),
        providers ( office_name, street, city, state, zip, phone, email, id ),
        services ( name )
      `
      )
      .eq("id", appointmentId)
      .eq("manage_token", manageToken)
      .maybeSingle();

    if (error) throw error;

    if (!appointment) {
      return new Response(
        JSON.stringify({ error: "Appointment not found or invalid link" }),
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    return new Response(JSON.stringify({ appointment }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("❌ getManagedAppointment error:", err);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unexpected appointment lookup error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});