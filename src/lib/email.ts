import { Resend } from "resend";
import { render } from "@react-email/components";
import * as React from "react";
import PennyAlert from "../../emails/PennyAlert";
import HighDiscountAlert from "../../emails/HighDiscountAlert";
import WatchlistHit from "../../emails/WatchlistHit";
import DailyDigest from "../../emails/DailyDigest";
import WeeklySummary from "../../emails/WeeklySummary";
import type { DealForEmail } from "../../emails/_shared";

const resendKey = process.env.RESEND_API_KEY ?? "";
const from = process.env.EMAIL_FROM ?? "alerts@clearanceiq.app";
const resend = resendKey ? new Resend(resendKey) : null;

async function send(to: string, subject: string, element: React.ReactElement): Promise<void> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping send");
    return;
  }
  const html = await render(element);
  const result = await resend.emails.send({ from, to, subject, html });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
}

export async function sendPennyAlertEmail(to: string, deal: DealForEmail): Promise<void> {
  await send(
    to,
    `🔴 PENNY DEAL — ${deal.productName}`,
    React.createElement(PennyAlert, { deal })
  );
}

export async function sendHighDiscountEmail(to: string, deal: DealForEmail): Promise<void> {
  await send(
    to,
    `🔥 ${deal.discountPct}% OFF — ${deal.productName}`,
    React.createElement(HighDiscountAlert, { deal })
  );
}

export async function sendWatchlistHitEmail(
  to: string,
  deal: DealForEmail,
  targetPrice: number | null
): Promise<void> {
  await send(
    to,
    `✅ Watchlist Hit — ${deal.productName}`,
    React.createElement(WatchlistHit, { deal, targetPrice })
  );
}

export async function sendDailyDigestEmail(
  to: string,
  props: React.ComponentProps<typeof DailyDigest>
): Promise<void> {
  await send(to, `ClearanceIQ Daily Digest — ${props.dateLabel}`, React.createElement(DailyDigest, props));
}

export async function sendWeeklySummaryEmail(
  to: string,
  props: React.ComponentProps<typeof WeeklySummary>
): Promise<void> {
  await send(
    to,
    `ClearanceIQ Weekly Summary — ${props.weekLabel}`,
    React.createElement(WeeklySummary, props)
  );
}
