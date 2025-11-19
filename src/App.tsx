// src/App.tsx
import { Routes, Route } from "react-router-dom";
import BookTheVisitLanding from "./pages/BookTheVisitLanding";
import DocSoloLanding from "./pages/DocSoloLanding";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import BookingPage from "./BookingPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import ProviderDashboardPage from "./pages/ProviderDashboardPage";
import ManageAppointmentPage from "./pages/ManageAppointmentPage";
import { getSubdomain } from "./lib/getSubdomain";
import { SettingsProvider } from "./context/SettingsContext";
import { supabase } from "./lib/supabaseClient";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";

function BookingWithProvider({ children }: { children: React.ReactNode }) {
  const subdomain = getSubdomain();
  const [providerId, setProviderId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProvider() {
      if (!subdomain) return;
      const { data, error } = await supabase
        .from("providers")
        .select("id")
        .eq("subdomain", subdomain)
        .single();

      if (error) {
        console.error("❌ Provider lookup failed:", error.message);
      } else if (data) {
        setProviderId(data.id);
      }
    }
    fetchProvider();
  }, [subdomain]);

  // Only one guard
  if (!providerId) return null;

  return (
    <SettingsProvider providerId={providerId}>{children}</SettingsProvider>
  );
}

export default function App() {
  const hostname = window.location.hostname;
  const patientRoot = "bookthevisit.com";
  const providerRoot = "docsoloscheduler.com";

  // ---------- Patient Root ----------
  if (hostname === patientRoot || hostname === `www.${patientRoot}`) {
    return <BookTheVisitLanding />;
  }

  // ---------- Patient Subdomains ----------
  const subdomain = getSubdomain();
  if (subdomain && hostname.endsWith(patientRoot)) {
    return (
      <Routes>
        <Route
          path="/"
          element={
            <BookingWithProvider>
              <BookingPage />
            </BookingWithProvider>
          }
        />
        {/* ✅ alias route for reschedules */}
        <Route
          path="/booking"
          element={
            <BookingWithProvider>
              <BookingPage />
            </BookingWithProvider>
          }
        />
        <Route
          path="/manage/:appointmentId"
          element={
            <BookingWithProvider>
              <ManageAppointmentPage />
            </BookingWithProvider>
          }
        />
      </Routes>
    );
  }

  if (
    hostname === providerRoot ||
    hostname === `www.${providerRoot}` ||
    hostname === "localhost"
  ) {
    return (
      <>
        <Routes>
          <Route path="/" element={<DocSoloLanding />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <ProviderDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/booking"
            element={
              <BookingWithProvider>
                <BookingPage />
              </BookingWithProvider>
            }
          />
          <Route
            path="/manage/:appointmentId"
            element={
              <BookingWithProvider>
                <ManageAppointmentPage />
              </BookingWithProvider>
            }
          />
          {/* ✅ Add Terms route */}
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </>
    );
  }

  // ---------- Fallback ----------
  return <div>Not found</div>;
}
