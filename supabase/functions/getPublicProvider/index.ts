// supabase/functions/getPublicProvider/index.ts
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
    const subdomain = String(body?.subdomain || "").trim().toLowerCase();

    if (!subdomain) {
      return new Response(JSON.stringify({ error: "Missing subdomain" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: provider, error } = await supabaseAdmin
      .from("providers")
      .select(
        "id, office_name, phone, street, city, state, zip, announcement, logo_url, timezone, subdomain"
      )
      .eq("subdomain", subdomain)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    if (!provider) {
      return new Response(JSON.stringify({ error: "Provider not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ provider }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("❌ getPublicProvider error:", err);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unexpected provider lookup error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});