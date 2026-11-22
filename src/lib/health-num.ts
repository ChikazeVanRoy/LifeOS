/**
 * Shortcuts can only send text. A number may have thousands commas ("8,123") or a unit ("8123 steps",
 * "32 min"). An older Shortcut may send several values separated by spaces or lines ("2 58 71"), and
 * the day's total is their sum.
 */
export const num = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const parts = (value.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((p) => parseFloat(p.replace(/,/g, "")));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts.reduce((a, b) => a + b, 0);
};
