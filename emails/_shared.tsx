import * as React from "react";
import { Body, Container, Head, Html, Preview, Section, Text, Hr } from "@react-email/components";

export const COLORS = {
  bg: "#07070C",
  card: "#13131F",
  border: "#1E1E30",
  accent: "#F97316",
  penny: "#A855F7",
  text: "#F1F5F9",
  muted: "#64748B",
  success: "#22C55E",
};

export const mono: React.CSSProperties = {
  fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace",
};

export function Shell({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: COLORS.bg, color: COLORS.text, fontFamily: "system-ui, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
          <Section style={{ padding: "8px 0 16px 0" }}>
            <Text style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, margin: 0 }}>
              Clearance<span style={{ color: COLORS.accent }}>IQ</span>
            </Text>
            <Text style={{ fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 2, margin: "4px 0 0 0" }}>
              Ohio · 70%+ off only
            </Text>
          </Section>
          {children}
          <Hr style={{ borderColor: COLORS.border, margin: "24px 0" }} />
          <Text style={{ fontSize: 10, color: COLORS.muted, textAlign: "center" as const }}>
            You received this because alerts are enabled in ClearanceIQ.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export interface DealForEmail {
  productName: string;
  brand?: string | null;
  imageUrl?: string | null;
  upc?: string | null;
  sku?: string | null;
  currentPrice: number;
  originalPrice: number;
  discountPct: number;
  storeName: string;
  storeCity: string;
  storeAddress?: string | null;
  aisle?: string | null;
  bay?: string | null;
  quantity?: number | null;
  foundAt: string;
}

export function DealBlock({ deal }: { deal: DealForEmail }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${deal.storeName} ${deal.storeCity} OH`
  )}`;
  return (
    <Section style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
      {deal.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={deal.imageUrl} alt={deal.productName} style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 8, display: "block", margin: "0 auto 16px" }} />
      )}
      <Text style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, margin: "0 0 4px 0" }}>
        {deal.productName}
      </Text>
      {deal.brand && (
        <Text style={{ fontSize: 12, color: COLORS.muted, margin: "0 0 12px 0" }}>{deal.brand}</Text>
      )}
      <Text style={{ ...mono, fontSize: 32, fontWeight: 700, color: COLORS.accent, margin: "8px 0 0 0" }}>
        ${deal.currentPrice.toFixed(2)}
      </Text>
      <Text style={{ ...mono, fontSize: 12, color: COLORS.muted, textDecoration: "line-through", margin: "0 0 4px 0" }}>
        ${deal.originalPrice.toFixed(2)}
      </Text>
      <Text style={{ fontSize: 12, color: COLORS.success, margin: "0 0 16px 0" }}>
        {deal.discountPct}% off · save ${(deal.originalPrice - deal.currentPrice).toFixed(2)}
      </Text>
      <Hr style={{ borderColor: COLORS.border, margin: "12px 0" }} />
      <Text style={{ fontSize: 13, color: COLORS.text, margin: "4px 0" }}>
        <strong>{deal.storeName}</strong> · {deal.storeCity}
      </Text>
      {(deal.aisle || deal.bay) && (
        <Text style={{ ...mono, fontSize: 12, color: "#60A5FA", margin: "4px 0" }}>
          {deal.aisle && `Aisle ${deal.aisle}`}
          {deal.bay && ` · Bay ${deal.bay}`}
        </Text>
      )}
      {deal.quantity != null && (
        <Text style={{ fontSize: 12, color: COLORS.muted, margin: "4px 0" }}>
          {deal.quantity} in stock
        </Text>
      )}
      {(deal.upc || deal.sku) && (
        <Text style={{ ...mono, fontSize: 10, color: COLORS.muted, margin: "4px 0" }}>
          {deal.upc && `UPC ${deal.upc}`}
          {deal.sku && ` · SKU ${deal.sku}`}
        </Text>
      )}
      <a
        href={mapsUrl}
        style={{
          display: "inline-block",
          marginTop: 16,
          padding: "10px 18px",
          backgroundColor: COLORS.accent,
          color: "#000",
          textDecoration: "none",
          fontWeight: 700,
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        Get Directions →
      </a>
    </Section>
  );
}
