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
import { Input } from "@/components/ui/input";
import { useSettings } from "@/context/SettingsContext";

const HOLIDAYS = [
  { key: "new_years", label: "New Year's Day (Jan 1)" },
  { key: "mlk_day", label: "MLK Jr. Day (3rd Mon in Jan)" },
  { key: "memorial_day", label: "Memorial Day (last Mon in May)" },
  { key: "independence_day", label: "Independence Day (Jul 4)" },
  { key: "labor_day", label: "Labor Day (1st Mon in Sep)" },
  { key: "thanksgiving", label: "Thanksgiving (4th Thu in Nov)" },
  { key: "christmas", label: "Christmas Day (Dec 25)" },
];

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

// --- holiday helpers ---
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  let d = new Date(year, month, 1);
  let count = 0;
  while (true) {
    if (d.getDay() === weekday) {
      count++;
      if (count === n) return d;
    }
    d.setDate(d.getDate() + 1);
  }
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  let d = new Date(year, month + 1, 0);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function computeHolidayDates(key: string, startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const years = [startDate.getFullYear(), endDate.getFullYear()];

  const pushIfInRange = (d: Date) => {
    if (d >= startDate && d <= endDate) dates.push(d);
  };

  for (const year of years) {
    switch (key) {
      case "new_years":
        pushIfInRange(new Date(year, 0, 1));
        break;
      case "mlk_day":
        pushIfInRange(nthWeekdayOfMonth(year, 0, 1, 3)); // 3rd Monday Jan
        break;
      case "memorial_day":
        pushIfInRange(lastWeekdayOfMonth(year, 4, 1)); // last Monday May
        break;
      case "independence_day":
        pushIfInRange(new Date(year, 6, 4));
        break;
      case "labor_day":
        pushIfInRange(nthWeekdayOfMonth(year, 8, 1, 1)); // 1st Monday Sep
        break;
      case "thanksgiving":
        pushIfInRange(nthWeekdayOfMonth(year, 10, 4, 4)); // 4th Thu Nov
        break;
      case "christmas":
        pushIfInRange(new Date(year, 11, 25));
        break;
    }
  }

  return dates;
}

export default function HoursTab({ providerId, onDirtyChange }: HoursTabProps) {
  const { availability: ctxHours, reload, loading } = useSettings();
  const [hours, setHours] = useState<Availability[]>([]);
  const [everyOtherSat, setEveryOtherSat] = useState(false);
  const [satStartDate, setSatStartDate] = useState<string>("");
  const [holidaySelections, setHolidaySelections] = useState<string[]>([]);

  // Load context + provider holiday selections
  useEffect(() => {
    if (ctxHours) {
      const normalized = ctxHours.map((h: any) => ({
        ...h,
        start_time: h.start_time.slice(0, 5),
        end_time: h.end_time.slice(0, 5),
      }));
      setHours(normalized);
    }

    // 🔄 Load Saturday + holiday settings from provider row
    const loadProviderSettings = async () => {
      const { data, error } = await supabase
        .from("providers")
        .select("every_other_saturday, saturday_start_date")
        .eq("id", providerId)
        .single();

      if (!error && data) {
        setEveryOtherSat(!!data.every_other_saturday);
        setSatStartDate(data.saturday_start_date || "");
      }
    };

    // 🔄 Load holiday selections
    const loadHolidays = async () => {
      const { data } = await supabase
        .from("provider_holidays")
        .select("holiday_key")
        .eq("provider_id", providerId);

      if (data) {
        setHolidaySelections(data.map((h) => h.holiday_key));
      }
    };

    loadProviderSettings();
    loadHolidays();
  }, [ctxHours, providerId]);


  const toggleHoliday = (key: string, checked: boolean) => {
    setHolidaySelections((prev) =>
      checked ? [...prev, key] : prev.filter((h) => h !== key)
    );
    onDirtyChange?.(true);
  };

  // ... updateHour, deleteBlock, addBlock (unchanged) ...
  const updateHour = <K extends keyof Availability>(idx: number, field: K, value: Availability[K]) => {
    const newHours = [...hours];
    const block = { ...newHours[idx], [field]: value };
    if (field === "start_time" && block.end_time <= (value as string)) {
      const [h, m] = (value as string).split(":").map(Number);
      const bumped = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      block.end_time = bumped;
    }
    const overlaps = hours.some(
      (h, i) =>
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
      setHours([...hours, { provider_id: providerId, day_of_week: dayIndex, start_time: "09:00", end_time: "18:00", is_active: true }]);
      onDirtyChange?.(true);
      return;
    }
    if (blocksForDay.length === 1) {
      const firstIdx = hours.findIndex((h) => h === blocksForDay[0]);
      const newHours = [...hours];
      newHours[firstIdx] = { ...newHours[firstIdx], start_time: "09:00", end_time: "12:00" };
      setHours([...newHours, { provider_id: providerId, day_of_week: dayIndex, start_time: "14:00", end_time: "18:00", is_active: true }]);
      onDirtyChange?.(true);
      return;
    }
    const lastBlock = blocksForDay[blocksForDay.length - 1];
    const [h] = lastBlock.end_time.split(":").map(Number);
    const nextHour = h + 1;
    const endHour = nextHour + 3;
    setHours([...hours, { provider_id: providerId, day_of_week: dayIndex, start_time: `${String(nextHour).padStart(2, "0")}:00`, end_time: `${String(endHour).padStart(2, "0")}:00`, is_active: true }]);
    onDirtyChange?.(true);
  };

  const saveHours = async () => {
    // Save availability
    const { data: existing } = await supabase.from("availability").select("id").eq("provider_id", providerId);
    const existingIds = new Set(existing?.map((r) => r.id));
    const currentIds = new Set(hours.filter((h) => h.id).map((h) => h.id));
    const idsToDelete = [...existingIds].filter((id) => !currentIds.has(id));
    const prepared = hours.map((h) => ({ ...h, id: h.id ?? generateId() }));
    const { error: upsertError } = await supabase.from("availability").upsert(prepared);
    if (upsertError) {
      alert("Error saving hours: " + upsertError.message);
      return;
    }
    if (idsToDelete.length > 0) {
      await supabase.from("availability").delete().in("id", idsToDelete);
    }

    // Save provider Saturday settings
    const { error: providerError } = await supabase.from("providers").update({ every_other_saturday: everyOtherSat, saturday_start_date: satStartDate || null }).eq("id", providerId);
    if (providerError) {
      alert("Error saving Saturday settings: " + providerError.message);
      return;
    }

    // Reset time_off for Sat + holidays
    await supabase.from("time_off").delete().eq("provider_id", providerId).in("reason", ["every_other_saturday", ...HOLIDAYS.map((h) => `holiday:${h.key}`)]);

    // Generate Sat closures (same as before)
    if (everyOtherSat && satStartDate) {
      const base = new Date(satStartDate); base.setHours(0, 0, 0, 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const endRange = new Date(today); endRange.setFullYear(endRange.getFullYear() + 1);
      const newRows: any[] = [];
      let current = new Date(today); while (current.getDay() !== 6) current.setDate(current.getDate() + 1);
      while (current <= endRange) {
        const diffWeeks = Math.floor((current.getTime() - base.getTime()) / (1000 * 60 * 60 * 24 * 7));
        if (diffWeeks % 2 === 1) {
          const s = new Date(current); s.setHours(0, 0, 0, 0);
          const e = new Date(current); e.setHours(23, 59, 59, 999);
          newRows.push({ provider_id: providerId, start_time: s.toISOString(), end_time: e.toISOString(), reason: "every_other_saturday" });
        }
        current.setDate(current.getDate() + 7);
      }
      if (newRows.length > 0) {
        const { error: toError } = await supabase.from("time_off").insert(newRows);
        if (toError) { alert("Error saving Saturday closures: " + toError.message); return; }
      }
    }

    // Save holiday selections + generate closures
    await supabase.from("provider_holidays").delete().eq("provider_id", providerId);
    if (holidaySelections.length > 0) {
      await supabase.from("provider_holidays").insert(
        holidaySelections.map((h) => ({ id: generateId(), provider_id: providerId, holiday_key: h }))
      );

      const today = new Date(); const endRange = new Date(today); endRange.setFullYear(endRange.getFullYear() + 1);
      const holidayRows: any[] = [];
      for (const key of holidaySelections) {
        const dates = computeHolidayDates(key, today, endRange);
        for (const d of dates) {
          const s = new Date(d); s.setHours(0, 0, 0, 0);
          const e = new Date(d); e.setHours(23, 59, 59, 999);
          holidayRows.push({ provider_id: providerId, start_time: s.toISOString(), end_time: e.toISOString(), reason: `holiday:${key}` });
        }
      }
      if (holidayRows.length > 0) {
        const { error: holidayErr } = await supabase.from("time_off").insert(holidayRows);
        if (holidayErr) { alert("Error saving holiday closures: " + holidayErr.message); return; }
      }
    }

    alert("Hours & holiday closures saved ✅");
    onDirtyChange?.(false);
    reload();
  };

  if (loading) return <div className="p-4 text-gray-500">Loading hours…</div>;

  return (
    <div className="space-y-6">
      {/* Hours editor (unchanged, your existing map over days) */}
      {days.map((day, dayIndex) => {
        const blocks = hours.filter((h) => h.day_of_week === dayIndex);
        return (
          <div key={day} className="space-y-2 border-b pb-3">
            {/* header row */}
            <div className="flex items-center justify-between">
              <label className="font-medium">{day}</label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild><Button variant="outline" size="sm">Copy to…</Button></PopoverTrigger>
                  <PopoverContent className="w-48 p-2 space-y-2">
                    {days.map((d, idx2) => idx2 !== dayIndex ? (
                      <div key={d} className="flex items-center space-x-2">
                        <Checkbox onCheckedChange={(checked) => {
                          if (checked) {
                            const filtered = hours.filter((h) => h.day_of_week !== idx2);
                            const copied = blocks.map((b) => ({ ...b, id: undefined, day_of_week: idx2 }));
                            setHours([...filtered, ...copied]);
                          }
                        }} />
                        <label className="text-sm">{d}</label>
                      </div>
                    ) : null)}
                  </PopoverContent>
                </Popover>
                <button className="bg-blue-500 text-white px-2 py-1 text-sm rounded" onClick={() => addBlock(dayIndex)}>+ Add Time Block</button>
              </div>
            </div>
            {blocks.length === 0 && <p className="text-sm text-gray-500">No hours set</p>}
            {blocks.map((block) => {
              const globalIndex = hours.findIndex((h) => h === block);
              const times = Array.from({ length: 24 * 4 }, (_, i) => {
                const h = Math.floor(i / 4); const m = (i % 4) * 15;
                const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                const label = new Date(`1970-01-01T${t}:00`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                return { value: t, label };
              });
              return (
                <div key={block.id || globalIndex} className="flex items-center gap-2">
                  <Select value={block.start_time} onValueChange={(val) => updateHour(globalIndex, "start_time", val)}>
                    <SelectTrigger className="w-[120px] border rounded"><SelectValue placeholder="Start" /></SelectTrigger>
                    <SelectContent>{times.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <span>-</span>
                  <Select value={block.end_time} onValueChange={(val) => updateHour(globalIndex, "end_time", val)}>
                    <SelectTrigger className="w-[120px] border rounded"><SelectValue placeholder="End" /></SelectTrigger>
                    <SelectContent>{times.filter((t) => t.value > block.start_time).map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={block.is_active} onChange={(e) => updateHour(globalIndex, "is_active", e.target.checked)} /> Active
                  </label>
                  <button className="bg-red-500 text-white px-2 py-1 text-xs rounded" onClick={() => deleteBlock(globalIndex)}>Delete</button>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Every other Saturday toggle */}
      <div className="mt-6 space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox checked={everyOtherSat} onCheckedChange={(val) => setEveryOtherSat(!!val)} />
          <label className="text-sm font-medium">Closed every other Saturday</label>
        </div>
        {everyOtherSat && (
          <div className="mt-2">
            <label className="block text-sm font-medium mb-1">Start with this Saturday as the first open one:</label>
            <Input type="date" value={satStartDate} onChange={(e) => setSatStartDate(e.target.value)} />
          </div>
        )}
      </div>

      {/* Save button */}
      <button onClick={saveHours} className="bg-green-600 text-white px-4 py-2 rounded">Save All Hours</button>

      {/* Holiday closures */}
      <div className="mt-8 border rounded p-4 bg-gray-50">
        <h3 className="font-semibold mb-2">Select the holiday closures for your office</h3>
        <div className="grid md:grid-cols-2 gap-2">
          {HOLIDAYS.map((h) => (
            <label key={h.key} className="flex items-center gap-2 text-sm">
              <Checkbox checked={holidaySelections.includes(h.key)} onCheckedChange={(val) => toggleHoliday(h.key, !!val)} />
              {h.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
