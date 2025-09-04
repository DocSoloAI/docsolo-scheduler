// src/components/provider/HoursTab.tsx
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/context/SettingsContext";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Availability {
  id?: string;
  provider_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface HoursTabProps {
  providerId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function HoursTab({ providerId, onDirtyChange }: HoursTabProps) {
  const { availability: ctxHours, reload, loading } = useSettings();
  const [hours, setHours] = useState<Availability[]>([]);

  // Sync context → local state (normalize to HH:mm)
  useEffect(() => {
    if (ctxHours) {
      const normalized = ctxHours.map((h: any) => ({
        ...h,
        start_time: h.start_time.slice(0, 5),
        end_time: h.end_time.slice(0, 5),
      }));
      setHours(normalized);
    }
  }, [ctxHours]);

  const updateHour = <K extends keyof Availability>(
    idx: number,
    field: K,
    value: Availability[K]
  ) => {
    const newHours = [...hours];
    const block = { ...newHours[idx], [field]: value };

    if (field === "start_time" && block.end_time <= (value as string)) {
      const [h, m] = (value as string).split(":").map(Number);
      const bumped = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      block.end_time = bumped;
    }

    const overlaps = hours.some((h, i) =>
      i !== idx &&
      h.day_of_week === block.day_of_week &&
      h.is_active &&
      !(block.end_time <= h.start_time || block.start_time >= h.end_time)
    );

    if (overlaps) {
      alert("This block overlaps an existing block for the same day.");
      return;
    }

    newHours[idx] = block;
    setHours(newHours);
    onDirtyChange?.(true);
  };

  const deleteBlock = (globalIndex: number) => {
    const newHours = [...hours];
    newHours.splice(globalIndex, 1);
    setHours(newHours);
    onDirtyChange?.(true);
  };

  const addBlock = (dayIndex: number) => {
    const blocksForDay = hours.filter((h) => h.day_of_week === dayIndex);

    if (blocksForDay.length === 0) {
      setHours([
        ...hours,
        { provider_id: providerId, day_of_week: dayIndex, start_time: "09:00", end_time: "18:00", is_active: true },
      ]);
      onDirtyChange?.(true);
      return;
    }

    if (blocksForDay.length === 1) {
      const firstIdx = hours.findIndex((h) => h === blocksForDay[0]);
      const newHours = [...hours];
      newHours[firstIdx] = { ...newHours[firstIdx], start_time: "09:00", end_time: "12:00" };

      setHours([
        ...newHours,
        { provider_id: providerId, day_of_week: dayIndex, start_time: "14:00", end_time: "18:00", is_active: true },
      ]);
      onDirtyChange?.(true);
      return;
    }

    const lastBlock = blocksForDay[blocksForDay.length - 1];
    const [h] = lastBlock.end_time.split(":").map(Number);
    const nextHour = h + 1;
    const endHour = nextHour + 3;

    setHours([
      ...hours,
      {
        provider_id: providerId,
        day_of_week: dayIndex,
        start_time: `${String(nextHour).padStart(2, "0")}:00`,
        end_time: `${String(endHour).padStart(2, "0")}:00`,
        is_active: true,
      },
    ]);
    onDirtyChange?.(true);
  };

  const saveHours = async () => {
    const { data: existing } = await supabase
      .from("availability")
      .select("id")
      .eq("provider_id", providerId);

    const existingIds = new Set(existing?.map((r) => r.id));
    const currentIds = new Set(hours.filter((h) => h.id).map((h) => h.id));
    const idsToDelete = [...existingIds].filter((id) => !currentIds.has(id));

    const prepared = hours.map((h) => ({
      ...h,
      id: h.id ?? crypto.randomUUID(),
    }));

    const { error: upsertError } = await supabase.from("availability").upsert(prepared);
    if (upsertError) {
      alert("Error saving hours: " + upsertError.message);
      return;
    }

    if (idsToDelete.length > 0) {
      await supabase.from("availability").delete().in("id", idsToDelete);
    }

    alert("Hours saved ✅");
    onDirtyChange?.(false);

    // refresh context
    reload();
  };

  if (loading) return <div className="p-4 text-gray-500">Loading hours…</div>;

  return (
    <div className="space-y-6">
      {days.map((day, dayIndex) => {
        const blocks = hours.filter((h) => h.day_of_week === dayIndex);

        return (
          <div key={day} className="space-y-2 border-b pb-3">
            <div className="flex items-center justify-between">
              <label className="font-medium">{day}</label>
              <div className="flex gap-2">
                {/* COPY TO DAYS */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">Copy to…</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2 space-y-2">
                    {days.map((d, idx2) =>
                      idx2 !== dayIndex ? (
                        <div key={d} className="flex items-center space-x-2">
                          <Checkbox
                            id={`copy-${dayIndex}-${idx2}`}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const filtered = hours.filter((h) => h.day_of_week !== idx2);
                                const copied = blocks.map((b) => ({
                                  ...b,
                                  id: undefined,
                                  day_of_week: idx2,
                                }));
                                setHours([...filtered, ...copied]);
                              }
                            }}
                          />
                          <label htmlFor={`copy-${dayIndex}-${idx2}`} className="text-sm">
                            {d}
                          </label>
                        </div>
                      ) : null
                    )}
                  </PopoverContent>
                </Popover>

                {/* ADD BLOCK */}
                <button
                  className="bg-blue-500 text-white px-2 py-1 text-sm rounded"
                  onClick={() => addBlock(dayIndex)}
                >
                  + Add Time Block
                </button>
              </div>
            </div>

            {blocks.length === 0 && <p className="text-sm text-gray-500">No hours set</p>}

            {blocks.map((block) => {
              const globalIndex = hours.findIndex((h) => h === block);

              const times = Array.from({ length: 24 * 4 }, (_, i) => {
                const hours = Math.floor(i / 4);
                const minutes = (i % 4) * 15;
                const t = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
                const label = new Date(`1970-01-01T${t}:00`).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return { value: t, label };
              });

              return (
                <div key={block.id || globalIndex} className="flex items-center gap-2">
                  <Select
                    value={block.start_time}
                    onValueChange={(val) => updateHour(globalIndex, "start_time", val)}
                  >
                    <SelectTrigger className="w-[120px] border rounded">
                      <SelectValue placeholder="Start" />
                    </SelectTrigger>
                    <SelectContent>
                      {times.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span>-</span>

                  <Select
                    value={block.end_time}
                    onValueChange={(val) => updateHour(globalIndex, "end_time", val)}
                  >
                    <SelectTrigger className="w-[120px] border rounded">
                      <SelectValue placeholder="End" />
                    </SelectTrigger>
                    <SelectContent>
                      {times
                        .filter((t) => t.value > block.start_time)
                        .map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={block.is_active}
                      onChange={(e) => updateHour(globalIndex, "is_active", e.target.checked)}
                    />
                    Active
                  </label>

                  <button
                    className="bg-red-500 text-white px-2 py-1 text-xs rounded"
                    onClick={() => deleteBlock(globalIndex)}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      <button
        onClick={saveHours}
        className="bg-green-600 text-white px-4 py-2 rounded"
      >
        Save All Hours
      </button>
    </div>
  );
}
