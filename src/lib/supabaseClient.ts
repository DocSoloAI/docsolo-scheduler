import { createClient } from "@supabase/supabase-js";

// ✅ Works in both Vite (browser) and Node scripts
const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
