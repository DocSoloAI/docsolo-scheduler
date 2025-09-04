// src/lib/getSubdomain.ts

export function getSubdomain(): string | null {
  if (typeof window === "undefined") return null;

  const host = window.location.hostname;

  // Only match subdomains like: drjim.docsoloscheduler.com
  if (host.endsWith("docsoloscheduler.com")) {
    const parts = host.split(".");
    if (parts.length >= 3) {
      return parts[0]; // e.g., 'drjim'
    }
  }

  return null;
}
