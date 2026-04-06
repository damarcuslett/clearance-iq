import * as React from "react";
import { Section, Text } from "@react-email/components";
import { Shell, DealBlock, COLORS, type DealForEmail } from "./_shared";

export interface HighDiscountAlertProps {
  deal: DealForEmail;
}

export default function HighDiscountAlert({ deal }: HighDiscountAlertProps) {
  return (
    <Shell preview={`🔥 ${deal.discountPct}% OFF — ${deal.productName}`}>
      <Section style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 800, color: COLORS.accent, margin: "0 0 4px 0" }}>
          🔥 {deal.discountPct}% OFF
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>
          A new high-discount clearance find just hit the feed.
        </Text>
      </Section>
      <DealBlock deal={deal} />
    </Shell>
  );
}

HighDiscountAlert.PreviewProps = {
  deal: {
    productName: "RIDGID 18V Brushless Drill Kit",
    brand: "RIDGID",
    imageUrl: null,
    upc: "648846103921",
    sku: "311553420",
    currentPrice: 29.0,
    originalPrice: 229.0,
    discountPct: 87,
    storeName: "Home Depot Polaris",
    storeCity: "Columbus",
    aisle: "22",
    bay: "04",
    quantity: 6,
    foundAt: new Date().toISOString(),
  },
} satisfies HighDiscountAlertProps;
