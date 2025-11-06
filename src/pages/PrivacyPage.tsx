import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-800 p-8 flex flex-col items-center">
      <div className="max-w-3xl w-full bg-white rounded-xl shadow-md p-8">
        <h1 className="text-3xl font-bold mb-4 text-center text-blue-700">
          Privacy Policy
        </h1>

        <p className="mb-4">
          DocSoloScheduler respects your privacy. This policy explains what
          information is collected and how it is used when you use this service.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">1. Information We Collect</h2>
        <p className="mb-4">
          The system stores only the minimum data needed to manage appointments:
          patient name, email, phone number, and appointment details such as date
          and time. No medical records, diagnoses, or treatment notes are stored.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">2. How Information Is Used</h2>
        <p className="mb-4">
          Information is used solely for scheduling, reminders, and provider–
          patient communication. It is never sold, shared, or used for
          advertising.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">3. Data Storage</h2>
        <p className="mb-4">
          Data is stored securely using Supabase, which provides encrypted
          databases and authentication. Access is limited to the account owner
          and authorized system functions only.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">4. Email Communications</h2>
        <p className="mb-4">
          All system messages are transactional: confirmations, reminders, and
          cancellations only. No promotional or marketing emails are sent.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">5. Account Control</h2>
        <p className="mb-4">
          You can delete your account at any time. When you do, all associated
          appointment data is permanently removed from our system.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-2">6. Contact</h2>
        <p className="mb-4">
          For privacy-related questions, email{" "}
          <a
            href="mailto:support@docsolosystems.com"
            className="text-blue-600 underline"
          >
            DocSoloAI@gmail.com
          </a>
          .
        </p>
        <div className="flex justify-center mt-8">
          <Link to="/">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white px-6">
              ← Back to DocSoloScheduler
            </Button>
          </Link>
        </div>
        <p className="text-center text-gray-500 text-sm mt-8">
          © {new Date().getFullYear()} DocSolo Systems · All rights reserved.
        </p>
      </div>
    </main>
  );
}
