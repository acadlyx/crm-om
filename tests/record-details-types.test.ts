import { describe, expect, it } from "vitest";
import { addressText, detailField } from "@/lib/record-details/types";

describe("record detail formatting helpers", () => {
  it("represents absent persisted values without manufacturing data", () => {
    expect(detailField("Email", null).value).toBeNull();
    expect(detailField("Notes", "").value).toBeNull();
  });

  it("converts decimal-like values into safe numeric values for formatted amounts", () => {
    const decimal = { toString: () => "12540.75" };
    expect(detailField("Amount", decimal, "money").value).toBe(12540.75);
  });

  it("serializes dates as ISO strings while preserving the requested display format", () => {
    const field = detailField("Created", new Date("2026-10-26T10:00:00.000Z"), "datetime");
    expect(field.value).toBe("2026-10-26T10:00:00.000Z");
    expect(field.format).toBe("datetime");
  });

  it("turns address JSON and address arrays into readable text", () => {
    expect(addressText({ line1: "12 Main Road", city: "Amroha", postalCode: "244221" }))
      .toBe("Line1: 12 Main Road, City: Amroha, Postal Code: 244221");
    expect(addressText(["12 Main Road", "Amroha"])).toBe("12 Main Road, Amroha");
    expect(addressText(null)).toBeNull();
  });
});
