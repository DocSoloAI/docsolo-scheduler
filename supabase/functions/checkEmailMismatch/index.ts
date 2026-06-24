// supabase/functions/checkEmailMismatch/index.ts
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

function normalizePhone(phone: string | null | undefined): string {
  return String(phone || "").replace(/\D/g, "");
}

function namesAreClose(a: string, b: string): boolean {
  if (!a || !b) return false;

  const aa = a.toLowerCase().trim();
  const bb = b.toLowerCase().trim();

  if (aa === bb) return true;

  return levenshteinDistance(aa, bb) <= 2;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
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

    const {
      providerId,
      firstName,
      lastName,
      cellPhone,
      email,
    } = body;

    const fn = String(firstName || "").trim();
    const ln = String(lastName || "").trim();
    const phone = normalizePhone(cellPhone);
    const enteredEmail = String(email || "").trim().toLowerCase();

    if (!providerId || !fn || !ln || phone.length !== 10 || !enteredEmail) {
      return new Response(JSON.stringify({ mismatch: false }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const { data, error } = await supabaseAdmin
      .from("patients")
      .select("first_name, last_name, email_lower, other_emails_lower, cell_phone")
      .eq("provider_id", providerId)
      .eq("last_name_lower", ln.toLowerCase())
      .limit(10);

    if (error) throw error;

    if (!data || data.length === 0) {
      return new Response(JSON.stringify({ mismatch: false }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const phoneMatches = data.filter((p: any) => {
      return normalizePhone(p.cell_phone) === phone;
    });

    const nameMatches = phoneMatches.filter((p: any) =>
      namesAreClose(p.first_name, fn)
    );

    if (nameMatches.length === 0) {
      return new Response(JSON.stringify({ mismatch: false }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const patient = nameMatches[0];

    const knownEmails = [
      ...(patient.email_lower ? [patient.email_lower] : []),
      ...(Array.isArray(patient.other_emails_lower)
        ? patient.other_emails_lower
        : []),
    ];

    const mismatch = !knownEmails.includes(enteredEmail);

    return new Response(JSON.stringify({ mismatch }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("❌ checkEmailMismatch error:", err);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unexpected email mismatch check error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});