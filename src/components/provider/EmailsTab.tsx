// src/components/provider/EmailsTab.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { defaultTemplates } from "@/lib/defaultTemplates";

interface EmailsTabProps {
  providerId: string;
}

interface Template {
  id: string;
  provider_id: string;
  template_type: "confirmation" | "reminder" | "cancellation" | "update";
  subject: string;
  html_body: string;
}

interface ProviderInfo {
  first_name: string;
  last_name: string;
  suffix?: string;
  office_name: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  subdomain?: string;
}

export default function EmailsTab({ providerId }: EmailsTabProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // Utility: strip HTML to plain text for fallback
  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  useEffect(() => {
    const loadData = async () => {
      // fetch provider info
      const { data: providerData, error: providerError } = await supabase
        .from("providers")
        .select(
          "id,email,phone,subdomain,created_at,office_name,first_name,last_name,suffix,street,city,state,zip"
        )
        .eq("id", providerId)
        .single();

      if (providerError) {
        console.error("Error fetching provider:", providerError.message);
      } else {
        setProvider(providerData);
      }

      // fetch templates
      const { data: templateData, error: templateError } = await supabase
        .from("email_templates")
        .select("id, provider_id, template_type, subject, html_body")
        .eq("provider_id", providerId);

      if (templateError) {
        console.error("Error loading templates:", templateError.message);
        return;
      }

      if (!templateData || templateData.length === 0) {
        console.warn("No templates found — seeding defaults.");

        const withPlainText = defaultTemplates(providerId).map((t) => ({
          ...t,
          body: stripHtml(t.html_body || ""),
        }));

        const { error: seedError, data: seeded } = await supabase
          .from("email_templates")
          .upsert(withPlainText, { onConflict: "provider_id,template_type" })
          .select();

        if (seedError) {
          console.error("Error seeding default templates:", seedError.message);
        } else {
          setTemplates(seeded as Template[]);
        }
      } else {
        // enforce order: confirmation → reminder → cancellation → update
        const order = ["confirmation", "reminder", "cancellation", "update"];
        const sorted = [...templateData].sort(
          (a, b) =>
            order.indexOf(a.template_type) - order.indexOf(b.template_type)
        );
        setTemplates(sorted as Template[]);
      }
    };

    loadData();
  }, [providerId]);

  // warn if leaving page with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (unsaved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsaved]);

  const updateTemplate = (
    idx: number,
    field: keyof Template,
    value: string
  ) => {
    const updated = [...templates];
    updated[idx] = { ...updated[idx], [field]: value };
    setTemplates(updated);
    setUnsaved(true);
  };

  const saveTemplates = async () => {
    setSaving(true);

    const { error } = await supabase.from("email_templates").upsert(
      templates.map((t) => ({
        id: t.id,
        provider_id: t.provider_id,
        template_type: t.template_type,
        subject: t.subject,
        html_body: t.html_body,
      }))
    );

    setSaving(false);

    if (error) {
      alert("Error saving templates: " + error.message);
      return;
    }

    setUnsaved(false);
    alert("Templates saved ✅");
  };

  const resetTemplates = async () => {
    if (!providerId) return;

    const withPlainText = defaultTemplates(providerId).map((t) => ({
      ...t,
      body: stripHtml(t.html_body || ""),
    }));

    const { error, data: seeded } = await supabase
      .from("email_templates")
      .upsert(withPlainText, { onConflict: "provider_id,template_type" })
      .select();

    if (error) {
      alert("Error resetting templates: " + error.message);
      return;
    }

    setTemplates(seeded as Template[]);
    setUnsaved(false);
    alert("Templates reset to defaults ✅");
  };

  // Replace placeholders with provider + sample values for preview
  const applyVariables = (text: string) => {
    if (!text) return "";

    const providerName = provider
      ? `${provider.first_name} ${provider.last_name}${
          provider.suffix ? ", " + provider.suffix : ""
        }`
      : "Your Provider";

    const providerAddress = provider
      ? [provider.street, provider.city, provider.state, provider.zip]
          .filter(Boolean)
          .join(", ")
      : "Office Address";

    return text
      .replace(/{{patientName}}/g, "Jane Doe")
      .replace(/{{providerName}}/g, providerName)
      .replace(/{{location}}/g, providerAddress)
      .replace(/{{date}}/g, "Aug 30, 2025")
      .replace(/{{time}}/g, "10:30 AM")
      .replace(/{{service}}/g, "Treatment Visit")
      .replace(/{{providerPhone}}/g, provider?.phone || "(000) 000-0000")
      .replace(
        /{{manageLink}}/g,
        `https://docsoloscheduler.com/${provider?.subdomain || "demo"}/manage/123`
      );
  };

  return (
    <div className="space-y-6">
      {templates.map((t, idx) => {
        const previewSubject = applyVariables(t.subject);
        const previewHtml = applyVariables(t.html_body || "");

        return (
          <div key={t.template_type} className="border p-4 rounded space-y-4">
            <h3 className="font-semibold capitalize">{t.template_type}</h3>

            <div className="grid md:grid-cols-2 gap-6">
              {/* EDITOR */}
              <div className="space-y-4">
                <Input
                  value={t.subject}
                  onChange={(e) =>
                    updateTemplate(idx, "subject", e.target.value)
                  }
                  placeholder="Email subject"
                />

                <Textarea
                  value={t.html_body || ""}
                  onChange={(e) =>
                    updateTemplate(idx, "html_body", e.target.value)
                  }
                  rows={10}
                  placeholder="This is the email your patients will receive"
                />

                <p className="text-xs text-gray-500">
                  Your name, address, and phone are automatically filled from
                  your profile.
                </p>
              </div>

              {/* PREVIEW */}
              <div className="border rounded p-4 bg-white space-y-4 overflow-auto">
                <h4 className="font-semibold mb-2">Preview</h4>
                <div className="mb-2 text-sm font-medium">
                  Subject: {previewSubject}
                </div>

                <div
                  className="border rounded p-2 text-sm"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Save + Reset Buttons */}
      <div className="flex gap-2">
        <Button onClick={() => setShowConfirmSave(true)} disabled={saving}>
          {saving ? "Saving…" : "Save All Templates"}
        </Button>
        <Button
          variant="destructive"
          onClick={() => setShowConfirmReset(true)}
          disabled={saving}
        >
          Reset Templates
        </Button>
      </div>

      {/* Save Confirmation Modal */}
      {showConfirmSave && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-sm w-full">
            <h3 className="font-semibold mb-2">Confirm Save</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to save these email templates?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowConfirmSave(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await saveTemplates();
                  setShowConfirmSave(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showConfirmReset && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-sm w-full">
            <h3 className="font-semibold mb-2 text-red-600">Reset Templates?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will overwrite your current templates with defaults. Are you
              sure?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowConfirmReset(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await resetTemplates();
                  setShowConfirmReset(false);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
