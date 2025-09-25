// scripts/seedTemplates.ts
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { defaultTemplates } from "../src/lib/defaultTemplates.ts";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials. Check your .env.local file.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedTemplates() {
  const providerId = "58607fe5-b961-4819-86b6-48340afb1d21"; // 👈 replace with your real provider_id

  const templates = defaultTemplates(providerId);

  for (const tmpl of templates) {
    const { error } = await supabase
      .from("email_templates")
      .upsert(tmpl, { onConflict: "provider_id,template_type" });

    if (error) {
      console.error("❌ Error inserting", tmpl.template_type, error.message);
    } else {
      console.log("✅ Seeded", tmpl.template_type);
    }
  }
}

seedTemplates();
