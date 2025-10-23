// src/pages/Scheduler.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface Service {
  id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  color?: string | null;
}

export default function Scheduler() {
  const [providerId, setProviderId] = useState<string | null>(null);
  const [patientType, setPatientType] = useState<"new" | "established" | null>(
    null
  );
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 🧩 Step 1: Identify provider from subdomain
  useEffect(() => {
    async function fetchProvider() {
      try {
        const subdomain = window.location.hostname.split(".")[0];
        const { data: provider, error } = await supabase
          .from("providers")
          .select("id")
          .eq("subdomain", subdomain)
          .single();

        if (error || !provider) {
          setErrorMsg("Provider not found for this subdomain.");
          setLoading(false);
          return;
        }

        setProviderId(provider.id);
      } catch (err: any) {
        setErrorMsg(err.message);
        setLoading(false);
      }
    }

    fetchProvider();
  }, []);

  // 🧩 Step 2: Load matching services once patientType is chosen
  useEffect(() => {
    if (!providerId || !patientType) return;

    async function loadServices() {
      setLoading(true);
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, duration_minutes, color")
        .eq("provider_id", providerId)
        .eq("default_for", patientType)
        .eq("is_active", true)
        .order("name");

      if (error) {
        console.error("❌ Error fetching services:", error.message);
        setErrorMsg("Unable to load services.");
      } else {
        setServices(data || []);
        setErrorMsg(null);
      }

      setLoading(false);
    }

    loadServices();
  }, [providerId, patientType]);

  // 🧩 Step 3: Render UI
  if (loading && !patientType)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-gray-600">
        <p>Loading...</p>
      </div>
    );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <h1 className="text-3xl font-bold text-blue-600 mb-4">
        Book Your Visit
      </h1>

      {/* Step 1: Choose patient type */}
      {!patientType && !errorMsg && (
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">
            Are you a new or returning patient?
          </h2>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setPatientType("new")}
              className="bg-blue-600 text-white px-5 py-3 rounded-lg font-medium hover:bg-blue-700 shadow-sm transition"
            >
              I’m a New Patient
            </button>
            <button
              onClick={() => setPatientType("established")}
              className="bg-green-600 text-white px-5 py-3 rounded-lg font-medium hover:bg-green-700 shadow-sm transition"
            >
              I’m a Returning Patient
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Show matching services */}
      {patientType && (
        <div className="w-full max-w-lg mt-6">
          <button
            onClick={() => {
              setPatientType(null);
              setServices([]);
            }}
            className="text-sm text-gray-500 mb-4 hover:text-gray-700"
          >
            ← Change patient type
          </button>

          <h2 className="text-xl font-semibold text-gray-800 mb-4 text-center">
            Available {patientType === "new" ? "New Patient" : "Returning Patient"} Services
          </h2>

          {loading ? (
            <p className="text-gray-500 text-center">Loading services…</p>
          ) : services.length === 0 ? (
            <p className="text-gray-500 text-center">
              No services available for this category.
            </p>
          ) : (
            <ul className="space-y-3">
              {services.map((s) => (
                <li
                  key={s.id}
                  className="p-4 rounded-lg shadow-sm bg-white border border-gray-200 hover:shadow-md transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800">
                        {s.name}
                      </h3>
                      {s.description && (
                        <p className="text-sm text-gray-500 mt-1">
                          {s.description}
                        </p>
                      )}
                    </div>
                    <div
                      className="w-6 h-6 rounded-full border border-gray-300"
                      style={{
                        backgroundColor: s.color || "#3b82f6",
                      }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    {s.duration_minutes
                      ? `${s.duration_minutes} minutes`
                      : "Duration TBD"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Error state */}
      {errorMsg && (
        <div className="mt-6 text-center text-red-600">{errorMsg}</div>
      )}
    </div>
  );
}
