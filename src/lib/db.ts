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

export async function upsertPatientAndCreateAppointment(
  patient: PatientInput,
  appointment: AppointmentInput
) {
  // 1. Try to find existing patient by email or cell_phone
  let { data: existingPatients, error: lookupError } = await supabase
    .from("patients")
    .select("id")
    .eq("provider_id", patient.provider_id)
    .or(`email.eq.${patient.email},cell_phone.eq.${patient.cell_phone ?? ""}`)
    .limit(1);

  if (lookupError) throw lookupError;

  let patientId: string;

  if (existingPatients && existingPatients.length > 0) {
    // 2. Found existing patient → update last_seen_at
    patientId = existingPatients[0].id;

    const { error: updateError } = await supabase
      .from("patients")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", patientId);

    if (updateError) throw updateError;
  } else {
    // 3. Insert new patient
    const { data: newPatient, error: insertError } = await supabase
      .from("patients")
      .insert({
        first_name: patient.first_name,
        last_name: patient.last_name,
        email: patient.email,
        cell_phone: patient.cell_phone,
        provider_id: patient.provider_id,
        last_seen_at: new Date().toISOString(),

        // ✅ New consent flags (will default true if not provided)
        allow_email: patient.allow_email ?? true,
        allow_text: patient.allow_text ?? true,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;
    patientId = newPatient.id;
  }

  // 4. Create appointment linked to patient
  const { data: newAppt, error: apptError } = await supabase
    .from("appointments")
    .insert({
      patient_id: patientId,
      service_id: appointment.service_id,
      start_time: appointment.start_time,
      end_time: appointment.end_time,
      status: appointment.status ?? "confirmed",
      patient_note: appointment.patient_note ?? null,
      provider_id: patient.provider_id,
    })
    .select()
    .single();

  if (apptError) throw apptError;

  return newAppt;
}
