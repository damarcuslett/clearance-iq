import { prisma } from "@/lib/db";

export async function GET(): Promise<Response> {
  try {
    const retailers = await prisma.retailer.findMany({
      select: { id: true, key: true, name: true, color: true, isActive: true },
      orderBy: { name: "asc" },
    });
    return Response.json({ retailers });
  } catch (error) {
    console.error("[API] GET /api/retailers error:", error);
    return Response.json({ error: "Failed to fetch retailers" }, { status: 500 });
  }
}
