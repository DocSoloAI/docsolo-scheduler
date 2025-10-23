import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useSettings } from "@/context/SettingsContext";
import { Plus, Save } from "lucide-react";
import {
  Card,
  CardHeader,
  // CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Service {
  id?: string;
  provider_id: string;
  name: string;
  description?: string;
  duration_minutes: number;
  is_active: boolean;
  isCustom?: boolean;
  default_for?: "new" | "established" | null;
  color?: string;
}

const presetDurations = [15, 20, 30, 45, 60];

interface ServicesTabProps {
  providerId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function ServicesTab({ providerId, onDirtyChange }: ServicesTabProps) {
  const { services: ctxServices, reload, loading } = useSettings();
  const [services, setServices] = useState<Service[]>([]);
  const [dirty, setDirty] = useState(false);

  // 🔄 Load from context
  useEffect(() => {
    if (ctxServices && ctxServices.length > 0) {
      setServices(
        ctxServices.map((s: any) => ({
          ...s,
          isCustom: !presetDurations.includes(s.duration_minutes),
          color: s.color || "#3b82f6",
        }))
      );
    } else if (providerId) {
      setServices([
        {
          provider_id: providerId,
          name: "Returning Patient",
          description: "Book a follow-up Chiropractic Treatment.",
          duration_minutes: 30,
          is_active: true,
          default_for: "established",
          color: "#3b82f6",
        },
        {
          provider_id: providerId,
          name: "New Patient",
          description: "Book your first New Patient Evaluation.",
          duration_minutes: 60,
          is_active: true,
          default_for: "new",
          color: "#16a34a",
        },
      ]);
    }
  }, [ctxServices, providerId]);

  const markDirty = () => {
    setDirty(true);
    onDirtyChange?.(true);
  };

  const updateService = <K extends keyof Service>(
    idx: number,
    field: K,
    value: Service[K]
  ) => {
    let updated = [...services];
    if (field === "default_for" && value) {
      updated = updated.map((s, i) =>
        i !== idx && s.default_for === value ? { ...s, default_for: null } : s
      );
    }
    updated[idx] = { ...updated[idx], [field]: value };
    setServices(updated);
    markDirty();
  };

  const addService = () => {
    setServices([
      ...services,
      {
        provider_id: providerId,
        name: "New Service",
        description: "",
        duration_minutes: 30,
        is_active: true,
        default_for: null,
        color: "#3b82f6",
      },
    ]);
    markDirty();
  };

  const saveServices = async () => {
    const { data: existing } = await supabase
      .from("services")
      .select("id")
      .eq("provider_id", providerId);

    const existingIds = new Set(existing?.map((r) => r.id));
    const currentIds = new Set(services.filter((s) => s.id).map((s) => s.id));
    const idsToDelete = [...existingIds].filter((id) => !currentIds.has(id));

    const prepared = services.map((s) => ({
      id: s.id ?? crypto.randomUUID(),
      provider_id: s.provider_id,
      name: s.name.trim(),
      description: s.description?.trim() || null,
      duration_minutes: s.duration_minutes,
      is_active: s.is_active,
      default_for: s.default_for ?? null,
      color: s.color || "#3b82f6",
    }));

    const { error: upsertError } = await supabase.from("services").upsert(prepared);
    if (upsertError) {
      alert("Error saving services: " + upsertError.message);
      return;
    }

    if (idsToDelete.length > 0) {
      await supabase.from("services").delete().in("id", idsToDelete);
    }

    setDirty(false);
    onDirtyChange?.(false);
    reload();
    alert("✅ Services saved successfully.");
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Loading services…</div>;
  }

  return (
    <div className="relative pb-32 space-y-6 max-w-3xl mx-auto">
      <div className="space-y-4">
        {services.map((service, idx) => (
          <Card
            key={service.id || idx}
            className="bg-gray-50 border-gray-200 hover:shadow-sm transition rounded-xl"
          >
            <CardHeader className="flex flex-col gap-2 p-4 pb-0">
              <div className="flex items-center justify-between flex-wrap gap-3">
                {/* 🎨 Color + Service Name */}
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={service.color || "#3b82f6"}
                    onChange={(e) => updateService(idx, "color", e.target.value)}
                    className="w-7 h-7 rounded-md border border-gray-300 shadow-sm cursor-pointer hover:scale-[1.05] transition-transform"
                  />
                  <input
                    type="text"
                    value={service.name}
                    onChange={(e) => updateService(idx, "name", e.target.value)}
                    className="text-lg font-semibold text-gray-800 bg-transparent border-b border-transparent focus:border-blue-400 outline-none w-56 md:w-72"
                    placeholder="Service name"
                  />
                </div>

                {/* 🗑 Delete button */}
                <button
                  onClick={() => {
                    if (confirm(`Delete service "${service.name}"?`)) {
                      const updated = services.filter((_, i) => i !== idx);
                      setServices(updated);
                      markDirty();
                    }
                  }}
                  className="
                    text-sm font-medium text-red-600 
                    bg-red-50 hover:bg-red-100 
                    border border-red-200 hover:border-red-300
                    rounded-md px-3 py-1.5 
                    transition-all duration-150
                    focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1
                  "
                >
                  Delete
                </button>
              </div>
            </CardHeader>


            <CardContent className="p-4 space-y-4">
              {/* Line 2: Description */}
              <textarea
                value={service.description || ""}
                onChange={(e) => updateService(idx, "description", e.target.value)}
                className="w-full border border-gray-200 rounded-md p-2 text-sm resize-none focus:ring-1 focus:ring-blue-400"
                rows={2}
                placeholder="Short description (what patients will see when booking)"
              />

              {/* Line 3: Duration + Auto-select */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Duration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration
                  </label>
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
                    className="w-full border-gray-300 rounded-md p-2 text-sm"
                  >
                    {presetDurations.map((d) => (
                      <option key={d} value={d}>
                        {d} min
                      </option>
                    ))}
                    <option value="custom">Custom…</option>
                  </select>
                  {service.isCustom && (
                    <input
                      type="number"
                      min={1}
                      max={480}
                      value={service.duration_minutes}
                      onChange={(e) =>
                        updateService(idx, "duration_minutes", Number(e.target.value))
                      }
                      className="mt-2 w-full border-gray-300 rounded-md p-2 text-sm"
                      placeholder="Enter minutes"
                    />
                  )}
                </div>

                {/* Auto-select */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Automatically use for
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
                    className="w-full border-gray-300 rounded-md p-2 text-sm"
                  >
                    <option value="">— No automatic selection —</option>
                    <option value="established">Returning Patients</option>
                    <option value="new">New Patients</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {services.length === 0 && (
          <div className="text-center text-gray-500 py-10">
            No services yet.
            <div>
              <Button onClick={addService} className="mt-3">
                <Plus size={16} className="mr-1" /> Add Service
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg py-3 px-4 flex justify-between items-center z-10">
        <Button onClick={addService} className="flex items-center gap-1">
          <Plus size={16} /> Add Service
        </Button>

        <Button
          onClick={saveServices}
          disabled={!dirty}
          className={
            dirty
              ? "bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
              : "bg-gray-200 text-gray-500 cursor-not-allowed flex items-center gap-2"
          }
        >
          <Save size={16} /> {dirty ? "Save Changes" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
