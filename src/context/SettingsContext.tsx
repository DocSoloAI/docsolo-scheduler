// src/context/SettingsContext.tsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface SettingsContextType {
  services: any[];
  availability: any[];
  patients: any[];
  appointments: any[];
  loading: boolean;
  reload: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({
  providerId,
  includePrivateData = false,
  children,
}: {
  providerId: string;
  includePrivateData?: boolean;
  children: React.ReactNode;
}) {
  const [services, setServices] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);

    const [svcRes, availRes] = await Promise.all([
      supabase
        .from("services")
        .select(
          "id, provider_id, name, description, duration_minutes, is_active, default_for, color"
        )
        .eq("provider_id", providerId),

      supabase
        .from("availability")
        .select("*")
        .eq("provider_id", providerId),
    ]);

    if (svcRes.data) setServices(svcRes.data);
    if (availRes.data) setAvailability(availRes.data);

    if (includePrivateData) {
      const [patRes, apptRes] = await Promise.all([
        supabase
          .from("patients")
          .select("id, first_name, last_name, email, cell_phone")
          .eq("provider_id", providerId),

        supabase
          .from("appointments")
          .select(
            `
            id,
            start_time,
            end_time,
            service_id,
            patient_id,
            status,
            patients:patient_id (first_name, last_name)
          `
          )
          .eq("provider_id", providerId),
      ]);

      if (patRes.data) setPatients(patRes.data);
      if (apptRes.data) setAppointments(apptRes.data);
    } else {
      setPatients([]);
      setAppointments([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [providerId, includePrivateData]);

  return (
    <SettingsContext.Provider
      value={{
        services,
        availability,
        patients,
        appointments,
        loading,
        reload: loadAll,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx)
    throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}