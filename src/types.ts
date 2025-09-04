// src/types.ts

export interface Patient {
  id: string;
  provider_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  cell_phone: string | null;
  home_phone: string | null;
  birthday: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at?: string;
  auth_user_id?: string | null; // optional patient login link
}

export interface Service {
  id: string;
  provider_id: string;
  name: string;
  duration_minutes?: number; // ✅ keep optional in case of Supabase partial
  duration_min?: number;     // ✅ include both to cover cases
  is_active: boolean;
  type?: "established" | "new"; // ✅ optional fallback
  default_for?: "new" | "established"; // ✅ new column
  description?: string; // ✅ optional field for patient view
  created_at?: string;
}

