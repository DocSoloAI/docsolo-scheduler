// src/components/provider/PatientsTab.tsx
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/context/SettingsContext";

interface PatientsTabProps {
  providerId: string;
}

export default function PatientsTab({ providerId }: PatientsTabProps) {
  const { patients, loading, reload } = useSettings();

  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    cell_phone: "",
  });

  const startAdd = () => {
    setEditing(null);
    setForm({ first_name: "", last_name: "", email: "", cell_phone: "" });
    setShowForm(true);
  };

  const startEdit = (p: any) => {
    setEditing(p);
    setForm({
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      cell_phone: p.cell_phone,
    });
    setShowForm(true);
  };

  const savePatient = async () => {
    if (editing) {
      const { error } = await supabase
        .from("patients")
        .update(form)
        .eq("id", editing.id)
        .eq("provider_id", providerId);

      if (error) {
        alert("Error updating patient: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("patients").insert([
        {
          ...form,
          provider_id: providerId,
        },
      ]);

      if (error) {
        alert("Error adding patient: " + error.message);
        return;
      }
    }

    setEditing(null);
    setShowForm(false);
    setForm({ first_name: "", last_name: "", email: "", cell_phone: "" });

    await reload(); // ✅ refresh global context so CalendarTab sees new patient
  };

  if (loading) return <div>Loading patients…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Patients</h2>
        <Button onClick={startAdd}>+ Add Patient</Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-2 border">First Name</th>
                <th className="p-2 border">Last Name</th>
                <th className="p-2 border">Email</th>
                <th className="p-2 border">Phone</th>
                <th className="p-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="p-2 border">{p.first_name}</td>
                  <td className="p-2 border">{p.last_name}</td>
                  <td className="p-2 border">{p.email || "—"}</td>
                  <td className="p-2 border">{p.cell_phone || "—"}</td>
                  <td className="p-2 border">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(p)}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardContent className="space-y-4">
            <h3 className="font-semibold">
              {editing ? "Edit Patient" : "Add Patient"}
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                placeholder="First Name"
                value={form.first_name}
                onChange={(e) =>
                  setForm({ ...form, first_name: e.target.value })
                }
              />
              <Input
                placeholder="Last Name"
                value={form.last_name}
                onChange={(e) =>
                  setForm({ ...form, last_name: e.target.value })
                }
              />
            </div>
            <Input
              placeholder="Email"
              value={form.email || ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Cell Phone"
              value={form.cell_phone || ""}
              onChange={(e) => {
                let val = e.target.value.replace(/\D/g, ""); // remove non-digits
                if (val.length > 3 && val.length <= 6) {
                  val = val.replace(/(\d{3})(\d+)/, "$1-$2");
                } else if (val.length > 6) {
                  val = val.replace(/(\d{3})(\d{3})(\d+)/, "$1-$2-$3");
                }
                setForm({ ...form, cell_phone: val });
              }}
              maxLength={12} // keeps it at xxx-xxx-xxxx
            />


            <div className="flex gap-2">
              <Button onClick={savePatient}>
                {editing ? "Update" : "Save"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setShowForm(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
