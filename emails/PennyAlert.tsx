import * as React from "react";
import { Section, Text } from "@react-email/components";
import { Shell, DealBlock, COLORS, type DealForEmail } from "./_shared";

export interface PennyAlertProps {
  deal: DealForEmail;
}

export default function PennyAlert({ deal }: PennyAlertProps) {
  return (
    <Shell preview={`🔴 PENNY DEAL — ${deal.productName} @ ${deal.storeName}`}>
      <Section style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 800, color: COLORS.penny, margin: "0 0 4px 0" }}>
          🔴 PENNY DEAL FOUND
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>
          Act fast — these disappear in minutes.
        </Text>
      </Section>
      <DealBlock deal={deal} />
      <Text style={{ fontSize: 10, color: COLORS.muted, textAlign: "center" as const, marginTop: 16 }}>
        Detected {new Date(deal.foundAt).toLocaleString("en-US", { timeZone: "America/New_York" })}
      </Text>
    </Shell>
  );
}

PennyAlert.PreviewProps = {
  deal: {
    productName: "AirPods Pro (2nd Gen)",
    brand: "Apple",
    imageUrl: null,
    upc: "194253397793",
    sku: "6447382",
    currentPrice: 0.01,
    originalPrice: 249.99,
    discountPct: 99,
    storeName: "Best Buy Easton",
    storeCity: "Columbus",
    aisle: "Aud A01",
    bay: null,
    quantity: 2,
    foundAt: new Date().toISOString(),
  },
} satisfies PennyAlertProps;
