import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { parse } from "date-fns";
import type { Patient, Service } from "@/types";
import { sendTemplatedEmail } from "@/lib/email/sendTemplatedEmail"; // 📩 you created this
import { resend } from "@/lib/resend";
import { getSubdomain } from "@/lib/getSubdomain";

export default function BookingPage() {
  const [providerId, setProviderId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [providerEmail, setProviderEmail] = useState<string | null>(null);

  const [providerOfficeName, setProviderOfficeName] = useState<string>("");

  useEffect(() => {
    document.title = `${providerOfficeName || "Booking"} – Appointment`;
  }, [providerOfficeName]);

  useEffect(() => {
    const loadProvider = async () => {
      const subdomain = getSubdomain();
      if (!subdomain) return;

      const { data: provider, error } = await supabase
        .from("providers")
        .select("id, email, office_name")
        .eq("subdomain", subdomain)
        .single();

      if (error || !provider) {
        console.error("Provider not found:", error);
        return;
      }

      setProviderId(provider.id);
      setProviderEmail(provider.email);
      setProviderOfficeName(provider.office_name || "");

      // ✅ Fetch services too (moved here)
      const { data: svcData, error: svcError } = await supabase
        .from("services")
        .select("id, provider_id, name, description, duration_minutes, is_active, default_for")
        .eq("provider_id", provider.id)
        .eq("is_active", true);

      if (svcError) {
        console.error("Error loading services:", svcError.message);
      } else {
        setServices(svcData || []);
      }
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
  const [allowEmail, setAllowEmail] = useState(false);
  const [allowText, setAllowText] = useState(false);
  const [formError, setFormError] = useState("");

  const [availableTimes, setAvailableTimes] = useState<string[]>([]);

  useEffect(() => {
    const loadAvailability = async () => {
      if (!providerId || !selectedDate) return;

      const dayOfWeek = selectedDate.getDay(); // 0=Sunday ... 6=Saturday

      const { data: avail, error } = await supabase
        .from("availability")
        .select("start_time, end_time, slot_interval")
        .eq("provider_id", providerId)
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true)
        .single();

      console.log("availability query result:", {
        avail,
        error,
        providerId,
        dayOfWeek,
        selectedDate,
      });

      // if no availability row, bail out early
      if (!avail) {
        setAvailableTimes([]);
        return;
      }

      // build slots
      const start = new Date(selectedDate);
      const [sh, sm] = (avail.start_time as string).split(":").map(Number);
      start.setHours(sh, sm, 0, 0);

      const end = new Date(selectedDate);
      const [eh, em] = (avail.end_time as string).split(":").map(Number);
      end.setHours(eh, em, 0, 0);

      const step = avail.slot_interval || 30;

      // collect all slots first
      const allSlots: { time: string; date: Date }[] = [];
      const cur = new Date(start);
      while (cur < end) {
        allSlots.push({ time: format(cur, "h:mm a"), date: new Date(cur) });
        cur.setMinutes(cur.getMinutes() + step);
      }

      // fetch appointments for that day
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data: appts, error: apptError } = await supabase
        .from("appointments")
        .select("start_time, end_time, status")
        .eq("provider_id", providerId)
        .in("status", ["booked", "time_off"])
        .gte("start_time", startOfDay.toISOString())
        .lte("end_time", endOfDay.toISOString());

      if (apptError) {
        console.error("Error loading appointments:", apptError);
      }

      // filter out slots that overlap with appointments
      const bookedSlots = (appts || []).map((a) => ({
        start: new Date(a.start_time),
        end: new Date(a.end_time),
      }));

      const freeSlots = allSlots.filter((slot) => {
        return !bookedSlots.some(
          (b) => slot.date >= b.start && slot.date < b.end
        );
      });

      // save
      setAvailableTimes(freeSlots.map((s) => s.time));


    };

    loadAvailability();
  }, [providerId, selectedDate]);

  const confirmRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);  // 👈 add this line

  useEffect(() => {
    if (confirmed) {
      confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [confirmed]);

  useEffect(() => {
    if (selectedDate) {
      setTimeout(() => {
        timeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  }, [selectedDate]);

  const patientInfoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedTime) {
      setTimeout(() => {
        patientInfoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  }, [selectedTime]);

  const handleConfirm = async () => {
    // ✅ Validation guard
    if (!firstName || !lastName || !email) {
      setFormError("First name, last name, and email are required.");
      return;
    }
    if (patientType === "new" && !birthday) {
      setFormError("Date of Birth is required for new patients.");
      return;
    }

    try {
      // TODO: replace with your real UUIDs from Supabase
      if (!providerId) {
        setFormError("Provider not found.");
        return;
      }

      const service = services.find(s => s.default_for === patientType);

      if (!service) {
        setFormError("No matching service available.");
        return;
      }

      const serviceId = service.id;

      // 1. Find existing patient by email or cell phone
      const { data: existingPatient, error: findError } = await supabase
        .from("patients")
        .select("id, first_name, last_name, email") // use typed fields
        .eq("provider_id", providerId)
        .or(`email.eq.${email},cell_phone.eq.${cellPhone}`)
        .maybeSingle<Patient>();

      if (findError) throw findError;

      let patientId: string;

      if (existingPatient) {
        patientId = existingPatient.id;
      } else {
        // 2. Insert new patient
        const { data: newPatient, error: insertPatientError } = await supabase
          .from("patients")
          .insert([
            {
              provider_id: providerId,
              first_name: firstName,
              last_name: lastName,
              full_name: `${firstName} ${lastName}`, // 👈 add this line
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

      // 3. Insert appointment
      // Look up service duration
      const { data: serviceData, error: serviceError } = await supabase
        .from("services")
        .select("duration_minutes")
        .eq("id", serviceId)
        .single();

      if (serviceError) throw serviceError;

      const durationMin = serviceData.duration_minutes;

      // Parse the chosen time into a Date on the selectedDate
      const start = parse(
        selectedTime!, // e.g. "9:30 AM"
        "h:mm a",
        selectedDate!
      );
      const end = new Date(start.getTime() + durationMin * 60000);

      const { error: insertApptError } = await supabase
        .from("appointments")
        .insert([
          {
            provider_id: providerId,
            patient_id: patientId,
            service_id: serviceId,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            status: "booked",
          },
        ]);

      if (insertApptError) throw insertApptError;

      // 4. Send patient-facing confirmation email
      const fullName = `${firstName} ${lastName}`;
      const formattedDate = format(start, "MMMM d, yyyy");
      const formattedTime = format(start, "h:mm a");
      const appointmentId = crypto.randomUUID(); // or get from Supabase insert if needed
      const currentSubdomain = getSubdomain();
      // 🔄 switched to bookthevisit.com for patient-facing flow
      const manageLink = `https://${currentSubdomain}.bookthevisit.com/manage/${appointmentId}`;

      await sendTemplatedEmail({
        templateType: "confirmation",
        to: email,
        providerId,
        appointmentData: {
          patientName: fullName,
          date: formattedDate,
          time: formattedTime,
          service: service.name,
          appointmentId,
          manageLink,
        },
      });

      // 5. Send provider notification (still from docsoloscheduler.com)
      if (providerEmail) {
        await resend.emails.send({
          from: `${providerOfficeName || "DocSoloScheduler"} <no-reply@docsoloscheduler.com>`, // ✅ personalized
          to: [providerEmail].filter(Boolean) as string[],
          subject: `New appointment: ${fullName} on ${formattedDate}`,
          html: `
            <p><strong>${fullName}</strong> booked a <strong>${service.name}</strong> appointment.</p>
            <p><strong>Date:</strong> ${formattedDate}<br/>
              <strong>Time:</strong> ${formattedTime}</p>
            <p><strong>Phone:</strong> ${cellPhone}<br/>
              <strong>Email:</strong> ${email}</p>
          `,
        });
      }


      // 4. Success → show confirmation screen
      setConfirmed(true);
    } catch (err) {
      console.error("Booking error:", err);
      alert("Something went wrong booking your appointment.");
    }
  };


  const serviceDescription = services.find(s => s.default_for === patientType)?.description;

  return (
    <div className="max-w-3xl mx-auto p-8 min-h-screen bg-gradient-to-br from-gray-50 to-slate-100">
      <h1 className="text-4xl font-extrabold text-blue-700 mb-10 text-center">
        {providerOfficeName || "Booking Page"}
      </h1>


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
              patientType === "established" ? "border-blue-600 ring-2 ring-blue-400" : ""
            }`}
            onClick={() => setPatientType("established")}
          >
            <CardHeader>
              <CardTitle>Established Patient</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Book a follow-up Chiropractic Treatment.
              </p>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition hover:shadow-lg ${
              patientType === "new" ? "border-blue-600 ring-2 ring-blue-400" : ""
            }`}
            onClick={() => setPatientType("new")}
          >
            <CardHeader>
              <CardTitle>New Patient</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Book your first New Patient Evaluation.
              </p>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      <AnimatePresence>
      {/* DATE & TIME */}
      {patientType && (
        <motion.div
          key="datetime"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
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

                {/* Times on the right (desktop) or below (mobile) */}
                {selectedDate && (
                  <div ref={timeRef}>
                    <p className="text-gray-600 mb-3">
                      Available times on {format(selectedDate, "PPP")}:
                    </p>
                    <div className="flex flex-col gap-3">
                      {availableTimes.map((time) => (
                        <Button
                          key={time}
                          variant={selectedTime === time ? "default" : "outline"}
                          onClick={() => setSelectedTime(time)}
                        >
                          {time}
                        </Button>
                      ))}
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
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">Your Information</h2>
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
                      onChange={(e) => setFirstName(e.target.value)}
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
                      onChange={(e) => setLastName(e.target.value)}
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
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  {patientType === "new" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date of Birth <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="MM/DD/YYYY"
                        autoComplete="bday"
                        value={birthday}
                        onChange={(e) => {
                          let val = e.target.value.replace(/\D/g, "");
                          if (val.length > 8) val = val.slice(0, 8);
                          let formatted = val;
                          if (val.length > 4) {
                            formatted = val.slice(0, 2) + "/" + val.slice(2, 4) + "/" + val.slice(4);
                          } else if (val.length > 2) {
                            formatted = val.slice(0, 2) + "/" + val.slice(2);
                          }
                          setBirthday(formatted);
                        }}
                        required
                      />
                    </div>
                  )}
                </div>


                {/* Row 3: Cell + Home */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cell Phone
                    </label>
                    <Input
                      type="tel"
                      placeholder="(123) 456-7890"
                      autoComplete="tel"
                      value={cellPhone}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\D/g, "");
                        if (val.length > 10) val = val.slice(0, 10);
                        let formatted = val;
                        if (val.length > 6) {
                          formatted = `(${val.slice(0, 3)}) ${val.slice(3, 6)}-${val.slice(6)}`;
                        } else if (val.length > 3) {
                          formatted = `(${val.slice(0, 3)}) ${val.slice(3)}`;
                        }
                        setCellPhone(formatted);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Home Phone
                    </label>
                    <Input
                      type="tel"
                      placeholder="(123) 456-7890"
                      autoComplete="tel-national"
                      value={homePhone}
                      onChange={(e) => setHomePhone(e.target.value)}
                    />
                  </div>
                </div>

                {/* New Patient Only extras */}
                {patientType === "new" && (
                  <div className="space-y-6">
                    {/* Address */}
                    <div>
                      <h4 className="font-semibold text-gray-700 text-sm mb-2">Address</h4>
                      <div className="grid md:grid-cols-2 gap-4 mb-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Street Address
                          </label>
                          <Input
                            placeholder="123 Main St"
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
                            placeholder="City"
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
                            placeholder="PA"
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            autoComplete="address-level1"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            ZIP Code
                          </label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="19317"
                            value={zip}
                            onChange={(e) => setZip(e.target.value)}
                            autoComplete="postal-code"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Insurance */}
                    <div>
                      <h4 className="font-semibold text-gray-700 text-sm mb-2">Insurance</h4>
                      <div className="grid md:grid-cols-2 gap-4 mb-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Primary Insurance
                          </label>
                          <Input
                            placeholder="Insurance Provider"
                            value={primaryInsurance}
                            onChange={(e) => setPrimaryInsurance(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Primary ID
                          </label>
                          <Input
                            placeholder="Policy ID"
                            value={primaryID}
                            onChange={(e) => setPrimaryID(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Secondary Insurance
                          </label>
                          <Input
                            placeholder="Insurance Provider"
                            value={secondaryInsurance}
                            onChange={(e) => setSecondaryInsurance(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Secondary ID
                          </label>
                          <Input
                            placeholder="Policy ID"
                            value={secondaryID}
                            onChange={(e) => setSecondaryID(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

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

                {/* Error + Submit */}
                {formError && (
                  <p className="text-red-600 text-sm font-medium">{formError}</p>
                )}
                <Button className="w-full mt-4" onClick={handleConfirm}>
                  Confirm Appointment
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* CONFIRMATION */}
        {confirmed && (
          <motion.div
            ref={confirmRef}
            key="confirmation"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Card className="bg-gradient-to-br from-green-50 to-green-100">
              <CardContent className="p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12 }}
                  className="text-6xl mb-4"
                >
                  ✅
                </motion.div>
                <h2 className="text-2xl font-bold text-green-700 mb-4">
                  Appointment Confirmed
                </h2>
                <p className="mb-2">
                  <span className="font-semibold">Service:</span> {serviceDescription}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Date:</span>{" "}
                  {selectedDate ? format(selectedDate, "PPP") : ""}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Time:</span> {selectedTime}
                </p>
                <p className="mb-2">
                  <span className="font-semibold">Patient:</span> {firstName} {lastName}
                </p>
                <p className="text-gray-600 mt-4">
                  A confirmation email will be sent shortly.
                  <br />
                  If you need to make changes, please call our office.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
