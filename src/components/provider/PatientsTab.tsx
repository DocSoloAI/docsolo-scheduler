// src/components/provider/PatientsTab.tsx
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "react-hot-toast";

interface PatientsTabProps {
  providerId: string;
}

interface Patient {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  cell_phone?: string;
  full_name?: string;
  visit_count?: number;
  last_appointment?: string | null;
  manual_visit_count?: number | null;
  allow_text?: boolean;
}

export default function PatientsTab({ providerId }: PatientsTabProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  const [editing, setEditing] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Patient>({
    first_name: "",
    last_name: "",
    email: "",
    cell_phone: "",
  });

  // 🔄 Load patients
  const loadPatients = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_patients_with_visits", {
      provider_id_input: providerId,
    });

    if (error) {
      console.error("❌ Error loading patients:", error.message);
      setPatients([]);
    } else {
      setPatients(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPatients();
  }, [providerId]);

  // 🔍 Filtered patients
  const filteredPatients = useMemo(() => {
    const term = search.toLowerCase();
    return patients.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(term) ||
        p.email?.toLowerCase().includes(term) ||
        p.cell_phone?.replace(/\D/g, "").includes(term.replace(/\D/g, ""))
    );
  }, [patients, search]);

  const openAddModal = () => {
    setEditing(null);
    setForm({ first_name: "", last_name: "", email: "", cell_phone: "" });
    setModalOpen(true);
  };

  const openEditModal = async (p: Patient) => {
    setEditing(p);

    // ✅ Fallback: split full_name if first/last are missing
    let first = p.first_name ?? "";
    let last = p.last_name ?? "";
    if ((!first || !last) && p.full_name) {
      const parts = p.full_name.trim().split(" ");
      first = parts[0] ?? "";
      last = parts.slice(1).join(" ") ?? "";
    }

    setForm({
      first_name: first,
      last_name: last,
      email: p.email ?? "",
      cell_phone: p.cell_phone ?? "",
    });

    // 🗓️ Load appointments for this patient
    setLoadingAppointments(true);
    const { data, error } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, status")
      .eq("patient_id", p.id)
      .eq("provider_id", providerId)
      .in("status", ["booked", "completed"]) // ✅ only actual visits
      .order("start_time", { ascending: false });

    if (error) {
      console.error("❌ Error loading appointments:", error.message);
      setAppointments([]);
    } else {
      setAppointments(data || []);
    }

    setLoadingAppointments(false);
    setModalOpen(true);
  };

  // 💾 Confirm Save
  const handleSaveClick = () => {
    setConfirmOpen(true);
  };

  // 💾 Save patient (insert or update)
const savePatient = async () => {
  if (!form.first_name.trim() || !form.last_name.trim()) {
    toast.error("First and last name are required.");
    return;
  }

  try {
    setSaving(true);

    if (editing?.id) {
      // ✏️ Update existing patient
      const { error: updateError } = await supabase
        .from("patients")
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          ...(form.email ? { email: form.email.trim() } : {}),
          cell_phone: form.cell_phone?.trim() || null,
          manual_visit_count: form.manual_visit_count ?? null,
          allow_text: form.allow_text ?? true, // ✅ new field
        })
        .eq("id", editing.id);

      if (updateError) throw updateError;
      console.log("✅ Patient updated successfully:", editing.id);

      // 🔍 Verify update
      const { data: verify } = await supabase
        .from("patients")
        .select("first_name, last_name, email, manual_visit_count")
        .eq("id", editing.id)
        .maybeSingle();

      console.log("🔍 Post-update verification:", verify);
    } else {
      // 🆕 Insert new patient
      const { data: inserted, error: insertError } = await supabase
        .from("patients")
        .insert([
          {
            provider_id: providerId,
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            email: form.email?.trim() || null,
            cell_phone: form.cell_phone?.trim() || null,
            manual_visit_count: form.manual_visit_count ?? null, // ✅ added
            allow_text: form.allow_text ?? true,
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;
      console.log("✅ Patient inserted:", inserted);
    }

    // 🕒 Brief delay for Postgres generated columns to recompute
    await new Promise((r) => setTimeout(r, 350));

    // 🔄 Reload list and reset modal/form
    await loadPatients();
    setEditing(null);
    setModalOpen(false);
    setForm({
      first_name: "",
      last_name: "",
      email: "",
      cell_phone: "",
      manual_visit_count: null,
    });
  } catch (err: any) {
    console.error("❌ Error saving patient:", err.message);
    toast.error("Error saving patient: " + err.message);
  } finally {
    setSaving(false);
  }
};

  // 🗑️ Delete patient
  const deletePatient = async () => {
    if (!editing?.id) return;

    const { error } = await supabase.from("patients").delete().eq("id", editing.id);

    if (error) {
      toast.error(`Error deleting patient: ${error.message}`);
      return;
    }

    console.log("🗑️ Deleted patient:", editing.full_name);
    setConfirmDeleteOpen(false);
    setModalOpen(false);
    setEditing(null);
    await loadPatients();
  };

  if (loading) return <div className="p-4 text-gray-500">Loading patients…</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-800">Patients</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Input
              placeholder="Search patients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-3 pr-8"
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setSearch("")}
              >
                ✕
              </button>
            )}
          </div>
          <Button onClick={openAddModal}>+ Add</Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="overflow-x-auto">
          {filteredPatients.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No patients found.</div>
          ) : (
            <table className="min-w-full text-sm border-collapse">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="p-2 text-left font-medium">Name</th>
                  <th className="p-2 text-left font-medium">Email</th>
                  <th className="p-2 text-left font-medium">Phone</th>
                  <th className="p-2 text-center font-medium">Visits</th>
                  <th className="p-2 text-center font-medium">Last Appt</th>
                  <th className="p-2 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={`${
                      idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    } hover:bg-blue-50 transition-colors`}
                  >
                    <td className="p-2">{p.full_name}</td>
                    <td className="p-2">{p.email || "—"}</td>
                    <td className="p-2">{p.cell_phone || "—"}</td>
                    <td className="p-2 text-center">{p.visit_count || 0}</td>
                    <td className="p-2 text-center">
                      {p.last_appointment
                        ? new Date(p.last_appointment).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="p-2 text-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditModal(p)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setEditing(p);
                          setConfirmDeleteOpen(true);
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden rounded-xl shadow-lg bg-white">
          <DialogHeader className="shrink-0 border-b border-gray-200 px-6 py-3 bg-white sticky top-0 z-10">
            <DialogTitle className="text-lg font-semibold">
              {editing ? "Edit Patient" : "Add Patient"}
            </DialogTitle>
            <DialogDescription>
              Enter or update patient information.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) =>
                    setForm({ ...form, first_name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) =>
                    setForm({ ...form, last_name: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Cell Phone</Label>
              <Input
                type="tel"
                value={form.cell_phone}
                onChange={(e) =>
                  setForm({ ...form, cell_phone: e.target.value })
                }
              />
              {/* ✅ Allow Text Reminders */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={form.allow_text ?? true}
                  onChange={(e) =>
                    setForm({ ...form, allow_text: e.target.checked })
                  }
                />
                <label className="text-sm text-gray-700">
                  Allow text message appointment reminders
                </label>
              </div>
            </div>

            {/* Manual Visit Count */}
            <div>
              <Label>Manual Visit Count (optional)</Label>
              <Input
                type="number"
                min={0}
                value={form.manual_visit_count ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    manual_visit_count:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave blank to use automatic count based on completed visits.
              </p>
            </div>

            {/* 🗓️ Appointment history (Step 3) */}
            {editing && (
              <div className="pt-2 border-t border-gray-200">
                <Label className="block mb-2 font-semibold">
                  Appointments ({appointments.length})
                </Label>

                {loadingAppointments ? (
                  <p className="text-sm text-gray-500">Loading...</p>
                ) : appointments.length === 0 ? (
                  <p className="text-sm text-gray-500">No appointments found.</p>
                ) : (
                  <ul className="text-sm text-gray-700 max-h-40 overflow-y-auto space-y-1">
                    {appointments.map((a) => {
                      const date = new Date(a.start_time);
                      const formatted = date.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      });

                      return (
                        <li
                          key={a.id}
                          className="flex justify-between border-b border-gray-100 pb-1 cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition"
                          onClick={() => {
                            // Store which date and which tab to show
                            localStorage.setItem("calendarFocusDate", a.start_time);
                            localStorage.setItem("dashboardActiveTab", "calendar");

                            // Close modal
                            setModalOpen(false);

                            // Tell dashboard to switch
                            window.dispatchEvent(new Event("switch-to-calendar"));
                          }}

                        >
                          <span>{formatted}</span>
                          <span className="text-gray-500 capitalize">{a.status}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>


          <div className="shrink-0 border-t border-gray-200 px-6 py-4 bg-white flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setModalOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveClick} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Save */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Save</DialogTitle>
            <DialogDescription>
              Are you sure you want to save these changes?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                savePatient();
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Patient</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-600 px-2">
            Delete{" "}
            <strong>
              {editing?.first_name} {editing?.last_name}
            </strong>{" "}
            from your records?
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deletePatient}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
