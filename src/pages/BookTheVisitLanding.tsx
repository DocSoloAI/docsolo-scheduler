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
            Your provider will give you a custom booking link like{" "}
            <span className="font-mono text-blue-600">
              drjim.bookthevisit.com
            </span>
            .
          </p>
          <p className="text-lg text-gray-700">
            Please ask your provider for their link to schedule your visit.
          </p>
        </section>

        {/* Providers */}
        <section className="bg-white rounded-2xl shadow p-6 space-y-3">
          <h2 className="text-2xl font-semibold">Providers</h2>
          <p className="text-lg text-gray-700">
            DocSoloScheduler is the idiot-proof scheduling system built
            specifically for solo providers.
          </p>
          <Button
            asChild
            className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-6 py-3 rounded-xl"
          >
            <a href="https://docsoloscheduler.com" target="_blank">
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
