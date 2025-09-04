// src/components/provider/ServicesTab.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useSettings } from "@/context/SettingsContext";

interface Service {
  id?: string;
  provider_id: string;
  name: string;
  duration_minutes: number;
  is_active: boolean;
  isCustom?: boolean;
  default_for?: "new" | "established" | null;
}

const presetDurations = [15, 20, 30, 45, 60];

interface ServicesTabProps {
  providerId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function ServicesTab({ providerId, onDirtyChange }: ServicesTabProps) {
  const { services: ctxServices, reload, loading } = useSettings();
  const [services, setServices] = useState<Service[]>([]);

  // Sync context → local state (adds isCustom)
  useEffect(() => {
    if (ctxServices && ctxServices.length > 0) {
      setServices(
        ctxServices.map((s: any) => ({
          ...s,
          isCustom: !presetDurations.includes(s.duration_minutes),
        }))
      );
    }
  }, [ctxServices]);

  const updateService = <K extends keyof Service>(
    idx: number,
    field: K,
    value: Service[K]
  ) => {
    let updated = [...services];

    // Enforce only one default per type
    if (field === "default_for" && value) {
      updated = updated.map((s, i) =>
        i !== idx && s.default_for === value ? { ...s, default_for: null } : s
      );
    }

    updated[idx] = { ...updated[idx], [field]: value };
    setServices(updated);
    onDirtyChange?.(true);
  };


  const deleteService = (idx: number) => {
    const newServices = [...services];
    newServices.splice(idx, 1);
    setServices(newServices);
    onDirtyChange?.(true);
  };

  const addService = () => {
    setServices([
      ...services,
      {
        provider_id: providerId,
        name: "New Service",
        duration_minutes: 30,
        is_active: true,
        isCustom: false,
      },
    ]);
    onDirtyChange?.(true);
  };

  const saveServices = async () => {
    // 1. Get existing rows from DB
    const { data: existing } = await supabase
      .from("services")
      .select("id")
      .eq("provider_id", providerId);

    const existingIds = new Set(existing?.map((r) => r.id));
    const currentIds = new Set(services.filter((s) => s.id).map((s) => s.id));
    const idsToDelete = [...existingIds].filter((id) => !currentIds.has(id));

    // 2. Upsert current services
    const prepared = services.map((s) => ({
      id: s.id ?? crypto.randomUUID(),
      provider_id: s.provider_id,
      name: s.name,
      duration_minutes: s.duration_minutes,
      is_active: s.is_active,
      default_for: s.default_for ?? null,
    }));

    const { error: upsertError } = await supabase
      .from("services")
      .upsert(prepared);

    if (upsertError) {
      alert("Error saving services: " + upsertError.message);
      return;
    }

    // 3. Delete removed
    if (idsToDelete.length > 0) {
      await supabase.from("services").delete().in("id", idsToDelete);
    }

    alert("Services saved ✅");
    onDirtyChange?.(false);

    // ✅ refresh context → stays canonical
    reload();
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading services…</div>;
  }

  return (
    <div className="space-y-6">
      {services.map((service, idx) => (
        <div
          key={service.id || idx}
          className="border-b pb-4 mb-6 px-2 pt-4 rounded bg-gray-50 shadow-sm"
        >
          {/* Service Name */}
          <div className="mb-2">
            <label className="block text-sm font-semibold mb-1">Service Name</label>
            <input
              type="text"
              value={service.name}
              onChange={(e) => updateService(idx, "name", e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>

          {/* Duration & Active Toggle */}
          <div className="flex items-center gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Duration</label>
              <select
                value={service.isCustom ? "custom" : String(service.duration_minutes)}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    updateService(idx, "isCustom", true);
                  } else {
                    updateService(idx, "isCustom", false);
                    updateService(idx, "duration_minutes", Number(e.target.value));
                  }
                }}
                className="border p-2 rounded w-32"
              >
                {presetDurations.map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            </div>

            {service.isCustom && (
              <div>
                <label className="block text-sm font-semibold mb-1">Custom Duration</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={service.duration_minutes}
                  onChange={(e) => updateService(idx, "duration_minutes", Number(e.target.value))}
                  className="border p-2 rounded w-28"
                />
              </div>
            )}

            <div className="flex items-center mt-6">
              <input
                type="checkbox"
                checked={!!service.is_active}
                onChange={(e) => updateService(idx, "is_active", e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Active</span>
            </div>
          </div>

          {/* Default For */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1">
              Use this service for…
              <span className="text-xs text-gray-500 ml-2">(auto-selected by patient type)</span>
            </label>
            <select
              value={service.default_for || ""}
              onChange={(e) =>
                updateService(
                  idx,
                  "default_for",
                  e.target.value === "new" || e.target.value === "established"
                    ? e.target.value
                    : null
                )
              }
              className="border p-2 rounded w-64"
            >
              <option value="">— Not a default —</option>
              <option value="established">Established Patient</option>
              <option value="new">New Patient</option>
            </select>
          </div>

          {/* Delete Button */}
          <button
            className="bg-red-500 text-white px-3 py-1 text-sm rounded"
            onClick={() => deleteService(idx)}
          >
            Delete Service
          </button>
        </div>
      ))}


      <div className="flex gap-2">
        <button
          onClick={addService}
          className="bg-blue-500 text-white px-3 py-1 rounded"
        >
          + Add Service
        </button>
        <button
          onClick={saveServices}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Save All Services
        </button>
      </div>
    </div>
  );
}
