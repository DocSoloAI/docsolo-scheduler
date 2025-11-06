import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { parse } from "date-fns";
import { getSubdomain } from "@/lib/getSubdomain";
import { useSearchParams } from "react-router-dom";
import { sendTemplatedEmail } from "@/lib/email/sendTemplatedEmail";
import { useSettings } from "@/context/SettingsContext";
import { upsertPatientAndCreateAppointment } from "@/lib/db";
import { toast } from "react-hot-toast";
import { fromUTCToTZ, fromTZToUTC, formatInTZ } from "@/utils/timezone";

export default function BookingPage() {
  const { services } = useSettings();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [providerEmail, setProviderEmail] = useState<string | null>(null);

  const [providerOfficeName, setProviderOfficeName] = useState<string>("");
  const [providerPhone, setProviderPhone] = useState("");
  const [providerAnnouncement, setProviderAnnouncement] = useState("");
  const [providerLogoUrl, setProviderLogoUrl] = useState("");
  const [providerStreet, setProviderStreet] = useState("");
  const [providerCity, setProviderCity] = useState("");
  const [providerState, setProviderState] = useState("");
  const [providerZip, setProviderZip] = useState("");
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [manageToken, setManageToken] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const rescheduleId = searchParams.get("reschedule");

  useEffect(() => {
    if (rescheduleId) {
      supabase
        .from("appointments")
        .select(`
          id,
          patients ( first_name, last_name, email, cell_phone ),
          services ( id, name, duration_minutes )
        `)
        .eq("id", rescheduleId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("❌ Error fetching reschedule appt:", error.message);
            return;
          }

          // unwrap relations (patients, services)
          const patient = Array.isArray(data?.patients)
            ? data.patients[0]
            : data?.patients;
          const service = Array.isArray(data?.services)
            ? data.services[0]
            : data?.services;

          if (patient) {
            setFirstName(patient.first_name || "");
            setLastName(patient.last_name || "");
            setEmail(patient.email || "");
            setCellPhone(patient.cell_phone || "");
          }

          if (service) {
            // if you actually track service choice
            // setSelectedService(service.id);
            if (service.duration_minutes) {
              // only call if you have duration state
              // setDuration(service.duration_minutes);
            }
          }

          setRescheduleLoaded(true); // ✅ use your actual flag
        });
    }
  }, [rescheduleId]);


  useEffect(() => {
    document.title = `${providerOfficeName || "Booking"} – Appointment`;
  }, [providerOfficeName]);

  useEffect(() => {
    const loadProvider = async () => {
      const subdomain = getSubdomain();
      if (!subdomain) return;

      const { data: provider, error } = await supabase
        .from("providers")
        .select("id, email, office_name, phone, street, city, state, zip, announcement, logo_url, timezone")
        .eq("subdomain", subdomain)
        .single();

      if (error || !provider) {
        console.error("Provider not found:", error);
        return;
      }

      setProviderId(provider.id);
      setProviderEmail(provider.email);
      setProviderOfficeName(provider.office_name || "");
      setProviderPhone(provider.phone || "");
      setProviderAnnouncement(provider.announcement || "");
      setProviderLogoUrl(provider.logo_url || "");
      setProviderStreet(provider.street || "");
      setProviderCity(provider.city || "");
      setProviderState(provider.state || "");
      setProviderZip(provider.zip || "");

      if (provider?.timezone) setProviderTimezone(provider.timezone);
    };
    

    loadProvider();
  }, []);


  const [patientType, setPatientType] = useState<"established" | "new" | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);

  // Shared fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [cellPhone, setCellPhone] = useState("");

  // New patient fields
  const [homePhone, setHomePhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [primaryInsurance, setPrimaryInsurance] = useState("");
  const [primaryID, setPrimaryID] = useState("");
  const [secondaryInsurance, setSecondaryInsurance] = useState("");
  const [secondaryID, setSecondaryID] = useState("");
  const [comments, setComments] = useState("");
  const [allowEmail, setAllowEmail] = useState(true);
  const [allowText, setAllowText] = useState(true);
  const [formError, setFormError] = useState("");
  const [rescheduleLoaded, setRescheduleLoaded] = useState(false);
  const [providerTimezone, setProviderTimezone] = useState("America/New_York");

  const [availableTimes, setAvailableTimes] = useState<string[]>([]);

  // 🔄 Keep availability updated in realtime
  useEffect(() => {
    if (!providerId) return;

    const channel = supabase
      .channel(`booking-${providerId}-realtime`)
      // 🔄 Listen for appointment changes
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `provider_id=eq.${providerId}` },
        async () => {
          console.log("🔄 Realtime: appointments changed → reloading availability");
          if (selectedDate) {
            const event = new Event("reload-availability");
            window.dispatchEvent(event);
          }
        }
      )
      // 🔄 Listen for time_off changes (holidays, blocked days)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_off", filter: `provider_id=eq.${providerId}` },
        async () => {
          console.log("🔄 Realtime: time_off changed → reloading availability");
          if (selectedDate) {
            const event = new Event("reload-availability");
            window.dispatchEvent(event);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [providerId, selectedDate]);


  useEffect(() => {
    let isActive = true; // ✅ cancel stale loads if date changes mid-request

    const loadAvailability = async () => {
      if (!providerId || !selectedDate || !providerTimezone) return;

      setAvailableTimes([]); // clear previous results immediately

      const dayOfWeek = selectedDate.getDay();

      // --- Fetch provider availability ---
      const { data: availRows, error: availErr } = await supabase
        .from("availability")
        .select("start_time, end_time, slot_interval")
        .eq("provider_id", providerId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true);

      if (!isActive) return;
      if (availErr || !availRows || availRows.length === 0) {
        setAvailableTimes([]);
        return;
      }

      // --- Build all possible time slots ---
      let allSlots: { time: string; date: Date }[] = [];
      availRows.forEach((avail) => {
        const startLocal = new Date(selectedDate);
        const [sh, sm] = (avail.start_time as string).split(":").map(Number);
        startLocal.setHours(sh, sm, 0, 0);

        const endLocal = new Date(selectedDate);
        const [eh, em] = (avail.end_time as string).split(":").map(Number);
        endLocal.setHours(eh, em, 0, 0);

        const startUTC = fromTZToUTC(startLocal, providerTimezone);
        const endUTC = fromTZToUTC(endLocal, providerTimezone);
        const step = avail.slot_interval || 30;
        const cur = new Date(startUTC);

        while (cur < endUTC) {
          const localTime = fromUTCToTZ(cur, providerTimezone);
          allSlots.push({
            time: formatInTZ(localTime, providerTimezone, "h:mm a"),
            date: new Date(localTime),
          });
          cur.setMinutes(cur.getMinutes() + step);
        }
      });

      if (!isActive) return;
      allSlots.sort((a, b) => a.date.getTime() - b.date.getTime());
      const now = new Date();

      // --- Build UTC day boundaries safely (non-mutating) ---
      const localCopyStart = new Date(selectedDate.getTime());
      const localCopyEnd = new Date(selectedDate.getTime());
      localCopyStart.setHours(0, 0, 0, 0);
      localCopyEnd.setHours(23, 59, 59, 999);

      const startOfDayUTC = fromTZToUTC(localCopyStart, providerTimezone);
      const endOfDayUTC = fromTZToUTC(localCopyEnd, providerTimezone);

      // --- Fetch appointments ---
      const { data: appts } = await supabase
        .from("appointments")
        .select("id, start_time, end_time, status")
        .eq("provider_id", providerId)
        .eq("status", "booked")
        .gte("start_time", startOfDayUTC.toISOString())
        .lte("end_time", endOfDayUTC.toISOString());

      if (!isActive) return;

      // --- Fetch time_off (include off_date rows too) ---
      const { data: offs, error: offErr } = await supabase
        .from("time_off")
        .select("start_time, end_time, all_day, reason, off_date")
        .eq("provider_id", providerId)
        .or(
          `off_date.eq.${selectedDate.toISOString().slice(0, 10)},and(start_time.lte.${endOfDayUTC.toISOString()},end_time.gte.${startOfDayUTC.toISOString()})`
        );

      if (offErr) {
        console.error("❌ time_off fetch error:", offErr);
      }
      if (offErr) return; // 🚫 stop if the query failed

      console.log("🟩 Time-off rows fetched:", offs);
      if (!isActive) return;

      // ✅ Detect full-day off (supports off_date or legacy start/end)
      const hasFullDayOff = (offs || []).some((o) => {
        if (!o || !o.all_day) return false;

        if (o.off_date) {
          const selectedDay = selectedDate.toISOString().slice(0, 10);
          return o.off_date === selectedDay;
        }

        if (o.start_time && o.end_time) {
          const offStartDay = o.start_time.slice(0, 10);
          const offEndDay = o.end_time.slice(0, 10);
          const selectedDay = selectedDate.toISOString().slice(0, 10);
          return selectedDay >= offStartDay && selectedDay <= offEndDay;
        }

        return false;
      });

      if (hasFullDayOff) {
        console.log("🚫 Full-day OFF detected for", selectedDate.toDateString());
        setAvailableTimes([
          "No appointments available. The office is closed or fully booked for this date.",
        ]);
        return; // ✅ Stop immediately so message isn't overwritten
      }

      // ✅ Normalize time_off for partial-day logic
      const mappedOffs = (offs || []).map((o) => {
        const start = o.start_time ? new Date(o.start_time) : null;
        const end = o.end_time ? new Date(o.end_time) : null;
        return { start, end, all_day: !!o.all_day };
      });

      // ✅ Combine appointments + time_off
      const bookedSlots = [
        ...(appts || [])
          .filter((a) => !rescheduleId || a.id !== rescheduleId)
          .map((a) => ({
            start: new Date(a.start_time),
            end: new Date(a.end_time),
            all_day: false,
          })),
        ...mappedOffs,
      ];

      // ✅ Filter out overlapping or all-day blocks
      const freeSlots = allSlots
        .filter((slot) => {
          return !bookedSlots.some((b) => {
            const sameDay =
              b.all_day &&
              b.start &&
              b.start.toDateString() === slot.date.toDateString();
            const overlaps =
              b.start && b.end && slot.date >= b.start && slot.date < b.end;
            return sameDay || overlaps;
          });
        })
        .filter((slot) => {
          if (selectedDate.toDateString() !== now.toDateString()) return true;
          return slot.date > now;
        });

      if (!isActive) return;

      // ✅ Display results
      if (freeSlots.length === 0) {
        setAvailableTimes([
          "No appointments available. Either the office is closed, or fully booked.",
        ]);
      } else {
        setAvailableTimes(freeSlots.map((s) => s.time));
      }
    };

    loadAvailability();

    // 🧹 Cancel any in-flight loads if date changes
    return () => {
      isActive = false;
    };
  }, [providerId, selectedDate]);




  // 🔽 Refs
  const dateTimeRef = useRef<HTMLDivElement>(null);
  const patientInfoRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // 👇 Scroll when patient type chosen → Date & Time section
  useEffect(() => {
    if (patientType) {
      setTimeout(() => {
        dateTimeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  }, [patientType]);

  // ✅ Auto-select the only available service for this patient type
  useEffect(() => {
    if (!patientType) return;
    const filtered = services.filter(
      (s) => s.default_for === patientType && s.is_active
    );
    if (filtered.length === 1) {
      setSelectedService(filtered[0].id);
    } else {
      setSelectedService(null);
    }
  }, [patientType, services]);


  // 👇 Scroll when date chosen → Times list
  useEffect(() => {
    if (selectedDate) {
      setTimeout(() => {
        dateTimeRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 200);
    }
  }, [selectedDate]);


  // 👇 Scroll when time chosen → Patient Info
  useEffect(() => {
    if (selectedTime) {
      setTimeout(() => {
        patientInfoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  }, [selectedTime]);

  // 👇 Scroll when confirmed → Confirmation splash
  useEffect(() => {
    if (confirmed) {
      confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [confirmed]);

  // Prefill patient info if rescheduling
  useEffect(() => {
    const loadRescheduleData = async () => {
      if (!rescheduleId || !providerId || rescheduleLoaded) return;

      const { data, error } = await supabase
        .from("appointments")
        .select(
          `
          id,
          service_id,
          patients (
            first_name,
            last_name,
            email,
            cell_phone,
            home_phone,
            birthday,
            street,
            city,
            state,
            zip
          )
          `
        )
        .eq("id", rescheduleId)
        .single();

      if (error || !data) {
        console.error("Error loading reschedule data:", error);
        return;
      }

      // Pre-fill form fields
      const p = data.patients?.[0];
      const existingServiceId = data.service_id;
      if (existingServiceId) {
        const svc = services.find(s => s.id === existingServiceId);
        if (svc) {
          // force patient type to match default_for of the service
          setPatientType(svc.default_for as "new" | "established");
        }
      }

      if (p) {
        setFirstName(p.first_name || "");
        setLastName(p.last_name || "");
        setEmail(p.email || "");
        setCellPhone(p.cell_phone || "");
        setHomePhone(p.home_phone || "");
        setBirthday(p.birthday ? new Date(p.birthday).toLocaleDateString("en-US") : "");
        setStreet(p.street || "");
        setCity(p.city || "");
        setState(p.state || "");
        setZip(p.zip || "");
      }

      setRescheduleLoaded(true);
    };

    loadRescheduleData();
  }, [rescheduleId, providerId, rescheduleLoaded]);



  const handleConfirm = async () => {
    // ✅ Validation guard
    if (!firstName || !lastName || !email) {
      setFormError("First name, last name, email, and cell phone are required.");
      return;
    }
    if (patientType === "new" && !birthday) {
      setFormError("Date of Birth is required for new patients.");
      return;
    }

    try {
      if (!providerId) {
        setFormError("Provider not found.");
        return;
      }

      // 🧩 Idiot-proof service selection logic
      const matchingServices = services.filter(
        (s) => s.default_for === patientType && s.is_active
      );

      if (matchingServices.length === 0) {
        setFormError("No services available for this type of appointment.");
        return;
      }

      if (!selectedService && matchingServices.length > 1) {
        setFormError("Please select a specific service before continuing.");
        return;
      }

      const service =
        services.find((s) => s.id === selectedService) || matchingServices[0];

      const serviceId = service.id;
      const normalizedEmail = email.trim().toLowerCase(); // ✅ normalize once here

      // 1. Get service duration
      const { data: serviceData, error: serviceError } = await supabase
        .from("services")
        .select("duration_minutes")
        .eq("id", serviceId)
        .single();

      if (serviceError) throw serviceError;
      const durationMin = serviceData.duration_minutes;

      const startLocal = parse(selectedTime!, "h:mm a", selectedDate!);
      const start = new Date(startLocal);
      const end = new Date(start.getTime() + durationMin * 60000);

      // ✅ Convert to UTC for storage
      const startUTC = fromTZToUTC(start, providerTimezone).toISOString();
      const endUTC = fromTZToUTC(end, providerTimezone).toISOString();

      // 🔒 Check for conflicts BEFORE inserting
      const { data: conflicts, error: conflictErr } = await supabase
        .from("appointments")
        .select("id")
        .eq("provider_id", providerId)
        .eq("status", "booked")
        .gte("end_time", startUTC)
        .lte("start_time", endUTC);

      if (conflictErr) throw conflictErr;

      if (conflicts && conflicts.length > 0) {
        toast.error(
          "That time slot is no longer available. Refreshing available times..."
        );
        setSelectedTime(null);
        setShowConfirmModal(false);
        return;
      }
      
      let appointmentId: string | null = null;
      let manageToken: string | null = null;

      if (rescheduleId) {
        const { error: updateError } = await supabase
          .from("appointments")
          .update({
            service_id: serviceId,
            start_time: fromTZToUTC(start, providerTimezone).toISOString(),
            end_time: fromTZToUTC(end, providerTimezone).toISOString(),
            status: "booked",
          })
          .eq("id", rescheduleId);

        if (updateError) throw updateError;
        appointmentId = rescheduleId;

        // 🔑 fetch manage_token for rescheduled appt
        const { data: existing, error: tokenError } = await supabase
          .from("appointments")
          .select("manage_token")
          .eq("id", rescheduleId)
          .single();
        if (tokenError) throw tokenError;
        manageToken = existing?.manage_token ?? null;
      } else {
        // 🆕 Use helper for patient upsert + appointment insert
        const newAppt = await upsertPatientAndCreateAppointment(
          {
            first_name: firstName,
            last_name: lastName,
            email: normalizedEmail,
            cell_phone: cellPhone,
            provider_id: providerId,
          },
          {
            service_id: serviceId,
            start_time: fromTZToUTC(start, providerTimezone).toISOString(),
            end_time: fromTZToUTC(end, providerTimezone).toISOString(),
            status: "booked",
            patient_note: comments || null,
          }
        );

        appointmentId = newAppt.id;
        manageToken = newAppt.manage_token; // ✅ capture token
      }

      if (!appointmentId || !manageToken) throw new Error("Appointment ID or token missing");

      // 2. Emails
      const fullName = `${firstName} ${lastName}`;
      const formattedDate = format(start, "MMMM d, yyyy");
      const formattedTime = format(start, "h:mm a");

      // Patient email
      await sendTemplatedEmail({
        templateType: rescheduleId ? "update" : "confirmation",
        to: normalizedEmail,
        providerId,
        appointmentData: {
          patientName: fullName,
          providerName: providerOfficeName || "Your Provider",
          date: formattedDate,
          time: formattedTime,
          service: service.name,
          appointmentId,
          manageLink: `https://${getSubdomain()}.bookthevisit.com/manage/${appointmentId}?token=${manageToken}`,
          location: [providerStreet, providerCity, providerState, providerZip]
            .filter(Boolean)
            .join(", "),
          officeName: providerOfficeName,
          providerPhone,
          announcement: providerAnnouncement?.trim() ? providerAnnouncement : null,
          logoUrl: providerLogoUrl,
        },
      });

      // Provider email
      if (providerEmail) {
        await sendTemplatedEmail({
          templateType: rescheduleId
            ? "provider_update"
            : "provider_confirmation",
          to: providerEmail,
          providerId,
          appointmentData: {
            patientName: fullName,
            patientEmail: normalizedEmail, // ✅ lowercase for consistency
            patientPhone: cellPhone || "(no phone provided)", // ✅ now safely included
            date: formattedDate,
            time: formattedTime,
            service: service.name,
            appointmentId,
            patientNote: comments || "",
            manageLink: "",
            officeName: providerOfficeName,
            providerPhone,
            announcement: providerAnnouncement,
            logoUrl: providerLogoUrl,
          },
        });
      }


      // 3. Mark confirmed
      setAppointmentId(appointmentId);
      setConfirmed(true);
      setBookingComplete(true);
      setManageToken(manageToken);

    } catch (err) {
      console.error("Booking error:", err);
      toast.error("Something went wrong booking your appointment.");
    }
  };


  const serviceDescription = services.find(s => s.default_for === patientType)?.description;

  return (
    <div className="max-w-3xl mx-auto p-8 min-h-screen bg-gradient-to-br from-gray-50 to-slate-100">
      <AnimatePresence>
        {/* 👇 Hide booking UI after confirmed */}
        {!bookingComplete && providerOfficeName && (          <>
            {/* Page header */}
            <h1 className="text-4xl font-extrabold text-blue-700 mb-10 text-center animate-fadeIn">
              {providerOfficeName}
            </h1>

            {/* ✅ Custom announcement right below the page title */}
            {providerAnnouncement && (
              <div
                className="mb-6 p-4 bg-yellow-100 text-yellow-900 rounded text-center text-base font-medium animate-fadeIn"
              >
                {providerAnnouncement}
              </div>
            )}

            {/* WHO’S BOOKING TODAY (multi-service upgrade) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-10"
            >
              <h2 className="text-2xl font-semibold mb-6 text-gray-800 text-center">
                Who’s booking today?
              </h2>

              {/* Step 1: Choose patient type */}
              {!patientType && (
                <div className="flex flex-col items-center gap-6">
                  <div className="flex flex-wrap justify-center gap-4">
                    <Button
                      onClick={() => setPatientType("established")}
                      className={`px-6 py-3 rounded-lg font-medium shadow-sm transition-all duration-150 ${
                        patientType === "established"
                          ? "bg-blue-700 text-white"
                          : "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      I’m a Returning Patient
                    </Button>

                    <Button
                      onClick={() => setPatientType("new")}
                      className={`px-6 py-3 rounded-lg font-medium shadow-sm transition-all duration-150 ${
                        patientType === "new"
                          ? "bg-blue-700 text-white"
                          : "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      I’m a New Patient
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Show available services for that type */}
              {patientType && (
                <div className="mt-8 space-y-6">
                  <div className="text-center">
                    <button
                      onClick={() => setPatientType(null)}
                      className="text-sm text-gray-500 hover:text-blue-600 hover:underline underline-offset-2 transition-all mb-2 -mt-1"
                    >
                      {patientType === "new"
                        ? "← I’m a returning patient instead"
                        : "← I’m a new patient instead"}
                    </button>
                    <h3 className="text-xl font-semibold text-gray-800">
                      Select a {patientType === "new" ? "New Patient" : "Returning Patient"} Service
                    </h3>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    {services
                      .filter(
                        (s) =>
                          s.default_for === patientType &&
                          (s.is_active ?? true)
                      )
                      .map((svc) => (
                        <Card
                          key={svc.id}
                          className={`cursor-pointer transition border hover:shadow-md ${
                            // highlight when selected
                            selectedService === svc.id
                              ? "border-blue-600 bg-blue-50 ring-2 ring-blue-300"
                              : "border-gray-200 bg-white"
                          }`}
                          onClick={() => {
                            // ✅ new behavior: remember chosen service + proceed
                            setSelectedService(svc.id);
                            setTimeout(() => {
                              const scrollTarget = document.getElementById("datetime-section");
                              scrollTarget?.scrollIntoView({ behavior: "smooth" });
                            }, 200);
                          }}
                        >
                          <CardHeader className="flex flex-row items-center justify-between p-4 pb-0">
                            <CardTitle
                              className={`text-lg font-semibold ${
                                selectedService === svc.id
                                  ? "text-blue-700"
                                  : "text-gray-800"
                              }`}
                            >
                              {svc.name}
                            </CardTitle>
                            {svc.color && (
                              <div
                                className="w-5 h-5 rounded-full border border-gray-300"
                                style={{ backgroundColor: svc.color }}
                              />
                            )}
                          </CardHeader>

                          <CardContent className="p-4 pt-2">
                            {svc.description && (
                              <p className="text-sm text-gray-600 mb-2">
                                {svc.description}
                              </p>
                            )}
                            <p className="text-sm text-gray-500">
                              {svc.duration_minutes
                                ? `${svc.duration_minutes} minutes`
                                : "Duration TBD"}
                            </p>
                          </CardContent>
                        </Card>
                      ))}

                    {/* If no matching services */}
                    {services.filter(
                      (s) =>
                        s.default_for === patientType && (s.is_active ?? true)
                    ).length === 0 && (
                      <div className="col-span-2 text-center text-gray-500 p-6 bg-gray-50 rounded-md border border-gray-200">
                        No services available for this category.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>

            {/* DATE & TIME */}
            {patientType && (
              <motion.div
                id="datetime-section"
                key="datetime"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="mb-10"
                ref={dateTimeRef}   // ✅ anchor is the full section
              >
                <h2 className="text-2xl font-semibold mb-4 text-gray-800">
                  Pick a Date & Time
                </h2>
                <Card>
                  <CardContent className="p-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Calendar on the left */}
                      <div>
                        {serviceDescription && (
                          <div className="mb-4 text-gray-600 text-sm">
                            <p>{serviceDescription}</p>
                          </div>
                        )}
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          disabled={{ before: new Date() }}
                        />
                      </div>

                      {/* Times on the right */}
                      {selectedDate && (
                        <div>
                          <p className="text-gray-600 mb-3">
                            Available times on{" "}
                            {format(
                              selectedDate,
                              selectedDate.getFullYear() === new Date().getFullYear()
                                ? "EEEE, MMMM d"
                                : "EEEE, MMMM d, yyyy"
                            )}
                            :
                          </p>

                          {/* 🟢 Show message if array contains only a note */}
                          {availableTimes.length === 1 &&
                          availableTimes[0].toLowerCase().includes("no appointments") ? (
                            <div className="text-center text-gray-600 bg-gray-50 border rounded-md p-4">
                              {availableTimes[0]}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-4">
                              {/* AM column */}
                              <div className="flex flex-col gap-3">
                                {availableTimes
                                  .filter((time) => time.toLowerCase().includes("am"))
                                  .map((time) => (
                                    <Button
                                      key={time}
                                      onClick={() => setSelectedTime(time)}
                                      className={`w-full ${
                                        selectedTime === time
                                          ? "bg-blue-600 text-white hover:bg-blue-700"
                                          : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                                      }`}
                                    >
                                      {time}
                                    </Button>
                                  ))}
                              </div>

                              {/* PM column */}
                              <div className="flex flex-col gap-3">
                                {availableTimes
                                  .filter((time) => time.toLowerCase().includes("pm"))
                                  .map((time) => (
                                    <Button
                                      key={time}
                                      onClick={() => setSelectedTime(time)}
                                      className={`w-full ${
                                        selectedTime === time
                                          ? "bg-blue-600 text-white hover:bg-blue-700"
                                          : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                                      }`}
                                    >
                                      {time}
                                    </Button>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}


            {/* PATIENT INFO */}
            {selectedTime && (
              <motion.div
                ref={patientInfoRef}
                key="patientinfo"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="mb-10"
              >
                <h2 className="text-2xl font-semibold mb-4 text-gray-800">
                  Your Information
                </h2>
                <Card>
                  <CardContent className="p-6 space-y-6">
                    {/* Row 1: First + Last */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <Input
                          placeholder="Enter your first name"
                          autoComplete="given-name"
                          value={firstName}
                          onChange={(e) => {
                            let val = e.target.value
                              .toLowerCase()
                              .replace(/\b\w/g, (char) => char.toUpperCase()); // capitalize each word
                            setFirstName(val);
                          }}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Last Name <span className="text-red-500">*</span>
                        </label>
                        <Input
                          placeholder="Enter your last name"
                          autoComplete="family-name"
                          value={lastName}
                          onChange={(e) => {
                            let val = e.target.value
                              .toLowerCase()
                              .replace(/\b\w/g, (char) => char.toUpperCase());
                            setLastName(val);
                          }}
                          required
                        />
                      </div>
                    </div>

                    {/* Row 2: Email (always) + DOB (new patients only) */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="email"
                          placeholder="Enter your email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value.trim().toLowerCase())} // ✅ normalize
                          onBlur={(e) => {
                            const val = e.target.value.trim().toLowerCase();
                            if (!val) {
                              setFormError("Email is required.");
                            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                              setFormError("Please enter a valid email address.");
                            } else {
                              setFormError("");
                            }
                          }}
                          required
                          aria-invalid={!!formError}
                          aria-describedby="email-error"
                        />
                        {formError && (
                          <span id="email-error" className="mt-1 text-sm text-red-600">
                            {formError}
                          </span>
                        )}
                      </div>

                      {patientType === "new" && (
                        <div className="flex flex-col">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Date of Birth <span className="text-red-500">*</span>
                          </label>
                          <Input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9/]*"
                            placeholder="MM/DD/YYYY"
                            value={birthday}
                            onChange={(e) => {
                              let val = e.target.value.replace(/\D/g, ""); // remove non-numeric
                              if (val.length > 8) val = val.slice(0, 8);

                              // Auto-format MM/DD/YYYY
                              if (val.length > 4) val = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                              else if (val.length > 2) val = `${val.slice(0, 2)}/${val.slice(2)}`;

                              setBirthday(val);
                            }}
                            onBlur={() => {
                              if (birthday.length === 10) {
                                const [mm, dd, yyyy] = birthday.split("/").map((n) => parseInt(n));
                                const isValid =
                                  mm >= 1 &&
                                  mm <= 12 &&
                                  dd >= 1 &&
                                  dd <= 31 &&
                                  yyyy > 1900 &&
                                  yyyy <= new Date().getFullYear();
                                if (!isValid) {
                                  toast.error("Please enter a valid date of birth (MM/DD/YYYY).");
                                  setBirthday("");
                                }
                              }
                            }}
                            required
                            className="text-lg tracking-wider"
                          />
                        </div>
                      )}
                    </div>

                    {/* Row 3: Mobile + Home */}
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Mobile Phone */}
                      <div>
                        <label
                          htmlFor="cellPhone"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Mobile Phone <span className="text-red-500">*</span>
                        </label>
                        <Input
                          id="cellPhone"
                          name="cellPhone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel-national"
                          placeholder="(555) 123-4567"
                          value={cellPhone}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, ""); // digits only
                            if (val.length > 10) val = val.slice(0, 10);

                            // Format as (###) ###-####
                            let formatted = val;
                            if (val.length > 6)
                              formatted = `(${val.slice(0, 3)}) ${val.slice(3, 6)}-${val.slice(6)}`;
                            else if (val.length > 3)
                              formatted = `(${val.slice(0, 3)}) ${val.slice(3)}`;

                            setCellPhone(formatted);
                          }}
                          onBlur={() => {
                            const digits = cellPhone.replace(/\D/g, "");
                            if (digits.length !== 10) {
                              toast.error("Please enter a valid 10-digit mobile number.");
                              setCellPhone("");
                            }
                          }}
                          required
                          className="text-lg tracking-wide"
                        />
                      </div>

                      {/* Home Phone */}
                      <div>
                        <label
                          htmlFor="homePhone"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Home Phone
                        </label>
                        <Input
                          id="homePhone"
                          name="homePhone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="(555) 123-4567"
                          value={homePhone}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, "");
                            if (val.length > 10) val = val.slice(0, 10);
                            let formatted = val;
                            if (val.length > 6)
                              formatted = `(${val.slice(0, 3)}) ${val.slice(3, 6)}-${val.slice(6)}`;
                            else if (val.length > 3)
                              formatted = `(${val.slice(0, 3)}) ${val.slice(3)}`;
                            setHomePhone(formatted);
                          }}
                          className="text-lg tracking-wide"
                        />
                      </div>
                    </div>


                    {/* New Patient Only extras */}
                    {patientType === "new" && (
                      <div className="space-y-6">
                        {/* Address */}
                        <div>
                          <h4 className="font-semibold text-gray-700 text-sm mb-2">
                            Address
                          </h4>
                          <div className="grid md:grid-cols-2 gap-4 mb-2">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Street Address
                              </label>
                              <Input
                                placeholder=""
                                value={street}
                                onChange={(e) => setStreet(e.target.value)}
                                autoComplete="street-address"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                City
                              </label>
                              <Input
                                placeholder=""
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                autoComplete="address-level2"
                              />
                            </div>
                          </div>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                State
                              </label>
                              <Input
                                placeholder=""
                                value={state}
                                onChange={(e) => setState(e.target.value.toUpperCase())}
                                autoComplete="address-level1"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                ZIP Code
                              </label>
                              <Input
                                type="text"
                                inputMode="numeric" // ✅ number keypad on mobile
                                placeholder=""
                                value={zip}
                                onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} // only digits
                                autoComplete="postal-code"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Insurance */}
                        <div>
                          <div className="grid md:grid-cols-2 gap-4 mb-2">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Primary Insurance - Company
                              </label>
                              <Input
                                placeholder="e.g. Medicare or Aetna"
                                value={primaryInsurance}
                                onChange={(e) => setPrimaryInsurance(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Primary Insurance ID #
                              </label>
                              <Input
                                placeholder=""
                                value={primaryID}
                                onChange={(e) => setPrimaryID(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Secondary Insurance - Company
                              </label>
                              <Input
                                placeholder="e.g. AARP or Aetna"
                                value={secondaryInsurance}
                                onChange={(e) =>
                                  setSecondaryInsurance(e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Secondary Insurance ID #
                              </label>
                              <Input
                                placeholder=""
                                value={secondaryID}
                                onChange={(e) => setSecondaryID(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Preferences */}
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={allowEmail}
                              onChange={(e) => setAllowEmail(e.target.checked)}
                            />
                            Allow Email Messages
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={allowText}
                              onChange={(e) => setAllowText(e.target.checked)}
                            />
                            Allow Text Messages
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Comments */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Notes for the office
                      </label>
                      <textarea
                        placeholder="Any notes or special requests..."
                        className="w-full border rounded-md p-2 text-sm"
                        rows={3}
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                      />
                    </div>                    

                    {/* Error + Submit */}
                    {formError && (
                      <p className="text-red-600 text-sm font-medium">
                        {formError}
                      </p>
                    )}
                    <Button
                      className="w-full mt-4"
                      onClick={() => setShowConfirmModal(true)}
                      disabled={confirmed || !selectedService}
                    >

                      {confirmed
                        ? "Appointment Confirmed"
                        : "Review & Continue"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        )}

        {bookingComplete && confirmed && (
          <div className="bg-green-100 text-green-800 p-6 rounded-lg text-center mt-12 max-w-xl mx-auto">
            <p className="text-2xl font-bold mb-2">
              {rescheduleId ? "Appointment Updated" : "Appointment Confirmed"}
            </p>
            <p className="text-lg mb-1">
              {format(selectedDate!, "EEEE, MMMM d")} at {selectedTime}
            </p>
            <p className="mb-2 text-base capitalize">{patientType} Patient</p>
            <p className="mb-4 text-sm text-gray-700">
              A confirmation email will be sent shortly.
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-4 mt-4 w-full max-w-sm mx-auto">
              <a
                href={`https://${getSubdomain()}.bookthevisit.com`}
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm w-full sm:flex-1 text-center rounded-full py-2 px-4 font-medium"
              >
                Schedule Another Appointment
              </a>
              <a
                href={`https://${getSubdomain()}.bookthevisit.com/manage/${appointmentId}?token=${manageToken}`}
                className="inline-block border border-red-500 text-red-600 hover:bg-red-50 text-sm w-full sm:flex-1 text-center rounded-full py-2 px-4 font-medium"
              >
                Change / Cancel this Appointment
              </a>
            </div>
          </div>
        )}

        {/* 🔽 Final Confirmation Modal */}
        <AnimatePresence>
          {showConfirmModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 text-center"
              >
                {!confirmed ? (
                  <>
                    <p className="mb-4 text-gray-700 font-medium">
                      Please carefully double-check your details:
                    </p>
                    <p className="font-semibold text-lg">
                      {firstName} {lastName}
                    </p>
                    <p className="font-semibold text-gray-800">{email}</p>
                    {cellPhone && <p className="text-gray-700">{cellPhone}</p>}
                    {selectedDate && selectedTime && (
                      <p className="text-sm text-gray-600 mt-2">
                        {format(
                          selectedDate,
                          selectedDate.getFullYear() === new Date().getFullYear()
                            ? "EEEE, MMMM d"
                            : "EEEE, MMMM d, yyyy"
                        )}{" "}
                        at {selectedTime}
                      </p>
                    )}

                    <div className="flex gap-3 mt-6">
                      <Button
                        className="flex-1 bg-gray-200 text-gray-800"
                        onClick={() => setShowConfirmModal(false)}
                      >
                        Go Back & Fix
                      </Button>
                      <Button
                        className="flex-1 bg-blue-600 text-white"
                        onClick={async () => {
                          await handleConfirm();
                          // keep modal open, just flip to success view
                        }}
                      >
                        Confirm Appointment
                      </Button>
                    </div>
                  </>
                ) : (
                  // ✅ Success view replaces double-check content
                  <div>
                    <div className="text-6xl mb-4">✅</div>
                    <h2 className="text-2xl font-bold text-green-700 mb-4">
                      Appointment Confirmed
                    </h2>
                    <p className="text-gray-700 mb-4">
                      We’ve emailed you the details of your appointment.
                    </p>
                    <Button
                      className="bg-blue-600 text-white"
                      onClick={() => setShowConfirmModal(false)}
                    >
                      Close
                    </Button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </AnimatePresence>
    </div>
  );
}