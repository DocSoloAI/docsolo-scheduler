export function getSubdomain() {
  const host = window.location.hostname;

  // 👇 Fallback for local dev
  if (host === "localhost") {
    return "drjim"; // change this to your test provider's subdomain
  }

  const parts = host.split(".");
  if (parts.length > 2) {
    // e.g. drjim.bookthevisit.com → "drjim"
    return parts[0];
  }

  return null;
}
