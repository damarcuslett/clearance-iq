import * as React from "react";
import { Section, Text, Hr } from "@react-email/components";
import { Shell, DealBlock, COLORS, mono, type DealForEmail } from "./_shared";

export interface WeeklySummaryProps {
  weekLabel: string;
  totalDeals: number;
  avgDiscount: number;
  bestDeal: DealForEmail | null;
  storeLeaderboard: { name: string; count: number }[];
  trendingCategories: string[];
}

export default function WeeklySummary({
  weekLabel,
  totalDeals,
  avgDiscount,
  bestDeal,
  storeLeaderboard,
  trendingCategories,
}: WeeklySummaryProps) {
  return (
    <Shell preview={`ClearanceIQ Weekly Summary — ${weekLabel}`}>
      <Section style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, margin: 0 }}>
          Weekly Summary
        </Text>
        <Text style={{ fontSize: 11, color: COLORS.muted, margin: "4px 0 0 0" }}>{weekLabel}</Text>
      </Section>

      <Section style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Text style={{ ...mono, fontSize: 12, color: COLORS.muted, margin: "0 0 4px 0" }}>
          Week in numbers
        </Text>
        <Text style={{ ...mono, fontSize: 24, fontWeight: 700, color: COLORS.accent, margin: "0 0 4px 0" }}>
          {totalDeals} deals · avg {avgDiscount}%
        </Text>
      </Section>

      {bestDeal && (
        <>
          <Text style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, margin: "16px 0 8px 0" }}>
            🏆 Best Deal of the Week
          </Text>
          <DealBlock deal={bestDeal} />
        </>
      )}

      <Text style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, margin: "16px 0 8px 0" }}>
        Store Leaderboard
      </Text>
      {storeLeaderboard.map((s, i) => (
        <Text key={i} style={{ ...mono, fontSize: 12, color: COLORS.text, margin: "4px 0" }}>
          {i + 1}. {s.name} — <span style={{ color: COLORS.accent }}>{s.count}</span>
        </Text>
      ))}

      {trendingCategories.length > 0 && (
        <>
          <Hr style={{ borderColor: COLORS.border, margin: "16px 0" }} />
          <Text style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>
            Trending categories: {trendingCategories.join(" · ")}
          </Text>
        </>
      )}
    </Shell>
  );
}

WeeklySummary.PreviewProps = {
  weekLabel: "Mar 30 – Apr 5, 2026",
  totalDeals: 812,
  avgDiscount: 79,
  bestDeal: null,
  storeLeaderboard: [
    { name: "Home Depot Polaris", count: 68 },
    { name: "Walmart Dublin", count: 55 },
    { name: "Best Buy Easton", count: 41 },
  ],
  trendingCategories: ["Power Tools", "Small Appliances", "Outdoor"],
} satisfies WeeklySummaryProps;
