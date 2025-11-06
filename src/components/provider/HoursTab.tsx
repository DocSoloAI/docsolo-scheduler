// src/components/provider/HoursTab.tsx
import { useState, useEffect, useRef } from "react";
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
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { useSettings } from "@/context/SettingsContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner"; // ⚡ Add at top of file if not already imported
import { Label } from "@/components/ui/label";

// ---------------- constants ----------------
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

const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ---------------- types ----------------
interface Availability {
  id?: string;
  provider_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  slot_interval?: number;
}

interface HoursTabProps {
  providerId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

// ---------------- helpers ----------------
// 🕓 Convert a local time string like "09:00" to a plain "HH:mm:ss" with no timezone math
function toUTC(localTime: string): string {
  if (!localTime) return localTime;
  const [h, m] = localTime.split(":").map(Number);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}


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
        pushIfInRange(nthWeekdayOfMonth(year, 0, 1, 3));
        break;
      case "memorial_day":
        pushIfInRange(lastWeekdayOfMonth(year, 4, 1));
        break;
      case "independence_day":
        pushIfInRange(new Date(year, 6, 4));
        break;
      case "labor_day":
        pushIfInRange(nthWeekdayOfMonth(year, 8, 1, 1));
        break;
      case "thanksgiving":
        pushIfInRange(nthWeekdayOfMonth(year, 10, 4, 4));
        break;
      case "christmas":
        pushIfInRange(new Date(year, 11, 25));
        break;
    }
  }
  return dates;
}


// ---------------- component ----------------
export default function HoursTab({ providerId, onDirtyChange }: HoursTabProps) {
  const { availability: ctxHours, reload, loading } = useSettings();
  const [hours, setHours] = useState<Availability[]>([]);
  const [saving, setSaving] = useState(false);
  const [providerTimezone, setProviderTimezone] = useState("America/New_York");

useEffect(() => {
  if (!providerTimezone) setProviderTimezone("America/New_York");
}, [providerTimezone]);

  const [holidaySelections, setHolidaySelections] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [lastSavedState, setLastSavedState] = useState<any | null>(null);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const pendingTabRef = useRef<string | null>(null);

  // Handle unsaved changes warning
  useEffect(() => {
    // 1️⃣ Native browser unload (tab close or refresh)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        // @ts-ignore: returnValue is required for legacy browser unload warnings
        e.returnValue = "";
      }
    };


    // 2️⃣ Custom in-app navigation (Dashboard tab changes)
    const handleInternalNav = (e: CustomEvent) => {
      if (dirty) {
        e.preventDefault?.();
        // Save the intended tab so we can resume later
        pendingTabRef.current = (e.detail as any)?.target ?? null;

        setShowUnsavedWarning(false);
        setTimeout(() => setShowUnsavedWarning(true), 10);
        setTimeout(() => setShowUnsavedWarning(false), 5000);
        return false; // stop navigation for now
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("docsolo:navigate", handleInternalNav as EventListener);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("docsolo:navigate", handleInternalNav as EventListener);
    };
  }, [dirty]);

  useEffect(() => {
    const loadProviderTimezone = async () => {
      if (!providerId) return;
      const { data, error } = await supabase
        .from("providers")
        .select("timezone")
        .eq("id", providerId)
        .single();
      if (error) {
        console.error("❌ Error loading provider timezone:", error.message);
        return;
      }
      if (data?.timezone) setProviderTimezone(data.timezone);
    };
    loadProviderTimezone();
  }, [providerId]);

// ---------------- dirty tracking ----------------

// helper: compare current state vs last saved, ignoring id/order differences
function isEqualState(a: any, b: any): boolean {
  if (!a || !b) return false;

  const normalizeHours = (list: any[] = []) =>
    list
      .map(({ provider_id, day_of_week, start_time, end_time }: any) => ({
        provider_id,
        day_of_week,
        start_time,
        end_time,
      }))
      .sort(
        (x, y) =>
          x.day_of_week - y.day_of_week ||
          x.start_time.localeCompare(y.start_time)
      );

  const simpleA = {
    hours: normalizeHours(a.hours),
    holidaySelections: [...(a.holidaySelections ?? [])].sort(),
    everyOtherSat: a.everyOtherSat ?? false,
    satStartDate: a.satStartDate ?? "",
  };

  const simpleB = {
    hours: normalizeHours(b.hours),
    holidaySelections: [...(b.holidaySelections ?? [])].sort(),
    everyOtherSat: b.everyOtherSat ?? false,
    satStartDate: b.satStartDate ?? "",
  };

  return JSON.stringify(simpleA) === JSON.stringify(simpleB);
}

  // track dirty automatically whenever state changes
  useEffect(() => {
    if (!lastSavedState) return;

    const current = {
      hours,
      holidaySelections,
    };

    const isSame = isEqualState(current, lastSavedState);
    setDirty(!isSame);
    onDirtyChange?.(!isSame);
  }, [hours, holidaySelections]);

  // simple manual setter still available
  const markDirty = (val: boolean = true) => {
    setDirty(val);
    onDirtyChange?.(val);
  };

  // holiday toggles
  const toggleHoliday = (key: string, checked: boolean) => {
    setHolidaySelections((prev) =>
      checked ? [...prev, key] : prev.filter((h) => h !== key)
    );
    markDirty();
  };

  // --- auto-detect if current state differs from last saved ---
  useEffect(() => {
    if (!lastSavedState) return;

    const isSame = isEqualState(
      { hours, holidaySelections },
      lastSavedState
    );

    setDirty(!isSame);
    onDirtyChange?.(!isSame);
  }, [hours, holidaySelections]);

// --- load context & provider data ---
useEffect(() => {
  async function loadAll() {
    try {
      let normalizedHours: Availability[] = [];
      let holidays: string[] = [];

      // 1️⃣ Load hours from context (normalize to HH:mm)
      if (ctxHours && Array.isArray(ctxHours)) {
        normalizedHours = ctxHours.map((h: any) => ({
          ...h,
          start_time: h.start_time.slice(0, 5),
          end_time: h.end_time.slice(0, 5),

        }));
        setHours(normalizedHours);
      }

      // 2️⃣ Load provider holidays
      const { data: holidayData, error: holidayErr } = await supabase
        .from("provider_holidays")
        .select("holiday_key")
        .eq("provider_id", providerId);

      if (holidayErr) {
        console.error("❌ Error loading provider holidays:", holidayErr.message);
      } else if (holidayData) {
        holidays = holidayData.map((h) => h.holiday_key);
        setHolidaySelections(holidays);
      }

      // 3️⃣ ✅ Capture stable baseline for dirty tracking
      setLastSavedState({
        hours: normalizedHours,
        holidaySelections: holidays,
      });

      // 4️⃣ Reset dirty state
      setDirty(false);
      onDirtyChange?.(false);

      console.log("✅ HoursTab: provider data loaded successfully");
    } catch (err: any) {
      console.error("❌ Error in loadAll:", err.message);
      toast.error("Error loading provider data");
    }
  }

  loadAll();
}, [ctxHours, providerId]);



  // --- hour editing helpers ---
  const updateHour = <K extends keyof Availability>(
    idx: number,
    field: K,
    value: Availability[K]
  ) => {
    const newHours = [...hours];
    const block = { ...newHours[idx], [field]: value };
    if (field === "start_time" && block.end_time <= (value as string)) {
      const [h, m] = (value as string).split(":").map(Number);
      const bumped = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(
        2,
        "0"
      )}`;
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
      toast.error("This block overlaps an existing block for the same day.");
      return;
    }
    newHours[idx] = block;
    setHours(newHours);
    markDirty();
  };

  const deleteBlock = (globalIndex: number) => {
    const newHours = [...hours];
    newHours.splice(globalIndex, 1);
    setHours(newHours);
    markDirty();
  };

  const addBlock = (dayIndex: number) => {
    const blocksForDay = hours.filter((h) => h.day_of_week === dayIndex);
    if (blocksForDay.length === 0) {
      setHours([
        ...hours,
        {
          provider_id: providerId,
          day_of_week: dayIndex,
          start_time: "09:00",
          end_time: "18:00",
          is_active: true,
        },
      ]);
      markDirty();
      return;
    }
    if (blocksForDay.length === 1) {
      const firstIdx = hours.findIndex((h) => h === blocksForDay[0]);
      const newHours = [...hours];
      newHours[firstIdx] = {
        ...newHours[firstIdx],
        start_time: "09:00",
        end_time: "12:00",
      };
      setHours([
        ...newHours,
        {
          provider_id: providerId,
          day_of_week: dayIndex,
          start_time: "14:00",
          end_time: "18:00",
          is_active: true,
        },
      ]);
      markDirty();
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
    markDirty();
  };

// --- save logic (updated) ---
const saveHours = async () => {
  try {
    setSaving(true);

    // 🗂️ Step 1: Upsert all availability rows (with slot_interval)
    const { data: existing } = await supabase
      .from("availability")
      .select("id")
      .eq("provider_id", providerId);

    const existingIds = new Set(existing?.map((r) => r.id));
    const currentIds = new Set(hours.filter((h) => h.id).map((h) => h.id));
    const idsToDelete = [...existingIds].filter((id) => !currentIds.has(id));

    // ✅ Normalize all start/end times to UTC before saving
    const prepared = hours.map((h) => ({
      ...h,
      id: h.id ?? generateId(),
      provider_id: providerId,
      slot_interval: h.slot_interval ?? 30,
      start_time: toUTC(h.start_time),
      end_time: toUTC(h.end_time),

    }));

console.log("🕓 Prepared hours before save:", prepared.slice(0, 3));

    const { error: upsertError } = await supabase
      .from("availability")
      .upsert(prepared);

    if (upsertError) {
      toast.error(`Error saving hours: ${upsertError.message}`);
      return;
    }

    if (idsToDelete.length > 0) {
      await supabase.from("availability").delete().in("id", idsToDelete);
    }

    // 🧹 Step 2: Clean up any legacy every-other-Saturday time_off
    await supabase
      .from("time_off")
      .delete()
      .eq("provider_id", providerId)
      .eq("reason", "every_other_saturday");

    // 🗓️ Step 3: Save holiday selections and generate time_off
    await supabase.from("provider_holidays").delete().eq("provider_id", providerId);

    // 🧹 Always remove old holiday-related time_off rows (even if none selected)
    await supabase
      .from("time_off")
      .delete()
      .eq("provider_id", providerId)
      .filter("reason", "ilike", "holiday:%");

    if (holidaySelections.length > 0) {
      await supabase.from("provider_holidays").insert(
        holidaySelections.map((h) => ({
          id: generateId(),
          provider_id: providerId,
          holiday_key: h,
        }))
      );

      const today = new Date();
      const endRange = new Date(today);
      endRange.setFullYear(endRange.getFullYear() + 1);

      const holidayRows: any[] = [];
      for (const key of holidaySelections) {
        const dates = computeHolidayDates(key, today, endRange);
        for (const d of dates) {
          holidayRows.push({
            id: generateId(),
            provider_id: providerId,
            off_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,  // ✅ Use off_date
            reason: `holiday:${key}`,
            all_day: true,
          });
        }
      }


      if (holidayRows.length > 0) {
        const { error: holidayErr } = await supabase
          .from("time_off")
          .insert(holidayRows);
        if (holidayErr) {
          toast.error(`Error saving holiday closures: ${holidayErr.message}`);
          return;
        }
      }
    }


    // ✅ Step 4: Wrap up
    toast.success("Hours, slot intervals, and holiday closures saved successfully ✅");
    markDirty(false);
    reload();
    setLastSavedState({
      hours,
      holidaySelections,
    });
    onDirtyChange?.(false);
  } catch (err: any) {
    console.error("❌ Error saving hours:", err.message);
    toast.error(`Error saving hours: ${err.message}`);
  } finally {
    setSaving(false);
    setDirty(false);
  }
};

  if (loading)
    return <div className="p-4 text-gray-500">Loading hours…</div>;

  // ---------------- UI ----------------
  return (
    <div className="relative pb-32 space-y-6 max-w-3xl mx-auto">
      {/* =======================================
        🕓 Provider Timezone Selector
        ======================================= */}
      <div className="mb-6 border-b border-gray-200 pb-4">
        <Label className="block text-sm font-medium text-gray-700 mb-1">
          Time Zone
        </Label>
        <Select
          value={providerTimezone}
          onValueChange={async (val) => {
            setProviderTimezone(val);
            try {
              const { error } = await supabase
                .from("providers")
                .update({ timezone: val })
                .eq("id", providerId);
              if (error) throw error;
              console.log("✅ Timezone updated to:", val);
              toast.success("Timezone updated to " + val);
            } catch (err) {
              console.error("❌ Error updating timezone:", err);
              toast.error("Error updating timezone.");
            }
          }}
        >
          <SelectTrigger className="w-full md:w-80">
            <SelectValue placeholder="Select your timezone" />
          </SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
              <SelectItem value="America/Chicago">Central (CT)</SelectItem>
              <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
              <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
              <SelectItem value="America/Anchorage">Alaska (AKT)</SelectItem>
              <SelectItem value="Pacific/Honolulu">Hawaii (HST)</SelectItem>
              <SelectItem value="Canada/Atlantic">Atlantic (AT)</SelectItem>
              <SelectItem value="America/Phoenix">Arizona (no DST)</SelectItem>
              <SelectItem value="America/Toronto">Toronto (ET)</SelectItem>
              <SelectItem value="America/Vancouver">Vancouver (PT)</SelectItem>
              <SelectItem value="America/Mexico_City">Mexico City (CT)</SelectItem>
              <SelectItem value="Europe/London">London (UK)</SelectItem>
              <SelectItem value="Europe/Dublin">Dublin (Ireland)</SelectItem>
              <SelectItem value="Europe/Paris">Paris (France)</SelectItem>
              <SelectItem value="Australia/Sydney">Sydney (AU)</SelectItem>
            </SelectContent>
        </Select>
      </div>

      {/* grid of day cards */}
      <div className="space-y-4">
        {days.map((day, dayIndex) => {
          const blocks = hours.filter((h) => h.day_of_week === dayIndex);
          const times = Array.from({ length: 24 * 4 }, (_, i) => {
            const h = Math.floor(i / 4);
            const m = (i % 4) * 15;
            const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            const [hh, mm] = t.split(":").map(Number);
            const displayHour = ((hh + 11) % 12) + 1;
            const ampm = hh >= 12 ? "PM" : "AM";
            const label = `${displayHour}:${mm.toString().padStart(2, "0")} ${ampm}`;
            return { value: t, label };
          });

          return (
            <Card key={day} className="bg-gray-50 border-gray-200 hover:shadow-sm transition">
              <CardHeader className="flex flex-row items-center justify-between p-4">
                <CardTitle className="text-lg font-semibold text-gray-800">{day}</CardTitle>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">Apply these hours to other day(s)</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2 space-y-2">
                      {days.map((d, idx2) =>
                        idx2 !== dayIndex ? (
                          <div key={d} className="flex items-center space-x-2">
                            <Checkbox
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  const filtered = hours.filter(
                                    (h) => h.day_of_week !== idx2
                                  );
                                  const copied = blocks.map((b) => ({
                                    ...b,
                                    id: undefined,
                                    day_of_week: idx2,
                                  }));
                                  setHours([...filtered, ...copied]);
                                  markDirty();
                                }
                              }}
                            />
                            <label className="text-sm">{d}</label>
                          </div>
                        ) : null
                      )}
                    </PopoverContent>
                  </Popover>
                  <Button
                    size="sm"
                    className="bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => addBlock(dayIndex)}
                  >
                    + Add a block of time
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-2">
                {blocks.length === 0 && (
                  <p className="text-sm text-gray-500 pl-1">No hours set</p>
                )}
                {blocks.map((block) => {
                  const globalIndex = hours.findIndex((h) => h === block);
                  return (
                    <div
                      key={block.id || globalIndex}
                      className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-2"
                    >
                      <Select
                        value={block.start_time}
                        onValueChange={(val) =>
                          updateHour(globalIndex, "start_time", val)
                        }
                      >
                        <SelectTrigger className="w-[120px]">
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
                        onValueChange={(val) =>
                          updateHour(globalIndex, "end_time", val)
                        }
                      >
                        <SelectTrigger className="w-[120px]">
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

                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 hover:border-red-300 transition-colors"
                        onClick={() => deleteBlock(globalIndex)}
                      >
                        Remove this block of time
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Appointment Start Interval */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="space-y-3 p-4">
          <label className="block text-sm font-medium text-gray-700">
            Appointment start times every:
          </label>

          <select
            className="w-56 border rounded-md p-2 text-sm bg-white cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={hours[0]?.slot_interval || 30}
            onChange={(e) => {
              const newInterval = Number(e.target.value);
              const updated = hours.map((h) => ({ ...h, slot_interval: newInterval }));
              setHours(updated);
              markDirty();
            }}
          >
            <option value={60}>60 minutes (on the hour)</option>
            <option value={30}>30 minutes (:00, :30)</option>
            <option value={20}>20 minutes (:00, :20, :40)</option>
            <option value={15}>15 minutes (:00, :15, :30, :45)</option>
            <option value={10}>10 minutes (:00, :10, :20, :30, :40, :50)</option>
            <option value={5}>5 minutes (every 5 minutes)</option>
          </select>

          <p className="text-xs text-gray-500">
            Controls which times appear on your booking page. For example, 15-minute
            intervals allow appointments at 9:00, 9:15, 9:30, etc.
          </p>
        </CardContent>
      </Card>

      {/* Holiday Closures */}
      <Card className="bg-gray-50 border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-gray-800">
            Holiday Closures
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-2">
          {HOLIDAYS.map((h) => (
            <label
              key={h.key}
              className="flex items-center gap-2 text-sm text-gray-700"
            >
              <Checkbox
                checked={holidaySelections.includes(h.key)}
                onCheckedChange={(val) => toggleHoliday(h.key, !!val)}
              />
              {h.label}
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Unsaved changes modal */}
      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              If you leave now, any changes to your hours will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setShowUnsavedWarning(false)}
              className="bg-gray-100 hover:bg-gray-200"
            >
              Stay & Save
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowUnsavedWarning(false);
                // ✅ Include the pending tab name in the event detail
                if (pendingTabRef.current) {
                  window.dispatchEvent(
                    new CustomEvent("docsolo:navigate:confirm", {
                      detail: { target: pendingTabRef.current },
                    })
                  );
                  pendingTabRef.current = null;
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Leave Without Saving
            </AlertDialogAction>

          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Fixed Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex justify-between items-center z-50 shadow-md">
        <span
          className={`text-sm ${
            dirty ? "text-amber-600" : "text-green-600"
          } font-medium`}
        >
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button
          onClick={saveHours}
          disabled={!dirty || saving}
          className={`${
            saving
              ? "bg-gray-400 text-white cursor-wait"
              : dirty
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-gray-300 text-gray-600 cursor-not-allowed"
          }`}
        >
          {saving ? "Saving…" : "Save All Hours"}
        </Button>
      </div>
    </div>
  );
}
