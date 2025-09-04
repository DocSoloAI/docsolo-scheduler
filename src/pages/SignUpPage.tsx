// src/pages/SignUpPage.tsx
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { defaultTemplates } from "@/lib/defaultTemplates";

export default function SignUpPage() {
  const [showPassword, setShowPassword] = useState(false);

  // Auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Provider info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [suffix, setSuffix] = useState(""); // DC, MD, DPT, etc.
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

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    const match = digits.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (!match) return value;
    return [match[1], match[2], match[3]].filter(Boolean).join("-").substring(0, 12);
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

    // Clean subdomain input
    const cleanSub = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

    if (!cleanSub) {
      setError("Please choose a subdomain.");
      setLoading(false);
      return;
    }

    // 0. Check subdomain availability
    const { data: existing } = await supabase
      .from("providers")
      .select("id")
      .eq("subdomain", cleanSub);

    if (existing && existing.length > 0) {
      setError("That subdomain is already taken. Please choose another.");
      setLoading(false);
      return;
    }

    // 1. Create Auth user with redirect for confirmation
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (signUpError || !data.user) {
      console.error("Auth signup error:", signUpError);
      setError(signUpError?.message || "Signup failed");
      setLoading(false);
      return;
    }

    const userId = data.user.id;

    // 2. Insert provider row
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
      console.error("Provider insert error:", providerError);
      setError("Error creating provider: " + providerError.message);
      setLoading(false);
      return;
    }

    // 3. Seed email templates
    const { error: templateError } = await supabase
      .from("email_templates")
      .insert(
        defaultTemplates(userId).map((t) => ({
          ...t,
          body: t.html_body.replace(/<[^>]+>/g, ""), // quick strip of HTML
        }))
      );

    if (templateError) {
      console.error("Template seeding error:", templateError);
    }


    // 4. Seed default services
    await supabase.from("services").insert([
      {
        provider_id: userId,
        name: "Chiropractic Treatment",
        duration_minutes: 30,
        is_active: true,
        type: "established",
      },
      {
        provider_id: userId,
        name: "New Patient Evaluation",
        duration_minutes: 60,
        is_active: true,
        type: "new",
      },
    ]);

    // 5. Show success message
    setSuccessMessage(
      "Sign-up successful! Please check your email and click the confirmation link. " +
      "Once confirmed, you’ll be redirected to your personal dashboard."
    );    
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      {/* Only show the form if successMessage is not set */}
      {!successMessage && (
        <form
          onSubmit={handleSignUp}
          className="bg-white p-8 rounded-lg shadow-md w-full max-w-md"
        >
          <h2 className="text-2xl font-bold mb-6 text-center text-blue-600">
            Provider Sign Up
          </h2>

          {error && (
            <div className="bg-red-100 text-red-600 p-2 rounded mb-4">{error}</div>
          )}

          {/* Name */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-1/2 p-2 border rounded"
              required
            />
            <input
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-1/2 p-2 border rounded"
              required
            />
          </div>

          <input
            type="text"
            placeholder="Suffix (DC, MD, DPT)"
            value={suffix}
            onChange={(e) => setSuffix(e.target.value)}
            className="w-full p-2 border rounded mb-3"
          />

          {/* Office */}
          <input
            type="text"
            placeholder="Office Name"
            value={officeName}
            onChange={(e) => setOfficeName(e.target.value)}
            className="w-full p-2 border rounded mb-3"
            required
          />

          {/* Subdomain */}
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Choose your booking link
            </label>
            <div className="flex">
              <input
                type="text"
                placeholder="yourname"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                className="flex-1 p-2 border rounded-l"
                required
              />
              <span className="bg-gray-200 px-3 py-2 border border-l-0 rounded-r text-gray-600 text-sm">
                .docsoloscheduler.com
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              This will be your unique booking page link. Example:{" "}
              <span className="font-mono text-blue-600">
                https://{subdomain || "yourname"}.docsoloscheduler.com
              </span>
            </p>
          </div>

          {/* Auth */}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded mb-3"
            required
          />
          <div className="relative mb-3">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500"
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>

          {/* Phone */}
          <input
            type="text"
            placeholder="Phone (123-456-7890)"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            className="w-full p-2 border rounded mb-3"
          />

          {/* Address */}
          <input
            type="text"
            placeholder="Street"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            className="w-full p-2 border rounded mb-3"
          />
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-1/2 p-2 border rounded"
            />
            <input
              type="text"
              placeholder="State"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              className="w-1/4 p-2 border rounded"
              maxLength={2}
            />
            <input
              type="text"
              placeholder="Zip"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="w-1/4 p-2 border rounded"
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>
      )}

      {/* If successMessage exists, show it big and centered */}
      {successMessage && (
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
          <h2 className="text-2xl font-bold mb-6 text-green-600">Almost there!</h2>
          <p className="text-gray-700">{successMessage}</p>
        </div>
      )}
    </div>
  );

}
