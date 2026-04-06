import * as React from "react";
import { Section, Text, Hr } from "@react-email/components";
import { Shell, COLORS, mono, type DealForEmail } from "./_shared";

export interface DailyDigestProps {
  dateLabel: string;
  totalDeals: number;
  avgDiscount: number;
  topDeals: DealForEmail[];
  pennyDeals: DealForEmail[];
  expiredNear: DealForEmail[];
  insight?: string | null;
}

export default function DailyDigest({
  dateLabel,
  totalDeals,
  avgDiscount,
  topDeals,
  pennyDeals,
  expiredNear,
  insight,
}: DailyDigestProps) {
  return (
    <Shell preview={`ClearanceIQ Daily Digest — ${dateLabel}`}>
      <Section style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, margin: 0 }}>
          Daily Digest
        </Text>
        <Text style={{ fontSize: 11, color: COLORS.muted, margin: "4px 0 0 0" }}>{dateLabel}</Text>
      </Section>

      <Section style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Text style={{ ...mono, fontSize: 28, fontWeight: 700, color: COLORS.accent, margin: 0 }}>
          {totalDeals}
        </Text>
        <Text style={{ fontSize: 11, color: COLORS.muted, margin: "0 0 8px 0" }}>
          deals found yesterday · avg {avgDiscount}% off
        </Text>
      </Section>

      {insight && (
        <Section style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.penny}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: 700, color: COLORS.penny, textTransform: "uppercase" as const, letterSpacing: 1, margin: "0 0 6px 0" }}>
            Today&apos;s Intelligence
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.text, margin: 0, lineHeight: 1.5 }}>
            {insight}
          </Text>
        </Section>
      )}

      {pennyDeals.length > 0 && (
        <>
          <Text style={{ fontSize: 14, fontWeight: 700, color: COLORS.penny, margin: "16px 0 8px 0" }}>
            🔴 Penny Deals
          </Text>
          {pennyDeals.map((d, i) => (
            <DigestRow key={`p${i}`} deal={d} />
          ))}
          <Hr style={{ borderColor: COLORS.border, margin: "12px 0" }} />
        </>
      )}

      <Text style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, margin: "16px 0 8px 0" }}>
        Top 5 Discounts
      </Text>
      {topDeals.map((d, i) => (
        <DigestRow key={`t${i}`} deal={d} />
      ))}

      {expiredNear.length > 0 && (
        <>
          <Hr style={{ borderColor: COLORS.border, margin: "12px 0" }} />
          <Text style={{ fontSize: 12, color: COLORS.muted, margin: "8px 0" }}>
            You missed: {expiredNear.length} deals expired yesterday.
          </Text>
        </>
      )}
    </Shell>
  );
}

function DigestRow({ deal }: { deal: DealForEmail }) {
  return (
    <Section style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
      <Text style={{ fontSize: 13, color: COLORS.text, margin: "0 0 4px 0" }}>{deal.productName}</Text>
      <Text style={{ ...mono, fontSize: 12, color: COLORS.accent, margin: 0 }}>
        ${deal.currentPrice.toFixed(2)}{" "}
        <span style={{ color: COLORS.muted, textDecoration: "line-through" }}>
          ${deal.originalPrice.toFixed(2)}
        </span>{" "}
        · {deal.discountPct}% off
      </Text>
      <Text style={{ fontSize: 10, color: COLORS.muted, margin: "4px 0 0 0" }}>
        {deal.storeName} · {deal.storeCity}
      </Text>
    </Section>
  );
}

DailyDigest.PreviewProps = {
  dateLabel: "April 5, 2026",
  totalDeals: 142,
  avgDiscount: 81,
  topDeals: [],
  pennyDeals: [],
  expiredNear: [],
} satisfies DailyDigestProps;
