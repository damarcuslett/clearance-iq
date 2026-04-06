import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY ?? "";
const client = apiKey ? new Groq({ apiKey }) : null;

const MODEL = "llama-3.3-70b-versatile";

export interface DealForScoring {
  currentPrice: number;
  originalPrice: number;
  discountPct: number;
  dealType: string;
  inStock: boolean;
  quantity: number | null;
  product: {
    name: string;
    brand: string | null;
    category: string | null;
    msrp: number | null;
  };
}

export interface ScoreResult {
  score: number;
  reason: string;
}

function extractJSON<T>(raw: string): T {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in Groq response");
  return JSON.parse(match[0]) as T;
}

async function chat(prompt: string, maxTokens: number, temperature = 0.2): Promise<string> {
  if (!client) throw new Error("GROQ_API_KEY not configured");
  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    temperature,
  });
  return resp.choices[0]?.message?.content ?? "";
}

export async function scoreDeal(deal: DealForScoring): Promise<ScoreResult> {
  const prompt = `You are a retail deal expert. Score this deal 1-10.
Return ONLY valid JSON: {"score": X, "reason": "one sentence"}

Deal:
- Product: ${deal.product.name}
- Brand: ${deal.product.brand ?? "unknown"}
- Category: ${deal.product.category ?? "unknown"}
- Current Price: $${deal.currentPrice}
- Original Price: $${deal.originalPrice}
- Discount: ${deal.discountPct}%
- Deal Type: ${deal.dealType}
- In Stock: ${deal.inStock} (${deal.quantity ?? "?"} units)
- MSRP: $${deal.product.msrp ?? "unknown"}

Scoring criteria:
- 9-10: Penny deals, 90%+ off, known brands, multiple in stock
- 7-8: 80-89% off, good brand recognition, decent stock
- 5-6: 70-79% off, generic brand, or very limited stock
- Below 5: Should never appear (we filter at 70% minimum)

Be direct and specific in the reason.`;

  const raw = await chat(prompt, 100, 0.2);
  const parsed = extractJSON<ScoreResult>(raw);
  const score = Math.max(1, Math.min(10, Math.round(parsed.score)));
  return { score, reason: (parsed.reason ?? "").slice(0, 280) };
}

export interface ParsedSearchFilters {
  keywords: string[];
  maxPrice: number | null;
  minDiscount: number;
  category: string | null;
  city: string | null;
  retailers: string[] | null;
}

export async function parseSearchQuery(query: string): Promise<ParsedSearchFilters> {
  const prompt = `Parse this shopping query into JSON filters.
Return ONLY JSON: {
  "keywords": string[],
  "maxPrice": number | null,
  "minDiscount": number (default 70, NEVER below 70),
  "category": string | null,
  "city": string | null,
  "retailers": string[] | null
}
Valid retailer keys: walmart, homedepot, target, bestbuy, lowes, menards, amazon
Query: "${query.replace(/"/g, '\\"')}"`;

  const raw = await chat(prompt, 200, 0.1);
  const parsed = extractJSON<ParsedSearchFilters>(raw);
  return {
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    maxPrice: typeof parsed.maxPrice === "number" ? parsed.maxPrice : null,
    minDiscount: Math.max(70, Math.min(99, parsed.minDiscount ?? 70)),
    category: parsed.category ?? null,
    city: parsed.city ?? null,
    retailers: Array.isArray(parsed.retailers) ? parsed.retailers : null,
  };
}

export async function generateDailyInsight(
  topDeals: { name: string; discountPct: number; currentPrice: number; storeName: string; category: string | null }[]
): Promise<string> {
  const list = topDeals
    .slice(0, 20)
    .map(
      (d, i) =>
        `${i + 1}. ${d.name} — ${d.discountPct}% off ($${d.currentPrice.toFixed(2)}) @ ${d.storeName}${
          d.category ? ` [${d.category}]` : ""
        }`
    )
    .join("\n");

  const prompt = `In 2-3 sentences, what does today's deal landscape look like for an Ohio bargain hunter?
What categories are hot? What should they prioritize visiting today?
Be specific and direct. Mention actual products if notable.

Today's top deals:
${list}`;

  const raw = await chat(prompt, 220, 0.5);
  return raw.trim();
}
