// src/components/auth/SignUpForm.tsx
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { defaultTemplates } from "@/lib/defaultTemplates";

export default function SignUpForm() {
  const [showPassword, setShowPassword] = useState(false);

  // Auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Provider info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [officeName, setOfficeName] = useState("");
  const [phone, setPhone] = useState("");
  const [subdomain, setSubdomain] = useState("");

  // Address
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const requiredMark = <span className="text-red-500">*</span>;

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    const match = digits.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (!match) return value;
    return [match[1], match[2], match[3]]
      .filter(Boolean)
      .join("-")
      .substring(0, 12);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    const cleanSub = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleanSub) {
      setError("Please choose a subdomain.");
      setLoading(false);
      return;
    }

    const { data: subdomainCheck, error: subdomainError } =
      await supabase.functions.invoke("checkSubdomainAvailable", {
        body: { subdomain: cleanSub },
      });

    if (subdomainError) {
      setError("Could not check subdomain availability. Please try again.");
      setLoading(false);
      return;
    }

    if (!subdomainCheck?.available) {
      setError("That subdomain is already taken.");
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });

    if (signUpError || !data.user) {
      setError(signUpError?.message || "Signup failed");
      setLoading(false);
      return;
    }

    const userId = data.user.id;

    const { error: providerError } = await supabase.from("providers").insert([
      {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        suffix,
        office_name: officeName,
        email,
        phone,
        street,
        city,
        state,
        zip,
        subdomain: cleanSub,
      },
    ]);

    if (providerError) {
      setError("Error creating provider: " + providerError.message);
      setLoading(false);
      return;
    }

    await supabase.from("email_templates").insert(
      defaultTemplates(userId).map((t) => ({
        ...t,
        body: t.html_body.replace(/<[^>]+>/g, ""),
      }))
    );

    await supabase.from("services").insert([
      {
        provider_id: userId,
        name: "Treatment",
        duration_minutes: 30,
        is_active: true,
        type: "established",
        default_for: "established",
      },
      {
        provider_id: userId,
        name: "New Patient Evaluation",
        duration_minutes: 60,
        is_active: true,
        type: "new",
        default_for: "new",
      },
    ]);

    setSuccessMessage("Sign-up successful! Please check your email to confirm.");
    setLoading(false);
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-lg">
      <h2 className="text-2xl font-bold mb-6 text-center text-blue-600">
        Create Your Free Account
      </h2>

      {error && (
        <div className="bg-red-100 text-red-600 p-2 rounded mb-4">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-100 text-green-700 p-2 rounded mb-4">
          {successMessage}
        </div>
      )}

      {!successMessage && (
        <form onSubmit={handleSignUp} className="space-y-4">
          {/* Provider name */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">
                First Name {requiredMark}
              </label>
              <input
                className="w-full p-2 border rounded"
                placeholder="First Name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">
                Last Name {requiredMark}
              </label>
              <input
                className="w-full p-2 border rounded"
                placeholder="Last Name"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Suffix
            </label>
            <input
              className="w-full p-2 border rounded"
              placeholder="DC, MD, DPT"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Office Name {requiredMark}
            </label>
            <input
              className="w-full p-2 border rounded"
              placeholder="Office Name"
              required
              value={officeName}
              onChange={(e) => setOfficeName(e.target.value)}
            />
          </div>

          {/* Subdomain */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Pick your custom website link {requiredMark}
            </label>

            <div className="flex">
              <input
                className="flex-1 p-2 border rounded-l"
                placeholder="yourname"
                required
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
              />
              <span className="bg-gray-100 px-3 py-2 border border-l-0 rounded-r text-gray-700 text-sm font-mono">
                .bookthevisit.com
              </span>
            </div>

            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-800 leading-relaxed">
                <span className="font-semibold">
                  Choose carefully — your subdomain cannot be changed after signup.
                </span>
                <br />
                This will be your patient booking link.
              </p>
            </div>

            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Example: enter{" "}
              <span className="font-mono text-blue-600">drjones</span> →{" "}
              <span className="font-mono text-blue-600">
                drjones.bookthevisit.com
              </span>
            </p>
          </div>

          {/* Auth */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Email {requiredMark}
            </label>
            <input
              className="w-full p-2 border rounded"
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Password {requiredMark}
            </label>
            <div className="relative">
              <input
                className="w-full p-2 border rounded pr-10"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-700 transition"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Phone + Address */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Phone
            </label>
            <input
              className="w-full p-2 border rounded"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Street
            </label>
            <input
              className="w-full p-2 border rounded"
              placeholder="Street"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1 text-gray-700">
                City
              </label>
              <input
                className="w-full p-2 border rounded"
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">
                State
              </label>
              <input
                className="w-full p-2 border rounded"
                placeholder="State"
                maxLength={2}
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">
                Zip
              </label>
              <input
                className="w-full p-2 border rounded"
                placeholder="Zip"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {loading ? "Creating..." : "Sign Up"}
          </button>
        </form>
      )}
    </div>
  );
}