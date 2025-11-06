import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import SignUpForm from "@/components/auth/SignUpForm";
import SignInForm from "@/components/auth/SignInForm";

export default function DocSoloLanding() {
  const [showSignUp, setShowSignUp] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const signUpRef = useRef<HTMLDivElement | null>(null);
  const signInRef = useRef<HTMLDivElement | null>(null);

  // 🧭 Smooth scroll into view when either form toggles on
  useEffect(() => {
    const ref = showSignUp ? signUpRef : showSignIn ? signInRef : null;
    if (ref?.current) {
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [showSignUp, showSignIn]);

  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white text-gray-800">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 max-w-3xl leading-tight">
          Simple Online Scheduling for{" "}
          <span className="text-blue-600">Solo Providers</span>
        </h1>
        <p className="mt-6 text-lg text-gray-700 max-w-2xl">
          DocSoloScheduler is built for chiropractors, massage therapists,
          physical therapists, and other solo practices who want an{" "}
          <strong>easy, foolproof booking system</strong> without staff,
          complexity, or bloat.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <Button
            className="text-lg px-8 py-4"
            onClick={() => {
              setShowSignUp(true);
              setShowSignIn(false);
            }}
          >
            Get Started Free
          </Button>
          <Button
            variant="outline"
            className="text-lg px-8 py-4 border-2"
            onClick={() => {
              setShowSignIn(true);
              setShowSignUp(false);
            }}
          >
            Sign In
          </Button>
        </div>
      </section>

      {/* Inline SignUp/SignIn Forms */}
      {showSignUp && (
        <section
          ref={signUpRef}
          className="py-16 px-6 bg-gray-100 flex justify-center"
        >
          <SignUpForm />
        </section>
      )}
      {showSignIn && (
        <section
          ref={signInRef}
          className="py-16 px-6 bg-gray-100 flex justify-center"
        >
          <SignInForm />
        </section>
      )}

      {/* Features */}
      <section className="py-16 px-6 bg-gray-100">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 text-center">
          <div className="p-6 bg-white shadow rounded-2xl">
            <h3 className="font-semibold text-xl mb-2">Foolproof Setup</h3>
            <p className="text-gray-600">
              Add your services, hours, and phone number. We’ll do the rest.
            </p>
          </div>
          <div className="p-6 bg-white shadow rounded-2xl">
            <h3 className="font-semibold text-xl mb-2">Custom Subdomain</h3>
            <p className="text-gray-600">
              Patients book at{" "}
              <span className="font-mono text-blue-600">
                yourname.bookthevisit.com
              </span>{" "}
              — simple and professional.
            </p>
          </div>
          <div className="p-6 bg-white shadow rounded-2xl">
            <h3 className="font-semibold text-xl mb-2">Automated Emails</h3>
            <p className="text-gray-600">
              Confirmation, reminders, and cancellations are all handled
              automatically — no staff required.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-500 text-sm">
        © {new Date().getFullYear()} DocSolo Systems ·{" "}
        <a href="/terms" className="underline hover:text-gray-700">
          Terms
        </a>{" "}
        ·{" "}
        <a href="/privacy" className="underline hover:text-gray-700">
          Privacy
        </a>
      </footer>
    </main>
  );
}
