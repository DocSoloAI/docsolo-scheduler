// supabase/functions/getPublicSchedulerSettings/index.ts
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
    const providerId = String(body?.providerId || "").trim();

    if (!providerId) {
      return new Response(JSON.stringify({ error: "Missing providerId" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const [svcRes, availRes] = await Promise.all([
      supabaseAdmin
        .from("services")
        .select(
          "id, provider_id, name, description, duration_minutes, is_active, default_for, color"
        )
        .eq("provider_id", providerId)
        .eq("is_active", true),

      supabaseAdmin
        .from("availability")
        .select("*")
        .eq("provider_id", providerId),
    ]);

    if (svcRes.error) throw svcRes.error;
    if (availRes.error) throw availRes.error;

    return new Response(
      JSON.stringify({
        services: svcRes.data || [],
        availability: availRes.data || [],
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err) {
    console.error("❌ getPublicSchedulerSettings error:", err);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unexpected scheduler settings error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});