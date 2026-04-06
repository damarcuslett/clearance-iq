import * as React from "react";
import { Section, Text } from "@react-email/components";
import { Shell, DealBlock, COLORS, mono, type DealForEmail } from "./_shared";

export interface WatchlistHitProps {
  deal: DealForEmail;
  targetPrice: number | null;
}

export default function WatchlistHit({ deal, targetPrice }: WatchlistHitProps) {
  return (
    <Shell preview={`✅ Watchlist hit — ${deal.productName}`}>
      <Section style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 800, color: COLORS.success, margin: "0 0 4px 0" }}>
          ✅ WATCHLIST HIT
        </Text>
        <Text style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>
          Your watched item dropped below target price.
        </Text>
      </Section>
      {targetPrice !== null && (
        <Section style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <Text style={{ ...mono, fontSize: 12, color: COLORS.muted, margin: 0 }}>
            Target ${targetPrice.toFixed(2)} → Found{" "}
            <span style={{ color: COLORS.accent, fontWeight: 700 }}>${deal.currentPrice.toFixed(2)}</span>
          </Text>
        </Section>
      )}
      <DealBlock deal={deal} />
    </Shell>
  );
}

WatchlistHit.PreviewProps = {
  targetPrice: 250.0,
  deal: {
    productName: "Dyson V15 Detect Cordless Vacuum",
    brand: "Dyson",
    imageUrl: null,
    upc: "885609019871",
    sku: null,
    currentPrice: 199.0,
    originalPrice: 749.0,
    discountPct: 73,
    storeName: "Amazon Warehouse",
    storeCity: "Columbus",
    aisle: null,
    bay: null,
    quantity: null,
    foundAt: new Date().toISOString(),
  },
} satisfies WatchlistHitProps;
