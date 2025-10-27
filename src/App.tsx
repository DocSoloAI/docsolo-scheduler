// src/App.tsx
import { Routes, Route } from "react-router-dom";
import BookTheVisitLanding from "./pages/BookTheVisitLanding";
import DocSoloLanding from "./pages/DocSoloLanding";
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
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    }
    fetchProvider();
  }, [subdomain]);

  if (loading) return <div>Loading...</div>;
  if (!providerId) return <div>Provider not found</div>;

  return <SettingsProvider providerId={providerId}>{children}</SettingsProvider>;
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
        </Routes>
        <Toaster richColors position="top-right" /> {/* ✅ add this */}
      </>
    );
  }


  // ---------- Fallback ----------
  return <div>Not found</div>;
}
