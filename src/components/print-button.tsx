"use client";

import { Printer } from "lucide-react";
import { btnClass } from "./ui/core";

/** Uses the browser's print dialog — choose "Save as PDF" for a PDF copy (print styles hide app chrome). */
export function PrintButton({ label = "PDF / Print" }: { label?: string }) {
  return (
    <button className={btnClass("secondary")} onClick={() => window.print()} title="Opens the print dialog — choose “Save as PDF”">
      <Printer className="size-4" /> {label}
    </button>
  );
}
