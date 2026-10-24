"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_RECEIPT_TEMPLATE, normalizeReceiptTemplate, type ReceiptTemplate } from "@/lib/receipts/template";

type TenantSettings = {
  businessName: string; logoUrl: string | null; contactEmail: string | null; contactPhone: string | null;
  address: string | null; invoicePrefix: string; invoiceIdentity: Record<string, unknown>; preferences: Record<string, unknown>;
  currency: string; timezone: string; financialYearStartMonth: number; inventoryCostingMethod: "WEIGHTED_AVERAGE"; defaultPaymentTermsDays: number;
};
const blank: TenantSettings = {businessName:"",logoUrl:null,contactEmail:null,contactPhone:null,address:null,invoicePrefix:"INV",invoiceIdentity:{},preferences:{},currency:"INR",timezone:"Asia/Kolkata",financialYearStartMonth:4,inventoryCostingMethod:"WEIGHTED_AVERAGE",defaultPaymentTermsDays:0};

export function TenantSettingsForm({ initial }: { initial: TenantSettings | null }) {
  const router=useRouter();
  const [form,setForm]=useState<TenantSettings>(initial??blank);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [uploading,setUploading]=useState(false);
  const receiptTemplate = normalizeReceiptTemplate(form.preferences.receiptTemplate);
  function update<K extends keyof TenantSettings>(key:K,value:TenantSettings[K]) {setForm(previous=>({...previous,[key]:value}));setError("");se¶»§q«^