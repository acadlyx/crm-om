"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { buildUpiUri, findStatementColumn, invoiceOutstandingBalance, parseStatementCsv, safeUpiFilename } from "@/lib/operations/upi-utils";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  AlertCircle, ArrowDownToLine, ArrowRight, CheckCircle2, Clipboard, LoaderCircle,
  QrCode, RefreshCw, Search, Upload, X,
} from "lucide-react";

type RecordRow = Record<string, unknown> & { id: string };
type Collection = {
  id: string;
  transactionRef: string;
  upiId: string;
  payerName: string | null;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "FAILED" | string;
  utr: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  notes: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  receiptId: string | null;
  customerId: string | null;
  customer: { id: string; name: string; company: string | null } | null;
  invoice: { id: string; invoiceNumber: string; status: string; customer: { name: string } } | null;
};
type ActiveQr = { id: string; uri: string; image: string; amount: number; reference: string };
type IdempotencyAttempt = { signature: string; key: string };

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = (value: string | null | undefined)¶»§q«^