export type BirthTimeParts = {
  period: "am" | "pm";
  hour: string;
  minute: string;
};

/** Convert a stored 24-hour time into explicit 12-hour form selections. */
export function parseBirthTime(value?: string | null): BirthTimeParts | null {
  if (typeof value !== "string" || value.length !== 5 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":");
  const hour24 = Number(hour);
  return {
    period: hour24 >= 12 ? "pm" : "am",
    hour: String(hour24 % 12 || 12),
    minute,
  };
}

/** Validate the selections before producing the existing API's HH:mm value. */
export function formatBirthTime(parts: BirthTimeParts): string | null {
  if (parts.period !== "am" && parts.period !== "pm") return null;
  if (!/^(?:[1-9]|1[0-2])$/.test(parts.hour) || parts.hour !== String(Number(parts.hour))) return null;
  if (parts.minute.length !== 2 || !/^[0-5]\d$/.test(parts.minute)) return null;
  const hour24 = Number(parts.hour) % 12 + (parts.period === "pm" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${parts.minute}`;
}
