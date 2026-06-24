// supabase/functions/_shared/supabaseAdminClient.ts
// @ts-nocheck

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Server-side Supabase admin client for Edge Functions only.
 *
 * IMPORTANT:
 * - Uses SUPABASE_SERVICE_ROLE_KEY.
 * - Never import this into src/ browser code.
 * - Never expose SUPABASE_SERVICE_ROLE_KEY in Vite env variables.
 */
export const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);