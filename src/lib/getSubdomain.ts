export function getSubdomain() {
  const host = window.location.hostname;

  // 👇 Fallback for local dev
  if (host === "localhost") {
    return "drjim"; // change this to your test provider's subdomain
  }

  const parts = host.split(".");
  if (parts.length > 2) {
    return parts[0]; // e.g. drjim.docsoloscheduler.com → "drjim"
  }

  return null;
}
