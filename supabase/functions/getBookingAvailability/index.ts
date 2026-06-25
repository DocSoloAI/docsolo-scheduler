// supabase/functions/getBookingAvailability/index.ts
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
      providerId,
      startOfDayUTC,
      endOfDayUTC,
      selectedDateISO,
      excludeAppointmentId,
      manageToken,
    } = body;

    if (!providerId || !startOfDayUTC || !endOfDayUTC) {
      return new Response(
        JSON.stringify({ error: "Missing required availability fields" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Optional reschedule safety:
    // If the booking page asks to exclude the current appointment,
    // require the matching manage token before excluding it.
    let verifiedExcludeAppointmentId: string | null = null;

    if (excludeAppointmentId) {
      if (!manageToken) {
        return new Response(
          JSON.stringify({ error: "Missing management token for reschedule availability" }),
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      const { data: managedAppointment, error: managedError } =
        await supabaseAdmin
          .from("appointments")
          .select("id")
          .eq("id", excludeAppointmentId)
          .eq("provider_id", providerId)
          .eq("manage_token", manageToken)
          .maybeSingle();

      if (managedError) throw managedError;

      if (!managedAppointment) {
        return new Response(
          JSON.stringify({ error: "Invalid appointment management link" }),
          {
            status: 404,
            headers: corsHeaders,
          }
        );
      }

      verifiedExcludeAppointmentId = managedAppointment.id;
    }

    const selectedDate =
      selectedDateISO || new Date(startOfDayUTC).toISOString().slice(0, 10);

    const [appointmentsRes, timeOffRes, overridesRes] = await Promise.all([
      supabaseAdmin
        .from("appointments")
        .select("id, start_time, end_time")
        .eq("provider_id", providerId)
        .eq("status", "booked")
        // Proper overlap logic:
        // appointment starts before day ends AND ends after day starts
        .lt("start_time", endOfDayUTC)
        .gt("end_time", startOfDayUTC),

      supabaseAdmin
        .from("time_off")
        .select("start_time, end_time, all_day, reason, off_date")
        .eq("provider_id", providerId)
        .or(
          `off_date.eq.${selectedDate},and(start_time.lte.${endOfDayUTC},end_time.gte.${startOfDayUTC})`
        ),

      supabaseAdmin
        .from("availability_overrides")
        .select("start_time, end_time, is_active")
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .lt("start_time", endOfDayUTC)
        .gt("end_time", startOfDayUTC),
    ]);

    if (appointmentsRes.error) throw appointmentsRes.error;
    if (timeOffRes.error) throw timeOffRes.error;
    if (overridesRes.error) throw overridesRes.error;

    const blockedSlots = (appointmentsRes.data || [])
      .filter((appt) => appt.id !== verifiedExcludeAppointmentId)
      .map((appt) => ({
        start_time: appt.start_time,
        end_time: appt.end_time,
      }));

    return new Response(
      JSON.stringify({
        blockedSlots,
        timeOffRows: timeOffRes.data || [],
        availabilityOverrides: overridesRes.data || [],
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );

  } catch (err) {
    console.error("❌ getBookingAvailability error:", err);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unexpected availability lookup error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});