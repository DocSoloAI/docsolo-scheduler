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
import { Input } from "@/components/ui/input";
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
}

interface HoursTabProps {
  providerId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

// ---------------- helpers ----------------
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
  const [everyOtherSat, setEveryOtherSat] = useState(false);
  const [satStartDate, setSatStartDate] = useState<string>("");
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
      everyOtherSat,
      satStartDate,
    };

    const isSame = isEqualState(current, lastSavedState);
    setDirty(!isSame);
    onDirtyChange?.(!isSame);
  }, [hours, holidaySelections, everyOtherSat, satStartDate]);

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
      { hours, holidaySelections, everyOtherSat, satStartDate },
      lastSavedState
    );

    setDirty(!isSame);
    onDirtyChange?.(!isSame);
  }, [hours, holidaySelections, everyOtherSat, satStartDate]);

// --- load context & provider data ---
useEffect(() => {
  let loadedHours: Availability[] | null = null;
  let loadedEveryOtherSat = false;
  let loadedSatStartDate = "";
  let loadedHolidays: string[] = [];

  async function loadAll() {
    // 1️⃣ Load hours from context
    if (ctxHours) {
      const normalized = ctxHours.map((h: any) => ({
        ...h,
        start_time: h.start_time.slice(0, 5),
        end_time: h.end_time.slice(0, 5),
      }));
      loadedHours = normalized;
      setHours(normalized);
    }

    // 2️⃣ Load provider Saturday settings
    const { data: providerData } = await supabase
      .from("providers")
      .select("every_other_saturday, saturday_start_date")
      .eq("id", providerId)
      .single();

    if (providerData) {
      loadedEveryOtherSat = !!providerData.every_other_saturday;
      loadedSatStartDate = providerData.saturday_start_date || "";
      setEveryOtherSat(loadedEveryOtherSat);
      setSatStartDate(loadedSatStartDate);
    }

    // 3️⃣ Load provider holidays
    const { data: holidayData } = await supabase
      .from("provider_holidays")
      .select("holiday_key")
      .eq("provider_id", providerId);

    if (holidayData) {
      loadedHolidays = holidayData.map((h) => h.holiday_key);
      setHolidaySelections(loadedHolidays);
    }

    // 4️⃣ ✅ Now that everything is loaded, capture a stable baseline
    setLastSavedState({
      hours: loadedHours ?? [],
      everyOtherSat: loadedEveryOtherSat,
      satStartDate: loadedSatStartDate,
      holidaySelections: loadedHolidays,
    });

    // 5️⃣ And reset dirty to false
    setDirty(false);
    onDirtyChange?.(false);
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
      alert("This block overlaps an existing block for the same day.");
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

  // --- save logic (unchanged) ---
  const saveHours = async () => {
    // Save availability
    const { data: existing } = await supabase
      .from("availability")
      .select("id")
      .eq("provider_id", providerId);

    const existingIds = new Set(existing?.map((r) => r.id));
    const currentIds = new Set(hours.filter((h) => h.id).map((h) => h.id));
    const idsToDelete = [...existingIds].filter((id) => !currentIds.has(id));

    const prepared = hours.map((h) => ({
      ...h,
      id: h.id ?? generateId(),
    }));

    const { error: upsertError } = await supabase
      .from("availability")
      .upsert(prepared);

    if (upsertError) {
      alert("Error saving hours: " + upsertError.message);
      return;
    }

    if (idsToDelete.length > 0) {
      await supabase.from("availability").delete().in("id", idsToDelete);
    }

    // Save provider Saturday settings
    const { error: providerError } = await supabase
      .from("providers")
      .update({
        every_other_saturday: everyOtherSat,
        saturday_start_date: satStartDate || null,
      })
      .eq("id", providerId);

    if (providerError) {
      alert("Error saving Saturday settings: " + providerError.message);
      return;
    }

    // Reset time_off for Sat + holidays
    await supabase
      .from("time_off")
      .delete()
      .eq("provider_id", providerId)
      .in("reason", [
        "every_other_saturday",
        ...HOLIDAYS.map((h) => `holiday:${h.key}`),
      ]);

    // Generate Sat closures
    if (everyOtherSat && satStartDate) {
      const base = new Date(satStartDate);
      base.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endRange = new Date(today);
      endRange.setFullYear(endRange.getFullYear() + 1);

      const newRows: any[] = [];
      let current = new Date(today);
      while (current.getDay() !== 6) current.setDate(current.getDate() + 1);

      while (current <= endRange) {
        const diffWeeks = Math.floor(
          (current.getTime() - base.getTime()) / (1000 * 60 * 60 * 24 * 7)
        );
        if (diffWeeks % 2 === 1) {
          const s = new Date(current);
          s.setHours(0, 0, 0, 0);
          const e = new Date(current);
          e.setHours(23, 59, 59, 999);
          newRows.push({
            provider_id: providerId,
            start_time: s.toISOString(),
            end_time: e.toISOString(),
            reason: "every_other_saturday",
          });
        }
        current.setDate(current.getDate() + 7);
      }

      if (newRows.length > 0) {
        const { error: toError } = await supabase
          .from("time_off")
          .insert(newRows);
        if (toError) {
          alert("Error saving Saturday closures: " + toError.message);
          return;
        }
      }
    }

    // Save holiday selections + generate closures
    await supabase.from("provider_holidays").delete().eq("provider_id", providerId);

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
          const s = new Date(d);
          s.setHours(0, 0, 0, 0);
          const e = new Date(d);
          e.setHours(23, 59, 59, 999);
          holidayRows.push({
            provider_id: providerId,
            start_time: s.toISOString(),
            end_time: e.toISOString(),
            reason: `holiday:${key}`,
          });
        }
      }

      if (holidayRows.length > 0) {
        const { error: holidayErr } = await supabase
          .from("time_off")
          .insert(holidayRows);
        if (holidayErr) {
          alert("Error saving holiday closures: " + holidayErr.message);
          return;
        }
      }
    }

    alert("Hours & holiday closures saved ✅");
    markDirty(false);
    reload();
    setLastSavedState({
      hours,
      holidaySelections,
      everyOtherSat,
      satStartDate,
    });
    setDirty(false);
    onDirtyChange?.(false);


  };


  if (loading)
    return <div className="p-4 text-gray-500">Loading hours…</div>;

  // ---------------- UI ----------------
  return (
    <div className="relative pb-32 space-y-6 max-w-3xl mx-auto">
      {/* grid of day cards */}
      <div className="space-y-4">
        {days.map((day, dayIndex) => {
          const blocks = hours.filter((h) => h.day_of_week === dayIndex);
          const times = Array.from({ length: 24 * 4 }, (_, i) => {
            const h = Math.floor(i / 4);
            const m = (i % 4) * 15;
            const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            const label = new Date(`1970-01-01T${t}:00`).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
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

      {/* Every Other Saturday */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={everyOtherSat}
              onCheckedChange={(val) => {
                setEveryOtherSat(!!val);
                markDirty();
              }}
            />
            <label className="text-sm font-medium text-gray-700">
              Closed every other Saturday
            </label>
          </div>
          {everyOtherSat && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Start with this Saturday as the first open one:
              </label>
              <Input
                type="date"
                value={satStartDate}
                onChange={(e) => {
                  setSatStartDate(e.target.value);
                  markDirty();
                }}
                className="max-w-xs"
              />
            </div>
          )}
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
          disabled={!dirty}
          className={`${
            dirty
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-gray-300 text-gray-600 cursor-not-allowed"
          }`}
        >
          Save All Hours
        </Button>
      </div>
    </div>
  );
}
