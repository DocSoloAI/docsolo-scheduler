// src/components/provider/EmailsTab.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface EmailsTabProps {
  providerId: string;
}

interface ProviderInfo {
  id: string;
  office_name: string;
  phone?: string;
  subdomain?: string;
  announcement?: string;
  send_reminders: boolean;
}

export default function EmailsTab({ providerId }: EmailsTabProps) {
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [saving, setSaving] = useState(false);

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

    setSaving(false);

    if (error) {
      alert("❌ Error saving settings: " + error.message);
    } else {
      alert("✅ Email settings saved");
    }
  };

  return (
    <div className="space-y-6">
      <div className="border p-4 rounded bg-gray-50 space-y-4">
        <h3 className="font-semibold">Settings</h3>

        {/* Announcement */}
        <div>
          <label className="block text-sm font-medium">
            Custom Announcement (Emails + Booking Page)
          </label>
          <Input
            value={provider?.announcement || ""}
            onChange={(e) =>
              setProvider((p) => (p ? { ...p, announcement: e.target.value } : null))
            }
            placeholder="e.g. The office will be closed Oct 1–8, 2025"
          />
          <p className="text-xs text-gray-500">
            This note will be shown in two places: 
            <br />• At the top of your booking page (highlighted box) 
            <br />• At the bottom of all patient emails
          </p>
        </div>

        {/* Reminders toggle */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Send 24-hour reminders</label>
          <Switch
            checked={provider?.send_reminders ?? true}
            onCheckedChange={(val: boolean) =>
              setProvider((p) => (p ? { ...p, send_reminders: val } : null))
            }
          />
        </div>
        <p className="text-xs text-gray-500">
          If enabled, patients will automatically receive a reminder email 24 hours before
          their appointment.
        </p>
      </div>

      <Button onClick={saveSettings} disabled={saving}>
        {saving ? "Saving…" : "Save Settings"}
      </Button>
    </div>
  );
}
