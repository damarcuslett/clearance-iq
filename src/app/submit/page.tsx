"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { fetchJSON } from "@/lib/api";

interface Retailer {
  id: string;
  key: string;
  name: string;
  color: string;
}

export default function SubmitPage() {
  const [retailerId, setRetailerId] = useState("");
  const [productName, setProductName] = useState("");
  const [upc, setUpc] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const { data: retailers } = useQuery({
    queryKey: ["retailers"],
    queryFn: () => fetchJSON<{ retailers: Retailer[] }>("/api/retailers"),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/manual-deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retailerId,
          productName,
          upc: upc || undefined,
          price: parseFloat(price),
          originalPrice: parseFloat(originalPrice),
          photoUrl: photoUrl || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      setResult("✅ Deal submitted successfully. Thank you!");
      setProductName("");
      setUpc("");
      setPrice("");
      setOriginalPrice("");
      setPhotoUrl("");
    },
    onError: (err: Error) => setResult(`❌ ${err.message}`),
  });

  const pct =
    price && originalPrice
      ? Math.round(((parseFloat(originalPrice) - parseFloat(price)) / parseFloat(originalPrice)) * 100)
      : null;

  return (
    <div>
      <PageHeader title="Submit Deal" subtitle="In-store finds · 70% minimum" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setResult(null);
          submit.mutate();
        }}
        className="p-6 max-w-2xl space-y-4"
      >
        <Field label="Retailer">
          <select
            required
            value={retailerId}
            onChange={(e) => setRetailerId(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm"
          >
            <option value="">Select retailer…</option>
            {retailers?.retailers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Product Name">
          <input
            required
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm"
          />
        </Field>

        <Field label="UPC (optional)">
          <input
            value={upc}
            onChange={(e) => setUpc(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Clearance Price">
            <input
              required
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono"
            />
          </Field>

          <Field label="Original Price">
            <input
              required
              type="number"
              step="0.01"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono"
            />
          </Field>
        </div>

        {pct !== null && (
          <div
            className={`text-sm font-mono ${
              pct >= 70 ? "text-[var(--success)]" : "text-[var(--error)]"
            }`}
          >
            Calculated discount: {pct}% {pct < 70 && "(must be ≥ 70%)"}
          </div>
        )}

        <Field label="Photo URL (optional)">
          <input
            type="url"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm"
          />
        </Field>

        <button
          type="submit"
          disabled={submit.isPending || (pct !== null && pct < 70)}
          className="bg-[var(--accent)] text-black font-bold px-6 py-2 rounded text-sm disabled:opacity-50"
        >
          {submit.isPending ? "Submitting…" : "Submit Deal"}
        </button>

        {result && <div className="text-sm">{result}</div>}
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
