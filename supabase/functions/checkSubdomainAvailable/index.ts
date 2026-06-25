// supabase/functions/checkSubdomainAvailable/index.ts
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
    const subdomain = String(body?.subdomain || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");

    if (!subdomain) {
      return new Response(
        JSON.stringify({
          available: false,
          error: "Missing subdomain",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const { data: existing, error } = await supabaseAdmin
      .from("providers")
      .select("id")
      .eq("subdomain", subdomain)
      .maybeSingle();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        available: !existing,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (err) {
    console.error("❌ checkSubdomainAvailable error:", err);

    return new Response(
      JSON.stringify({
        available: false,
        error: err?.message || "Unexpected subdomain check error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});