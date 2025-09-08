// src/pages/Scheduler.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
}

export default function Scheduler() {
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    async function loadServices() {
      const { data, error } = await supabase.from("services").select("*");
      if (error) {
        console.error("Error fetching services:", error.message);
      } else {
        setServices(data);
      }
    }
    loadServices();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
      <h1 className="text-3xl font-bold text-blue-600 mb-6">DocSoloScheduler 🚀</h1>

      <h2 className="text-xl font-semibold mb-4">Available Services</h2>
      <ul className="space-y-2">
        {services.length > 0 ? (
          services.map((s) => (
            <li key={s.id} className="p-3 bg-white rounded shadow w-72 text-center">
              {s.name} ({s.duration_minutes} min block)
            </li>
          ))
        ) : (
          <li className="text-gray-500">Loading services...</li>
        )}
      </ul>
    </div>
  );
}
