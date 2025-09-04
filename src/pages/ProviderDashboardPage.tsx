// src/pages/ProviderSettingsPage.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import HoursTab from "@/components/provider/HoursTab";
import CalendarTab from "@/components/provider/CalendarTab";
import ServicesTab from "@/components/provider/ServicesTab";
import EmailsTab from "@/components/provider/EmailsTab";
import { SettingsProvider } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";

export default function ProviderSettingsPage() {
  const [activeTab, setActiveTab] = useState("calendar");
  const [hoursDirty, setHoursDirty] = useState(false);
  const [servicesDirty, setServicesDirty] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [providerEmail, setProviderEmail] = useState<string | null>(null);

  const navigate = useNavigate();

  // Fetch logged-in provider
  useEffect(() => {
    const getProvider = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setProviderId(user.id);
        setProviderEmail(user.email ?? null);
      }
    };

    getProvider();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/sign-in");
  };

  if (!providerId) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-600">
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-10 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Provider Dashboard</h1>
        <div className="flex flex-col items-end">
          {providerEmail && (
            <span className="text-sm text-gray-600 mb-1">{providerEmail}</span>
          )}
          <Button variant="secondary" size="sm" onClick={handleLogout}>
            Log Out
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 min-h-[600px]">
          <SettingsProvider providerId={providerId}>
            <Tabs
              value={activeTab}
              onValueChange={(nextTab) => {
                if (activeTab === "hours" && hoursDirty) {
                  const confirmLeave = window.confirm(
                    "You have unsaved changes in Hours. Do you want to leave without saving?"
                  );
                  if (!confirmLeave) return;
                }
                if (activeTab === "services" && servicesDirty) {
                  const confirmLeave = window.confirm(
                    "You have unsaved changes in Services. Do you want to leave without saving?"
                  );
                  if (!confirmLeave) return;
                }
                setActiveTab(nextTab);
              }}
            >
              <TabsList className="grid grid-cols-4 gap-2 mb-6">
                <TabsTrigger value="calendar">Calendar</TabsTrigger>
                <TabsTrigger value="hours">Hours</TabsTrigger>
                <TabsTrigger value="services">Services</TabsTrigger>
                <TabsTrigger value="emails">Emails</TabsTrigger>
              </TabsList>

              <TabsContent value="calendar">
                <CalendarTab providerId={providerId} />
              </TabsContent>

              <TabsContent value="hours">
                <HoursTab providerId={providerId} onDirtyChange={setHoursDirty} />
              </TabsContent>

              <TabsContent value="services">
                <ServicesTab
                  providerId={providerId}
                  onDirtyChange={setServicesDirty}
                />
              </TabsContent>

              <TabsContent value="emails">
                <EmailsTab providerId={providerId} />
              </TabsContent>
            </Tabs>
          </SettingsProvider>
        </CardContent>
      </Card>
    </div>
  );
}
