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
  first_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  phone?: string | null;
  subdomain?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  announcement?: string | null;
  send_reminders: boolean;
  email?: string | null;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);

  if (digits.length > 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length > 3) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return digits;
}

export default function SettingsTab({
  providerId,
  onDirtyChange,
}: SettingsTabProps) {
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

  const updateProviderField = <K extends keyof ProviderInfo>(
    field: K,
    value: ProviderInfo[K]
  ) => {
    setProvider((current) =>
      current ? { ...current, [field]: value } : current
    );
    markDirty();
  };

  useEffect(() => {
    const loadProvider = async () => {
      const { data, error } = await supabase
        .from("providers")
        .select(
          `
          id,
          office_name,
          first_name,
          last_name,
          suffix,
          phone,
          subdomain,
          street,
          city,
          state,
          zip,
          announcement,
          send_reminders,
          email
        `
        )
        .eq("id", providerId)
        .single();

      if (error) {
        console.error("❌ Error fetching provider:", error.message);
        toast.error("Error loading provider settings.");
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

        setDirty(false);
        onDirtyChange?.(false);
      }
    };

    loadProvider();
  }, [providerId, onDirtyChange]);

  const saveSettings = async () => {
    if (!provider) return;

    if (!provider.office_name?.trim()) {
      toast.error("Office name is required.");
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from("providers")
        .update({
          office_name: provider.office_name.trim(),
          first_name: provider.first_name?.trim() || null,
          last_name: provider.last_name?.trim() || null,
          suffix: provider.suffix?.trim() || null,
          phone: provider.phone?.trim() || null,
          street: provider.street?.trim() || null,
          city: provider.city?.trim() || null,
          state: provider.state?.trim() || null,
          zip: provider.zip?.trim() || null,
          announcement: provider.announcement?.trim() || null,
          send_reminders: provider.send_reminders,
        })
        .eq("id", provider.id);

      if (error) throw error;

      setDirty(false);
      onDirtyChange?.(false);
      toast.success("Settings saved successfully ✅");
    } catch (err: any) {
      console.error("❌ Error saving settings:", err.message);
      toast.error(`Error saving settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) {
      toast.error("Please enter a new email address.");
      return;
    }

    setLoadingChangeEmail(true);

    const { error } = await supabase.auth.updateUser({
      email: newEmail.trim(),
    });

    setLoadingChangeEmail(false);

    if (error) {
      toast.error(`Error updating email: ${error.message}`);
    } else {
      toast.success("Email updated. Check your inbox for verification.");
      setNewEmail("");
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }

    setLoadingChangePassword(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoadingChangePassword(false);

    if (error) {
      toast.error(`Error changing password: ${error.message}`);
    } else {
      toast.success("Password changed successfully ✅");
      setNewPassword("");
    }
  };

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

  if (!provider) {
    return <div className="p-4 text-gray-500">Loading settings…</div>;
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* ======================= */}
      {/* 🏥 Office Profile       */}
      {/* ======================= */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow transition-all duration-200">
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Office Profile
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              These details appear on your booking page and appointment emails.
            </p>
          </div>

          {/* Office Name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Office Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={provider.office_name || ""}
              onChange={(e) =>
                updateProviderField("office_name", e.target.value)
              }
              placeholder="e.g. Cesca Chiropractic"
              className="bg-white"
            />
          </div>

          {/* Provider Name */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <Input
                value={provider.first_name || ""}
                onChange={(e) =>
                  updateProviderField("first_name", e.target.value)
                }
                placeholder="First"
                className="bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <Input
                value={provider.last_name || ""}
                onChange={(e) =>
                  updateProviderField("last_name", e.target.value)
                }
                placeholder="Last"
                className="bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Suffix
              </label>
              <Input
                value={provider.suffix || ""}
                onChange={(e) => updateProviderField("suffix", e.target.value)}
                placeholder="e.g. DC"
                className="bg-white"
              />
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Office Phone
            </label>
            <Input
              type="tel"
              value={provider.phone || ""}
              onChange={(e) =>
                updateProviderField("phone", formatPhone(e.target.value))
              }
              placeholder="(555) 123-4567"
              className="bg-white"
            />
          </div>

          {/* Address */}
          <div className="space-y-3 border-t border-gray-200 pt-4">
            <p className="text-sm font-medium text-gray-800">Office Address</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Street Address
              </label>
              <Input
                value={provider.street || ""}
                onChange={(e) => updateProviderField("street", e.target.value)}
                placeholder="Street address"
                className="bg-white"
              />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City
                </label>
                <Input
                  value={provider.city || ""}
                  onChange={(e) => updateProviderField("city", e.target.value)}
                  placeholder="City"
                  className="bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State
                </label>
                <Input
                  value={provider.state || ""}
                  onChange={(e) =>
                    updateProviderField("state", e.target.value.toUpperCase())
                  }
                  placeholder="PA"
                  maxLength={2}
                  className="bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ZIP Code
                </label>
                <Input
                  value={provider.zip || ""}
                  onChange={(e) => updateProviderField("zip", e.target.value)}
                  placeholder="19380"
                  className="bg-white"
                />
              </div>
            </div>
          </div>

          {/* Locked Subdomain */}
          <div className="space-y-2 border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700">
              Booking Subdomain
            </label>
            <Input
              value={
                provider.subdomain
                  ? `${provider.subdomain}.bookthevisit.com`
                  : ""
              }
              disabled
              className="bg-gray-100 text-gray-600"
            />
            <p className="text-xs text-gray-500 leading-relaxed">
              Your booking subdomain is locked after signup to protect your
              patient booking link.
            </p>
          </div>
        </div>
      </div>

      {/* ======================= */}
      {/* 📧 Email & Page Settings */}
      {/* ======================= */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow transition-all duration-200">
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Email & Page Settings
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              These settings control your booking page announcement and automated
              patient reminder emails.
            </p>
          </div>

          {/* Announcement */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Announcement Message
            </label>
            <Input
              value={provider.announcement || ""}
              onChange={(e) =>
                updateProviderField("announcement", e.target.value)
              }
              placeholder="e.g. Refer a friend and both get $10 off your next visit!"
              className="bg-white"
            />
            <p className="text-xs text-gray-500 leading-relaxed">
              Shown at the top of your booking page and at the bottom of patient
              emails.
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
              checked={provider.send_reminders ?? true}
              onCheckedChange={(val: boolean) =>
                updateProviderField("send_reminders", val)
              }
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
          <h3 className="text-lg font-semibold text-gray-800">
            Account Settings
          </h3>
          <p className="text-sm text-gray-500">
            Manage your provider login and account security.
          </p>

          {/* Current Email */}
          <div>
            <p className="text-sm text-gray-700 mb-1 font-medium">
              Current Email
            </p>
            <Input
              value={provider.email || ""}
              disabled
              className="bg-gray-100"
            />
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

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate your account? This action
              cannot be undone.
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

      {/* Final Delete Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Are You Absolutely Sure?</DialogTitle>
            <DialogDescription>
              Deleting your account will make it inactive and sign you out. You
              can contact support if you ever need to reactivate.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
            >
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