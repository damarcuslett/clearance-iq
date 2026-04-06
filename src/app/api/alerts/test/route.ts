import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/push";
import { sendHighDiscountEmail } from "@/lib/email";

const EMAIL_TO = process.env.EMAIL_TO ?? "";

const TEST_DEAL = {
  productName: "ClearanceIQ Test Product",
  brand: "Test",
  imageUrl: null,
  upc: "000000000000",
  sku: null,
  currentPrice: 9.99,
  originalPrice: 99.99,
  discountPct: 90,
  storeName: "Test Store",
  storeCity: "Columbus",
  aisle: "A1",
  bay: "B1",
  quantity: 1,
  foundAt: new Date().toISOString(),
};

export async function POST(): Promise<Response> {
  const results: Record<string, string> = {};

  // Push test
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { isActive: true } });
    if (subs.length === 0) {
      results.push = "no active subscriptions";
    } else {
      const pushResults = await Promise.allSettled(
        subs.map((s) =>
          sendPushNotification(s, {
            title: "✅ ClearanceIQ Test Push",
            body: "If you see this, push notifications are working.",
            tag: "test",
            url: "/settings",
          })
        )
      );
      const ok = pushResults.filter(
        (r) => r.status === "fulfilled" && r.value.ok
      ).length;
      results.push = `${ok}/${subs.length} delivered`;
    }
  } catch (err) {
    results.push = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Email test
  try {
    if (!EMAIL_TO) {
      results.email = "EMAIL_TO not configured";
    } else {
      await sendHighDiscountEmail(EMAIL_TO, TEST_DEAL);
      results.email = `sent to ${EMAIL_TO}`;
    }
  } catch (err) {
    results.email = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return Response.json(results);
}
