"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return <button type="button" className="brand-button invoice-print-button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print / Save PDF</button>;
}
