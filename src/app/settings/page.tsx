"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const subscribe = async () => {
    setStatus(null);
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("Push not supported in this browser.");
      return;
    }
    if (!VAPID_PUBLIC) {
      setStatus("VAPID public key not configured.");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("Permission denied.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("✅ Subscribed to push notifications");
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const unsubscribe = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setStatus("No active subscription.");
        return;
      }
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
      setStatus("Unsubscribed.");
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const runTest = async () => {
    setTestResult("Sending…");
    try {
      const res = await fetch("/api/alerts/test", { method: "POST" });
      const json = (await res.json()) as Record<string, string>;
      setTestResult(`push: ${json.push} · email: ${json.email}`);
    } catch (err) {
      setTestResult(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Alert preferences & push notifications" />

      <div className="p-6 max-w-2xl space-y-6">
        <Section title="Web Push">
          <div className="flex gap-2">
            <button
              onClick={subscribe}
              className="bg-[var(--accent)] text-black font-bold px-4 py-2 rounded text-sm"
            >
              Enable Push
            </button>
            <button
              onClick={unsubscribe}
              className="border border-[var(--border)] text-[var(--text)] px-4 py-2 rounded text-sm"
            >
              Unsubscribe
            </button>
          </div>
          {status && <div className="text-xs text-[var(--muted)]">{status}</div>}
        </Section>

        <Section title="Test Alerts">
          <div className="text-xs text-[var(--muted)]">
            Sends a test push to all active subscriptions and a test email to EMAIL_TO.
          </div>
          <button
            onClick={runTest}
            className="bg-[var(--accent)] text-black font-bold px-4 py-2 rounded text-sm"
          >
            Send Test
          </button>
          {testResult && (
            <div className="text-xs text-[var(--muted)] font-mono">{testResult}</div>
          )}
        </Section>

        <Section title="Thresholds">
          <div className="text-xs text-[var(--muted)]">
            70% is the hard floor — no deals below are ever stored. The alert threshold (90%
            for email) is configured via MIN_ALERT_DISCOUNT in server env.
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3">
      <div className="text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}
