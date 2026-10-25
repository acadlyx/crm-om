export type DetailValueFormat = "text" | "money" | "date" | "datetime" | "quantity" | "number" | "status";

export type DetailValue = string | number | boolean | null;

export type DetailField = {
  label: string;
  value: DetailValue;
  format?: DetailValueFormat;
  href?: string;
};

export type DetailSection = {
  title: string;
  fields: DetailField[];
};

export type RecordDetail = {
  type: string;
  title: string;
  reference?: string | null;
  status?: string | null;
  currency?: string;
  sections: DetailSection[];
};

export function detailField(
  label: string,
  value: unknown,
  format: DetailValueFormat = "text",
  href?: string,
): DetailField {
  let normalized: DetailValue = null;
  if (value !== null && value !== undefined && value !== "") {
    if (value instanceof Date) {
      normalized = value.toISOString();
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      normalized = value;
    } else if (typeof value === "object") {
      const raw = String(value);
      const numeric = Number(raw);
      normalized = ["money", "quantity", "number"].includes(format) && Number.isFinite(numeric) ? numeric : raw;
    } else {
      normalized = String(value);
    }
  }
  return { label, value: normalized, format, ...(href ? { href } : {}) };
}

export function addressText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(addressText).filter((part): part is string => !!part).join(", ") || null;
  if (value && typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([key, part]) => {
        const text = addressText(part);
        return text ? key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()) + ": " + text : null;
      })
      .filter((part): part is string => !!part);
    return parts.join(", ") || null;
  }
  return null;
}

export function detailSection(title: string, fields: DetailField[]): DetailSection {
  return { title, fields };
}
