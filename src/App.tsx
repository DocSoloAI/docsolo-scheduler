// src/App.tsx
import BookTheVisitLanding from "./pages/BookTheVisitLanding";
import BookingPage from "./BookingPage";
import DocSoloLanding from "./pages/DocSoloLanding";
import { getSubdomain } from "./lib/getSubdomain";

export default function App() {
  const hostname = window.location.hostname;

  const patientDomain = "bookthevisit.com";
  const providerDomain = "docsoloscheduler.com";

  // Case 1: Root of bookthevisit.com → Patient landing page
  if (hostname === patientDomain || hostname === `www.${patientDomain}`) {
    return <BookTheVisitLanding />;
  }

  // Case 2: Patient subdomains (e.g., drjim.bookthevisit.com → BookingPage)
  const subdomain = getSubdomain();
  if (subdomain && hostname.endsWith(patientDomain)) {
    return <BookingPage />;
  }

  // Case 3: Root of docsoloscheduler.com → Provider marketing landing
  if (hostname === providerDomain || hostname === `www.${providerDomain}`) {
    return <DocSoloLanding />;
  }

  // Case 4: Fallback (provider app routes like /dashboard, or 404)
  return <div>Provider app / Not found</div>;
}
