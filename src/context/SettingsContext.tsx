// src/context/SettingsContext.tsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface SettingsContextType {
  services: any[];
  availability: any[];  // ✅ renamed
  patients: any[];
  appointments: any[];
  loading: boolean;
  reload: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ providerId, children }: { providerId: string; children: React.ReactNode }) {
  const [services, setServices] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);

    const [svcRes, availRes, patRes, apptRes] = await Promise.all([
      supabase.from("services").select("id, name, duration_minutes").eq("provider_id", providerId),
      supabase.from("availability").select("*").eq("provider_id", providerId),   // ✅ fixed
      supabase.from("patients").select("id, first_name, last_name, email"),
      supabase.from("appointments").select(`
        id,
        start_time,
        end_time,
        service_id,
        patient_id,
        status,
        patients:patient_id (first_name, last_name)
      `).eq("provider_id", providerId),
    ]);

    if (svcRes.data) setServices(svcRes.data);
    if (availRes.data) setAvailability(availRes.data);
    if (patRes.data) setPatients(patRes.data);
    if (apptRes.data) setAppointments(apptRes.data);

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [providerId]);

  return (
    <SettingsContext.Provider value={{ services, availability, patients, appointments, loading, reload: loadAll }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
