// src/pages/BookTheVisitLanding.tsx
import { Button } from "@/components/ui/button";

export default function BookTheVisitLanding() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white text-gray-800 px-6">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          Welcome to <span className="text-blue-600">BookTheVisit.com</span>
        </h1>

        {/* Patients */}
        <section className="bg-white rounded-2xl shadow p-6 space-y-3">
          <h2 className="text-2xl font-semibold">Patients</h2>
          <p className="text-lg text-gray-700">
            To schedule a visit, you’ll need your provider’s custom link such as{" "}
            <span className="font-mono text-blue-600">
              yourdoctorsname.bookthevisit.com
            </span>
            .
          </p>
          <p className="text-lg text-gray-700">
            Please contact your provider to get the correct link for booking.
          </p>
        </section>

        {/* Providers */}
        <section className="bg-white rounded-2xl shadow p-6 space-y-3">
          <h2 className="text-2xl font-semibold">Providers</h2>
          <p className="text-lg text-gray-700">
            DocSoloScheduler powers BookTheVisit.com, the patient-facing booking system. As a provider, you’ll manage your schedule here at DocSoloScheduler.com, while your patients book through your custom link (e.g. drjones.bookthevisit.com).
          </p>
          <Button
            asChild
            className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-6 py-3 rounded-xl"
          >
            <a href="https://docsoloscheduler.com" target="_blank" rel="noreferrer">
              Learn More at DocSoloScheduler.com
            </a>
          </Button>
        </section>

        <footer className="text-sm text-gray-500 pt-6">
          © {new Date().getFullYear()} DocSolo Systems
        </footer>
      </div>
    </main>
  );
}
