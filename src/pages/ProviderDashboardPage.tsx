// src/pages/ProviderDashboardPage.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import HoursTab from "@/components/provider/HoursTab";
import CalendarTab from "@/components/provider/CalendarTab";
import ServicesTab from "@/components/provider/ServicesTab";
import SettingsTab from "@/components/provider/SettingsTab";
import { SettingsProvider } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import PatientsTab from "@/components/provider/PatientsTab";
import { toast } from "react-hot-toast";

export default function ProviderSettingsPage() {
  const [activeTab, setActiveTab] = useState("calendar");
  const [hoursDirty, setHoursDirty] = useState(false);
  const [servicesDirty, setServicesDirty] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [providerEmail, setProviderEmail] = useState<string | null>(null);
  const [officeName, setOfficeName] = useState<string>("");

  useEffect(() => {
    document.title = `${officeName || "DocSoloScheduler"} – Dashboard`;
  }, [officeName]);

  const navigate = useNavigate();


  
  // 🧠 Fetch logged-in provider info
  useEffect(() => {
    const getProvider = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setProviderId(user.id);
        setProviderEmail(user.email ?? null);

        // ✅ Fetch provider info including is_active flag
        const { data: providerRow, error } = await supabase
          .from("providers")
          .select("office_name, is_active")
          .eq("id", user.id)
          .single();

        if (!error && providerRow) {
          // 🔒 If provider is inactive, sign them out
          if (providerRow.is_active === false) {
            toast.error("Your account has been deactivated. Please contact support.");
            await supabase.auth.signOut();
            navigate("/");
            return;
          }

          setOfficeName(providerRow.office_name || "");
        } else if (error) {
          console.error("❌ Error fetching provider info:", error.message);
        }
      }
    };

    getProvider();
  }, []);

  useEffect(() => {
    const handleSwitchToCalendar = () => {
      const targetTab = localStorage.getItem("dashboardActiveTab");
      if (targetTab === "calendar") {
        setActiveTab("calendar");
        localStorage.removeItem("dashboardActiveTab");
      }
    };

    // Listen for event from PatientsTab
    window.addEventListener("switch-to-calendar", handleSwitchToCalendar);

    // Run once on mount (in case user refreshed)
    handleSwitchToCalendar();

    return () => {
      window.removeEventListener("switch-to-calendar", handleSwitchToCalendar);
    };
  }, []);

  // ✅ Handles navigation confirmation coming from HoursTab modal
  useEffect(() => {
    const handleNavigateConfirm = (e: Event) => {
      const custom = e as CustomEvent;
      const target = (custom.detail as any)?.target;
      if (target) setActiveTab(target);
    };

    // 👇 Cast listener to EventListener to satisfy TypeScript
    window.addEventListener("docsolo:navigate:confirm", handleNavigateConfirm as EventListener);
    return () => {
      window.removeEventListener("docsolo:navigate:confirm", handleNavigateConfirm as EventListener);
    };
  }, []);


  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/"); // 👈 Back to landing page
  };


  if (!providerId) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-600">
        Loading dashboard…
      </div>
    );
  }

  return (
    // ✅ Keeps scrollbar space constant to stop header/calendar jump
    <div className="max-w-6xl mx-auto py-10 px-4 overflow-y-scroll">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">
          {officeName || "Provider Dashboard"}
        </h1>
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
        {/* ✅ overflow-x-hidden prevents micro width reflows when modals open */}
        <CardContent className="p-6 min-h-[600px] overflow-x-hidden">
          <SettingsProvider providerId={providerId}>
            <Tabs
              value={activeTab}
              onValueChange={(nextTab) => {
                // 🧠 Prevent navigation if unsaved changes exist in Hours or Services
                if ((activeTab === "hours" && hoursDirty) || (activeTab === "services" && servicesDirty)) {
                  window.dispatchEvent(
                    new CustomEvent("docsolo:navigate", { detail: { target: nextTab } })
                  );
                  return; // stop tab switch
                }

                setActiveTab(nextTab);
              }}

            >
              <TabsList className="grid grid-cols-5 gap-2 mb-6">
                <TabsTrigger value="calendar">Calendar</TabsTrigger>
                <TabsTrigger value="patients">Patients</TabsTrigger>
                <TabsTrigger value="hours">Hours</TabsTrigger>
                <TabsTrigger value="services">Services</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>


              <TabsContent value="calendar">
                <CalendarTab providerId={providerId} />
              </TabsContent>

              <TabsContent value="patients">
                <PatientsTab providerId={providerId} />
              </TabsContent>

              <TabsContent value="hours">
                <HoursTab
                  providerId={providerId}
                  onDirtyChange={setHoursDirty}
                />
              </TabsContent>

              <TabsContent value="services">
                <ServicesTab
                  providerId={providerId}
                  onDirtyChange={setServicesDirty}
                />
              </TabsContent>

              <TabsContent value="settings">
                <SettingsTab providerId={providerId} />
              </TabsContent>
            </Tabs>
          </SettingsProvider>
        </CardContent>
      </Card>
    </div>
  );
}
