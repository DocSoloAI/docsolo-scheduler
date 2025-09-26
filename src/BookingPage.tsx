import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { parse } from "date-fns";
import type { Patient } from "@/types";
import { getSubdomain } from "@/lib/getSubdomain";
import { useSearchParams } from "react-router-dom";
import { sendTemplatedEmail } from "@/lib/email/sendTemplatedEmail";
import { useSettings } from "@/context/SettingsContext";

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
      .select("id, email, office_name, phone, street, city, state, zip, announcement, logo_url")
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
    };

    loadProvider();
  }, []);

  const [patientType, setPatientType] = useState<"established" | "new" | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

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
    const loadAvailability = async () => {
      if (!providerId || !selectedDate) return;

      const dayOfWeek = selectedDate.getDay();

      const { data: availRows, error } = await supabase
        .from("availability")
        .select("start_time, end_time, slot_interval")
        .eq("provider_id", providerId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true);

      if (error || !availRows || availRows.length === 0) {
        setAvailableTimes([]);
        return;
      }

      let allSlots: { time: string; date: Date }[] = [];

      availRows.forEach((avail) => {
        const start = new Date(selectedDate);
        const [sh, sm] = (avail.start_time as string).split(":").map(Number);
        start.setHours(sh, sm, 0, 0);

        const end = new Date(selectedDate);
        const [eh, em] = (avail.end_time as string).split(":").map(Number);
        end.setHours(eh, em, 0, 0);

        const step = avail.slot_interval || 30;
        const cur = new Date(start);

        while (cur < end) {
          allSlots.push({ time: format(cur, "h:mm a"), date: new Date(cur) });
          cur.setMinutes(cur.getMinutes() + step);
        }
      });

      allSlots.sort((a, b) => a.date.getTime() - b.date.getTime());

      const now = new Date();
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      // --- Fetch booked appts ---
      const { data: appts } = await supabase
        .from("appointments")
        .select("id, start_time, end_time, status")
        .eq("provider_id", providerId)
        .eq("status", "booked")
        .gte("start_time", startOfDay.toISOString())
        .lte("end_time", endOfDay.toISOString());

      // --- Fetch provider time_off (holidays, days off, etc.) ---
      const { data: offs } = await supabase
        .from("time_off")
        .select("start_time, end_time")
        .eq("provider_id", providerId)
        .gte("start_time", startOfDay.toISOString())
        .lte("end_time", endOfDay.toISOString());

      const bookedSlots = [
        ...(appts || []).filter((a) => !rescheduleId || a.id !== rescheduleId).map((a) => ({
          start: new Date(a.start_time),
          end: new Date(a.end_time),
        })),
        ...(offs || []).map((o) => ({
          start: new Date(o.start_time),
          end: new Date(o.end_time),
        })),
      ];

      const freeSlots = allSlots
        .filter((slot) => !bookedSlots.some((b) => slot.date >= b.start && slot.date < b.end))
        .filter((slot) => {
          if (selectedDate.toDateString() !== now.toDateString()) return true;
          return slot.date > now;
        });

      setAvailableTimes(freeSlots.map((s) => s.time));
    };

    loadAvailability();
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

      const service = services.find((s) => s.default_for === patientType);
      if (!service) {
        setFormError("No matching service available.");
        return;
      }
      const serviceId = service.id;

      // 1. Find or create patient
      const { data: existingPatient, error: findError } = await supabase
        .from("patients")
        .select("id, first_name, last_name, email")
        .eq("provider_id", providerId)
        .or(`email.eq.${email},cell_phone.eq.${cellPhone}`)
        .maybeSingle<Patient>();

      if (findError) throw findError;

      let patientId: string;
      if (existingPatient) {
        patientId = existingPatient.id;
      } else {
        const { data: newPatient, error: insertPatientError } = await supabase
          .from("patients")
          .insert([
            {
              provider_id: providerId,
              first_name: firstName,
              last_name: lastName,
              full_name: `${firstName} ${lastName}`,
              email,
              cell_phone: cellPhone,
              home_phone: homePhone,
              birthday: birthday ? new Date(birthday).toISOString() : null,
              street,
              city,
              state,
              zip,
            },
          ])
          .select()
          .single();

        if (insertPatientError) throw insertPatientError;
        patientId = newPatient.id;
      }

      // 2. Get service duration
      const { data: serviceData, error: serviceError } = await supabase
        .from("services")
        .select("duration_minutes")
        .eq("id", serviceId)
        .single();

      if (serviceError) throw serviceError;
      const durationMin = serviceData.duration_minutes;

      const start = parse(selectedTime!, "h:mm a", selectedDate!);
      const end = new Date(start.getTime() + durationMin * 60000);

      let appointmentId: string | null = null;

      if (rescheduleId) {
        // 🔄 Update existing appointment
        const { error: updateError } = await supabase
          .from("appointments")
          .update({
            service_id: serviceId,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            patient_id: patientId,
            status: "booked",
          })
          .eq("id", rescheduleId);

        if (updateError) throw updateError;

        appointmentId = rescheduleId;
      } else {
        // 🆕 Insert new appointment
        const { data: newAppt, error: insertApptError } = await supabase
          .from("appointments")
          .insert([
            {
              provider_id: providerId,
              patient_id: patientId,
              service_id: serviceId,
              start_time: start.toISOString(),
              end_time: end.toISOString(),
              status: "booked",
              patient_note: comments || null,
            },
          ])
          .select()
          .single();

        if (insertApptError) throw insertApptError;
        if (!newAppt) throw new Error("Insert failed, no appointment returned");

        appointmentId = newAppt.id;
      }


      if (!appointmentId) throw new Error("Appointment ID missing");

      // 3. Emails
      const fullName = `${firstName} ${lastName}`;
      const formattedDate = format(start, "MMMM d, yyyy");
      const formattedTime = format(start, "h:mm a");

      // Patient email
      await sendTemplatedEmail({
        templateType: rescheduleId ? "update" : "confirmation",
        to: email,
        providerId,
        appointmentData: {
          patientName: fullName,
          providerName: providerOfficeName || "Your Provider",
          date: formattedDate,
          time: formattedTime,
          service: service.name,
          appointmentId,
          manageLink: `https://${getSubdomain()}.bookthevisit.com/manage/${appointmentId}`,
          location: [providerStreet, providerCity, providerState, providerZip]
            .filter(Boolean)
            .join(", "),
          officeName: providerOfficeName,
          providerPhone,
          announcement: providerAnnouncement,
          logoUrl: providerLogoUrl,
        },
      });

      // Provider email
      if (providerEmail) {
        await sendTemplatedEmail({
          templateType: rescheduleId ? "provider_update" : "provider_confirmation",
          to: providerEmail,
          providerId,
          appointmentData: {
            patientName: fullName,
            patientEmail: email,
            patientPhone: cellPhone,
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

      // 4. Mark confirmed
      setAppointmentId(appointmentId);
      setConfirmed(true);
    } catch (err) {
      console.error("Booking error:", err);
      alert("Something went wrong booking your appointment.");
    }
  };




  const serviceDescription = services.find(s => s.default_for === patientType)?.description;

  return (
    <div className="max-w-3xl mx-auto p-8 min-h-screen bg-gradient-to-br from-gray-50 to-slate-100">
      <AnimatePresence>
        {/* 👇 Hide booking UI after confirmed */}
        {!confirmed && providerOfficeName && (
          <>
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

            {/* WHO’S BOOKING TODAY */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-10"
            >
              <h2 className="text-2xl font-semibold mb-6 text-gray-800">
                Who’s booking today?
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                <Card
                  className={`cursor-pointer transition hover:shadow-lg ${
                    patientType === "established"
                      ? "border-blue-600 bg-blue-50 ring-2 ring-blue-400"
                      : ""
                  }`}
                  onClick={() => setPatientType("established")}
                >
                  <CardHeader>
                    <CardTitle
                      className={patientType === "established" ? "text-blue-700 font-bold" : ""}
                    >
                      {services.find((s) => s.default_for === "established")?.name || "Returning Patient"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-sm ${
                        patientType === "established"
                          ? "text-blue-600 font-medium"
                          : "text-gray-500"
                      }`}
                    >
                      {services.find((s) => s.default_for === "established")?.description ||
                        "Book a follow-up Chiropractic Treatment."}
                    </p>
                  </CardContent>
                </Card>

                <Card
                  className={`cursor-pointer transition hover:shadow-lg ${
                    patientType === "new"
                      ? "border-blue-600 bg-blue-50 ring-2 ring-blue-400"
                      : ""
                  }`}
                  onClick={() => setPatientType("new")}
                >
                  <CardHeader>
                    <CardTitle
                      className={patientType === "new" ? "text-blue-700 font-bold" : ""}
                    >
                      {services.find((s) => s.default_for === "new")?.name || "New Patient"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-sm ${
                        patientType === "new"
                          ? "text-blue-600 font-medium"
                          : "text-gray-500"
                      }`}
                    >
                      {services.find((s) => s.default_for === "new")?.description ||
                        "Book your first New Patient Evaluation."}
                    </p>
                  </CardContent>
                </Card>

              </div>
            </motion.div>

            {/* DATE & TIME */}
            {patientType && (
              <motion.div
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
                            Available times on {format(selectedDate, "PPP")}:
                          </p>
                          <div className="grid grid-cols-2 gap-4">
                            {/* AM column */}
                            <div className="flex flex-col gap-3">
                              {availableTimes
                                .filter((time) => time.toLowerCase().includes("am"))
                                .map((time) => (
                                  <Button
                                    key={time}
                                    onClick={() => setSelectedTime(time)}
                                    className={`w-full
                                      ${selectedTime === time
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
                                    className={`w-full
                                      ${selectedTime === time
                                        ? "bg-blue-600 text-white hover:bg-blue-700"
                                        : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                                      }`}
                                  >
                                    {time}
                                  </Button>

                                ))}
                            </div>
                          </div>
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="email"
                          placeholder=""
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          onBlur={(e) => {
                            const val = e.target.value;
                            if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                              setFormError("Please enter a valid email address.");
                            } else {
                              setFormError("");
                            }
                          }}
                        />
                      </div>

                      {patientType === "new" && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Date of Birth <span className="text-red-500">*</span>
                          </label>
                          <Input
                            type="date"
                            value={birthday}
                            onChange={(e) => setBirthday(e.target.value)}
                            required
                          />
                        </div>
                      )}
                    </div>


                    {/* Row 3: Cell + Home */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cell Phone <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="tel"
                          placeholder=""
                          autoComplete="tel"
                          value={cellPhone}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, ""); // strip non-digits
                            if (val.length > 10) val = val.slice(0, 10);
                            let formatted = val;
                            if (val.length > 6) {
                              formatted = `(${val.slice(0, 3)}) ${val.slice(3, 6)}-${val.slice(6)}`;
                            } else if (val.length > 3) {
                              formatted = `(${val.slice(0, 3)}) ${val.slice(3)}`;
                            }
                            setCellPhone(formatted);
                          }}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Home Phone
                        </label>
                        <Input
                          type="tel"
                          placeholder=""
                          autoComplete="tel-national"
                          value={homePhone}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, ""); // strip non-digits
                            if (val.length > 10) val = val.slice(0, 10);
                            let formatted = val;
                            if (val.length > 6) {
                              formatted = `(${val.slice(0, 3)}) ${val.slice(3, 6)}-${val.slice(6)}`;
                            } else if (val.length > 3) {
                              formatted = `(${val.slice(0, 3)}) ${val.slice(3)}`;
                            }
                            setHomePhone(formatted);
                          }}
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
                      onClick={() => setShowConfirmModal(true)} // ✅ open modal instead of confirm
                      disabled={confirmed}
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

        {/* Confirmation Splash */}
        {confirmed && (
          <motion.div
            key="confirmation"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10"
          >
            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-300">
              <CardContent className="p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12 }}
                  className="text-6xl mb-4"
                >
                  ✅
                </motion.div>
                <h2 className="text-2xl font-bold text-green-700 mb-2">
                  {rescheduleId ? "Appointment Updated" : "Appointment Confirmed"}
                </h2>

                {/* Appointment details */}
                {selectedDate && selectedTime && (
                  <p className="text-gray-700 font-medium mt-2">
                    {format(selectedDate, "MMMM d, yyyy")} at {selectedTime}
                  </p>
                )}
                {services.find((s) => s.default_for === patientType)?.name && (
                  <p className="text-gray-600 mt-1">
                    {
                      services.find((s) => s.default_for === patientType)
                        ?.name
                    }
                  </p>
                )}

                <p className="text-gray-600 mt-4">
                  A confirmation email will be sent shortly.
                </p>

                <div className="flex justify-center gap-4 mt-6">
                  <Button
                    className="min-w-[200px] bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => {
                      setConfirmed(false);
                      setSelectedDate(undefined);
                      setSelectedTime(null);
                      setFirstName("");
                      setLastName("");
                      setEmail("");
                      setCellPhone("");
                    }}
                  >
                    {rescheduleId ? "Reschedule Another Time" : "Book Another Visit"}
                  </Button>


                  {appointmentId && (
                    <Button
                      variant="outline"
                      className="min-w-[200px]"
                      onClick={() => {
                        window.location.href = `https://${getSubdomain()}.bookthevisit.com/manage/${appointmentId}`;
                      }}
                    >
                      Change / Cancel this Appointment
                    </Button>
                  )}

                </div>
              </CardContent>
            </Card>
          </motion.div>
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
                <p className="mb-4 text-gray-700 font-medium">
                  Please carefully double-check your details:
                </p>
                <p className="font-semibold text-lg">{firstName} {lastName}</p>
                <p className="font-semibold text-gray-800">{email}</p>
                {cellPhone && (
                  <p className="text-gray-700">{cellPhone}</p>
                )}
                {selectedDate && selectedTime && (
                  <p className="text-sm text-gray-600 mt-2">
                    {format(selectedDate, "MMMM d, yyyy")} at {selectedTime}
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
                    onClick={() => {
                      setShowConfirmModal(false);
                      handleConfirm();
                    }}
                  >
                    Confirm Appointment
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </AnimatePresence>
    </div>
  );
}