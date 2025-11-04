// src/components/provider/SettingsTab.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "react-hot-toast";

interface SettingsTabProps {
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
  email?: string;
}

export default function SettingsTab({ providerId, onDirtyChange }: SettingsTabProps) {
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loadingChangeEmail, setLoadingChangeEmail] = useState(false);
  const [loadingChangePassword, setLoadingChangePassword] = useState(false);
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
        .select("id, office_name, phone, subdomain, announcement, send_reminders, email")
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
              ? true
              : data.send_reminders,
        });
      }
    };

    loadProvider();
  }, [providerId]);

  // ✅ Save announcement/reminders section
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
    setDirty(false);
    onDirtyChange?.(false);

    if (error) {
      toast.error(`Error saving settings: ${error.message}`);
    } else {
      toast.success("Settings saved successfully ✅");
    }
  };

  // ✅ Change Email
  const handleChangeEmail = async () => {
    if (!newEmail) {
      toast.error("Please enter a new email address.");
      return;
    }
    setLoadingChangeEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setLoadingChangeEmail(false);
    if (error) {
      toast.error(`Error updating email: ${error.message}`);
    } else {
      toast.success("Email updated. Check your inbox for verification.");
      setNewEmail("");
    }
  };

  // ✅ Change Password
  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }
    setLoadingChangePassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoadingChangePassword(false);
    if (error) {
      toast.error(`Error changing password: ${error.message}`);
    } else {
      toast.success("Password changed successfully ✅");
      setNewPassword("");
    }
  };

  // ✅ Soft Delete Account (2-step)
  const handleDeleteAccount = async () => {
    try {
      if (!providerId) return;
      const { error } = await supabase
        .from("providers")
        .update({ is_active: false })
        .eq("id", providerId);
      if (error) throw error;

      await supabase.auth.signOut();
      toast.success("Account deleted. Redirecting...");
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    } catch (err: any) {
      console.error("❌ Error deleting account:", err.message);
      toast.error(`Error deleting account: ${err.message}`);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      {/* ======================= */}
      {/* 📧 Email & Page Settings */}
      {/* ======================= */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow transition-all duration-200">
        <div className="p-6 space-y-6">
          <h3 className="text-lg font-semibold text-gray-800">
            Email & Page Settings
          </h3>
          <p className="text-sm text-gray-500">
            These settings control your booking page announcement and automated
            patient reminder emails.
          </p>

          {/* Announcement */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Announcement Message
            </label>
            <Input
              value={provider?.announcement || ""}
              onChange={(e) => {
                setProvider((p) =>
                  p ? { ...p, announcement: e.target.value } : null
                );
                markDirty();
              }}
              placeholder="e.g. 'Refer a friend and both get $10 off your next visit!'"
              className="bg-white"
            />
            <p className="text-xs text-gray-500 leading-relaxed">
              Shown at the top of your booking page and at the bottom of all
              patient emails.
            </p>
          </div>

          {/* Reminders Toggle */}
          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <div>
              <p className="text-sm font-medium text-gray-800">
                Send 24-hour email reminders
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                When enabled, patients automatically get a reminder email 24
                hours before their appointment.
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

      {/* ======================= */}
      {/* 👤 Account Settings     */}
      {/* ======================= */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow transition-all duration-200 mt-10">
        <div className="p-6 space-y-6">
          <h3 className="text-lg font-semibold text-gray-800">Account Settings</h3>
          <p className="text-sm text-gray-500">
            Manage your provider login and account security.
          </p>

          {/* Current Email */}
          <div>
            <p className="text-sm text-gray-700 mb-1 font-medium">Current Email</p>
            <Input value={provider?.email || ""} disabled className="bg-gray-100" />
          </div>

          {/* Change Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Change Email
            </label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter new email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <Button
                onClick={handleChangeEmail}
                disabled={loadingChangeEmail}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loadingChangeEmail ? "Saving..." : "Update"}
              </Button>
            </div>
          </div>

          {/* Change Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Change Password
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button
                onClick={handleChangePassword}
                disabled={loadingChangePassword}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loadingChangePassword ? "Saving..." : "Update"}
              </Button>
            </div>
          </div>

          {/* Delete Account */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm text-gray-700 font-medium mb-2">
              Delete Account
            </p>
            <p className="text-xs text-gray-500 mb-3">
              This will deactivate your account and sign you out immediately.
            </p>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Account
            </Button>
          </div>
        </div>
      </div>

      {/* 🧩 Delete Confirmation Modals */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate your account? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteModal(false);
                setShowConfirmModal(true);
              }}
            >
              Yes, I’m Sure
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🧩 Final "Are You Absolutely Sure?" Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Are You Absolutely Sure?</DialogTitle>
            <DialogDescription>
              Deleting your account will make it inactive and sign you out. You can
              contact support if you ever need to reactivate.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowConfirmModal(false);
                handleDeleteAccount();
              }}
            >
              Confirm Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
