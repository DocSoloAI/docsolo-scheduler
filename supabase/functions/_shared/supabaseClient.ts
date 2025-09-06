// @ts-nocheck

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ✅ Use Deno.env in Edge Functions (not process.env or import.meta.env)
export const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!
);
