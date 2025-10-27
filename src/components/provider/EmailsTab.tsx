// src/components/provider/EmailsTab.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "react-hot-toast";

interface EmailsTabProps {
  providerId: string;
  onDirtyChange?: (dirty: boolean) => void;
}


interface ProviderInfo {
  id: string;
  office_name: string;
  phone?: string;
  subdomain?: string;
  announcement?: string;
  send_reminders: boolean;
}

export default function EmailsTab({ providerId, onDirtyChange }: EmailsTabProps) {
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const markDirty = () => {
    if (!dirty) {
      setDirty(true);
      onDirtyChange?.(true);
    }
  };

  useEffect(() => {
    const loadProvider = async () => {
      const { data, error } = await supabase
        .from("providers")
        .select("id, office_name, phone, subdomain, announcement, send_reminders")
        .eq("id", providerId)
        .single();

      if (error) {
        console.error("❌ Error fetching provider:", error.message);
        return;
      }

      if (data) {
        setProvider({
          ...data,
          send_reminders:
            data.send_reminders === null || data.send_reminders === undefined
              ? true // default ON if missing
              : data.send_reminders,
        });
      }
    };

    loadProvider();
  }, [providerId]);

  const saveSettings = async () => {
    if (!provider) return;
    setSaving(true);

    const { error } = await supabase
      .from("providers")
      .update({
        announcement: provider.announcement || null,
        send_reminders: provider.send_reminders,
      })
      .eq("id", provider.id);

    setDirty(false);
    onDirtyChange?.(false);


    if (error) {
      toast.error(`Error saving settings: ${error.message}`);
    } else {
      toast.success("Email settings saved successfully ✅");
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* General Settings Card */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow transition-all duration-200">
        <div className="p-6 space-y-6">
          <h3 className="text-lg font-semibold text-gray-800">Email & Page Settings</h3>
          <p className="text-sm text-gray-500">
            These settings control your booking page announcement and automated patient reminder emails.
          </p>

          {/* Announcement */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Announcement Message
            </label>
            <Input
              value={provider?.announcement || ""}
              onChange={(e) => {
                setProvider((p) => (p ? { ...p, announcement: e.target.value } : null));
                markDirty();
              }}

              placeholder="e.g. 'Refer a friend and both get $10 off your next visit!'"
              className="bg-white"
            />
            <p className="text-xs text-gray-500 leading-relaxed">
              Shown at the top of your booking page and at the bottom of all patient emails.
            </p>
          </div>

          {/* Reminders Toggle */}
          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <div>
              <p className="text-sm font-medium text-gray-800">
                Send 24-hour email reminders
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                When enabled, patients automatically get a reminder email 24 hours before their appointment.
              </p>
            </div>
            <Switch
              checked={provider?.send_reminders ?? true}
              onCheckedChange={(val: boolean) => {
                setProvider((p) => (p ? { ...p, send_reminders: val } : null));
                markDirty();
              }}

            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-2">
        <Button
          onClick={saveSettings}
          disabled={!dirty || saving}
          className={`font-medium px-6 py-2 rounded-md shadow-sm transition-all ${
            !dirty || saving
              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {saving ? "Saving…" : dirty ? "Save Settings" : "All Changes Saved"}
        </Button>
      </div>
    </div>
  );

}
