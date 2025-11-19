export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 10) return raw; // fallback if unexpected

  const area = digits.slice(0, 3);
  const mid = digits.slice(3, 6);
  const last = digits.slice(6);

  return `(${area}) ${mid}-${last}`;
}
