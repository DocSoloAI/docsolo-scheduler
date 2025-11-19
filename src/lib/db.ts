import { supabase } from "./supabaseClient";

interface PatientInput {
  first_name: string;
  last_name: string;
  email: string;
  cell_phone?: string;
  provider_id: string;

  // ✅ New consent flags
  allow_email?: boolean;
  allow_text?: boolean;
}

interface AppointmentInput {
  service_id: string;
  start_time: string; // ISO timestamp
  end_time: string;   // ISO timestamp
  status?: string;
  patient_note?: string | null; // ✅ allow null
}

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}


export async function upsertPatientAndCreateAppointment(
  patient: PatientInput,
  appointment: AppointmentInput
) {
  // -------------------------------------
  // NORMALIZATION
  // -------------------------------------
  const incomingEmail = normalizeEmail(patient.email);
  const incomingPhone = normalizePhone(patient.cell_phone);
  const incomingFirst = patient.first_name.trim().toLowerCase();
  const incomingLast = patient.last_name.trim().toLowerCase();

  let existingPatient: any | null = null;

  // 1. MASTER MATCH: Phone number
  if (incomingPhone) {
    const { data, error } = await supabase
      .from("patients")
      .select("id, email, other_emails, cell_phone, first_name, last_name, allow_text")
      .eq("provider_id", patient.provider_id);

    if (error) throw error;

    if (data) {
      const normalizedIncoming = incomingPhone;

      const found = data.find((p) => {
        const digits = (p.cell_phone || "").replace(/\D/g, "");
        return digits === normalizedIncoming;
      });

      if (found) {
        existingPatient = found;
      }
    }
  }


  // -------------------------------------------------
  // 2. PRIMARY OR SECONDARY EMAIL MATCH (if no phone)
  // -------------------------------------------------
  if (!existingPatient && incomingEmail) {
    const { data, error } = await supabase
      .from("patients")
      .select("id, email, other_emails, cell_phone, first_name, last_name, allow_text")
      .eq("provider_id", patient.provider_id)
      .or(
        `email_lower.eq.${incomingEmail},other_emails_lower.cs.[\\"${incomingEmail}\\"]`
      )
      .limit(1);

    if (error) throw error;
    if (data && data.length > 0) {
      existingPatient = data[0];
    }
  }

  // ------------------------------------------------------
  // 3. FALLBACK MATCH: full name + email (case-insensitive)
  // ------------------------------------------------------
  if (!existingPatient && incomingEmail) {
    const { data, error } = await supabase
      .from("patients")
      .select("id, email, other_emails, cell_phone, first_name, last_name, allow_text")
      .eq("provider_id", patient.provider_id)
      .eq("first_name_lower", incomingFirst)
      .eq("last_name_lower", incomingLast)
      .eq("email_lower", incomingEmail)

      .limit(1);

    if (error) throw error;
    if (data && data.length > 0) {
      existingPatient = data[0];
    }
  }

  let patientId: string;

  // ---------------------------------------------------
  // UPDATE EXISTING PATIENT (merge emails, update timestamp)
  // ---------------------------------------------------
  if (existingPatient) {
    patientId = existingPatient.id;

    const currentPrimary = normalizeEmail(existingPatient.email);
    const currentOthers: string[] = existingPatient.other_emails ?? [];

    let updatedOthers = [...currentOthers];

    // If the new email is different, promote new email to primary
    if (incomingEmail && incomingEmail !== currentPrimary) {
      // Add old primary to other_emails if missing
      if (currentPrimary && !updatedOthers.includes(currentPrimary)) {
        updatedOthers.push(currentPrimary);
      }

      // Add incomingEmail to other_emails if not present
      if (!updatedOthers.includes(incomingEmail)) {
        updatedOthers.push(incomingEmail);
      }

      const { error } = await supabase
        .from("patients")
        .update({
          email: incomingEmail,
          other_emails: updatedOthers,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", patientId);

      if (error) throw error;
    } else {
      // Email didn't change, just update timestamp
      const { error } = await supabase
        .from("patients")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", patientId);

      if (error) throw error;
    }
  }

  // ----------------------------------------
  // INSERT NEW PATIENT (no match was found)
  // ----------------------------------------
  else {
    const { data: newPatient, error: insertError } = await supabase
      .from("patients")
      .insert({
        first_name: patient.first_name,
        last_name: patient.last_name,
        email: incomingEmail,
        other_emails: [], // starts empty
        cell_phone: incomingPhone,
        provider_id: patient.provider_id,
        last_seen_at: new Date().toISOString(),
        allow_email: patient.allow_email ?? true,
        allow_text: patient.allow_text ?? true,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;
    patientId = newPatient.id;
  }

  // --------------------------------------------------------
  // 4. Create appointment linked to patient
  // --------------------------------------------------------
  const { data: newAppt, error: apptError } = await supabase
    .from("appointments")
    .insert({
      patient_id: patientId,
      service_id: appointment.service_id,
      start_time: appointment.start_time,
      end_time: appointment.end_time,
      status: appointment.status ?? "booked",
      patient_note: appointment.patient_note ?? null,
      provider_id: patient.provider_id,
    })
    .select()
    .single();

  if (apptError) throw apptError;

  return {
    ...newAppt,
    existingPatientAllowText: existingPatient?.allow_text ?? null,
  };
}

