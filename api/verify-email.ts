// /api/verify-email.ts
import dns from "dns";

export default async function handler(req: any, res: any) {
  const email = (req.query.email || "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ valid: false, reason: "missing_email" });
  }

  // Basic syntax check
  const syntaxOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!syntaxOk) {
    return res.status(200).json({ valid: false, reason: "invalid_syntax" });
  }

  const domain = email.split("@")[1];
  if (!domain) {
    return res.status(200).json({ valid: false, reason: "invalid_domain" });
  }

  try {
    // Try MX lookup
    await new Promise((resolve, reject) => {
      dns.resolveMx(domain, (err, addresses) => {
        if (err || !addresses || addresses.length === 0) return reject(err);
        resolve(addresses);
      });
    });

    return res.status(200).json({ valid: true });

  } catch {
    try {
      // A record fallback
      await new Promise((resolve, reject) => {
        dns.resolve(domain, (err) => {
          if (err) return reject(err);
          resolve(true);
        });
      });

      return res.status(200).json({ valid: true });

    } catch {
      return res.status(200).json({ valid: false, reason: "no_dns" });
    }
  }
}
