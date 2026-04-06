import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL ?? "";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

interface RetailerSeed {
  key: string;
  name: string;
  color: string;
  apiType: string;
}

interface StoreSeed {
  retailerKey: string;
  name: string;
  address: string;
  city: string;
  zip: string;
  lat: number;
  lng: number;
  storeNumber: string;
  phone?: string;
}

const retailers: RetailerSeed[] = [
  { key: "walmart", name: "Walmart", color: "#0071CE", apiType: "official_api" },
  { key: "homedepot", name: "Home Depot", color: "#F96302", apiType: "official_api" },
  { key: "target", name: "Target", color: "#CC0000", apiType: "scraper" },
  { key: "bestbuy", name: "Best Buy", color: "#0046BE", apiType: "official_api" },
  { key: "lowes", name: "Lowe's", color: "#004990", apiType: "scraper" },
  { key: "menards", name: "Menards", color: "#2E7D32", apiType: "scraper" },
];

const stores: StoreSeed[] = [
  // Walmart — Columbus area
  { retailerKey: "walmart", name: "Walmart Supercenter Dublin", address: "6300 Sawmill Rd, Dublin, OH 43017", city: "Dublin", zip: "43017", lat: 40.102, lng: -83.114, storeNumber: "2648", phone: "(614) 734-0454" },
  { retailerKey: "walmart", name: "Walmart Supercenter Reynoldsburg", address: "2780 Taylor Rd SW, Reynoldsburg, OH 43068", city: "Reynoldsburg", zip: "43068", lat: 39.962, lng: -82.803, storeNumber: "1393", phone: "(614) 866-4085" },
  { retailerKey: "walmart", name: "Walmart Supercenter Westerville", address: "895 S State St, Westerville, OH 43081", city: "Westerville", zip: "43081", lat: 40.116, lng: -82.929, storeNumber: "3784", phone: "(614) 882-7900" },
  { retailerKey: "walmart", name: "Walmart Supercenter Grove City", address: "3800 Jackpot Rd, Grove City, OH 43123", city: "Grove City", zip: "43123", lat: 39.867, lng: -83.062, storeNumber: "3463", phone: "(614) 277-7400" },
  // Walmart — Other Ohio cities
  { retailerKey: "walmart", name: "Walmart Supercenter Cleveland", address: "3400 Steelyard Dr, Cleveland, OH 44109", city: "Cleveland", zip: "44109", lat: 41.460, lng: -81.698, storeNumber: "5765" },
  { retailerKey: "walmart", name: "Walmart Supercenter Cincinnati", address: "4242 Eastgate Blvd, Cincinnati, OH 45245", city: "Cincinnati", zip: "45245", lat: 39.098, lng: -84.273, storeNumber: "1406" },

  // Home Depot — Columbus area
  { retailerKey: "homedepot", name: "Home Depot Polaris", address: "8855 Owenfield Dr, Powell, OH 43065", city: "Powell", zip: "43065", lat: 40.157, lng: -83.002, storeNumber: "3831", phone: "(614) 844-8500" },
  { retailerKey: "homedepot", name: "Home Depot Hilliard", address: "4191 Lyman Dr, Hilliard, OH 43026", city: "Hilliard", zip: "43026", lat: 40.034, lng: -83.158, storeNumber: "3844", phone: "(614) 876-6270" },
  // Home Depot — Other Ohio
  { retailerKey: "homedepot", name: "Home Depot Toledo", address: "4040 W Central Ave, Toledo, OH 43606", city: "Toledo", zip: "43606", lat: 41.672, lng: -83.624, storeNumber: "3864" },

  // Target — Columbus area
  { retailerKey: "target", name: "Target Easton", address: "3900 Morse Rd, Columbus, OH 43219", city: "Columbus", zip: "43219", lat: 40.053, lng: -82.905, storeNumber: "1288", phone: "(614) 476-8601" },
  { retailerKey: "target", name: "Target Polaris", address: "1500 Polaris Pkwy, Columbus, OH 43240", city: "Columbus", zip: "43240", lat: 40.152, lng: -82.979, storeNumber: "2788" },
  // Target — Other Ohio
  { retailerKey: "target", name: "Target Dayton", address: "2622 Miamisburg Centerville Rd, Dayton, OH 45459", city: "Dayton", zip: "45459", lat: 39.638, lng: -84.185, storeNumber: "1874" },

  // Best Buy — Columbus area
  { retailerKey: "bestbuy", name: "Best Buy Easton", address: "4152 Easton Gateway Dr, Columbus, OH 43219", city: "Columbus", zip: "43219", lat: 40.055, lng: -82.902, storeNumber: "499", phone: "(614) 476-1971" },
  { retailerKey: "bestbuy", name: "Best Buy Tuttle Crossing", address: "5000 Tuttle Crossing Blvd, Dublin, OH 43016", city: "Dublin", zip: "43016", lat: 40.040, lng: -83.058, storeNumber: "274" },
  // Best Buy — Other Ohio
  { retailerKey: "bestbuy", name: "Best Buy Akron", address: "3965 Medina Rd, Akron, OH 44333", city: "Akron", zip: "44333", lat: 41.120, lng: -81.638, storeNumber: "384" },

  // Lowe's — Columbus area
  { retailerKey: "lowes", name: "Lowe's Grove City", address: "3853 Jackpot Rd, Grove City, OH 43123", city: "Grove City", zip: "43123", lat: 39.866, lng: -83.064, storeNumber: "0302", phone: "(614) 539-8530" },
  { retailerKey: "lowes", name: "Lowe's Pickerington", address: "900 Refugee Rd, Pickerington, OH 43147", city: "Pickerington", zip: "43147", lat: 39.883, lng: -82.751, storeNumber: "2245" },
  // Lowe's — Other Ohio
  { retailerKey: "lowes", name: "Lowe's Cincinnati", address: "5110 Glencrossing Way, Cincinnati, OH 45238", city: "Cincinnati", zip: "45238", lat: 39.116, lng: -84.610, storeNumber: "1572" },

  // Menards — Columbus area
  { retailerKey: "menards", name: "Menards Columbus", address: "6201 E Broad St, Columbus, OH 43213", city: "Columbus", zip: "43213", lat: 39.959, lng: -82.858, storeNumber: "3276" },
  { retailerKey: "menards", name: "Menards Lancaster", address: "1390 N Memorial Dr, Lancaster, OH 43130", city: "Lancaster", zip: "43130", lat: 39.736, lng: -82.617, storeNumber: "3289" },
  // Menards — Other Ohio
  { retailerKey: "menards", name: "Menards Toledo", address: "1401 E Alexis Rd, Toledo, OH 43612", city: "Toledo", zip: "43612", lat: 41.703, lng: -83.527, storeNumber: "3251" },
];

async function main(): Promise<void> {
  console.log("Seeding database...\n");

  // Upsert retailers
  const retailerMap = new Map<string, string>();
  for (const r of retailers) {
    const retailer = await prisma.retailer.upsert({
      where: { key: r.key },
      update: { name: r.name, color: r.color, apiType: r.apiType },
      create: { key: r.key, name: r.name, color: r.color, apiType: r.apiType },
    });
    retailerMap.set(r.key, retailer.id);
    console.log(`  ✓ Retailer: ${retailer.name} (${retailer.id})`);
  }

  console.log("");

  // Upsert stores
  for (const s of stores) {
    const retailerId = retailerMap.get(s.retailerKey);
    if (!retailerId) {
      console.error(`  ✗ Unknown retailer key: ${s.retailerKey}`);
      continue;
    }

    const store = await prisma.store.upsert({
      where: {
        id: `seed_${s.retailerKey}_${s.storeNumber}`,
      },
      update: {
        name: s.name,
        address: s.address,
        city: s.city,
        zip: s.zip,
        lat: s.lat,
        lng: s.lng,
        phone: s.phone ?? null,
      },
      create: {
        id: `seed_${s.retailerKey}_${s.storeNumber}`,
        retailerId,
        name: s.name,
        address: s.address,
        city: s.city,
        zip: s.zip,
        lat: s.lat,
        lng: s.lng,
        storeNumber: s.storeNumber,
        phone: s.phone ?? null,
      },
    });
    console.log(`  ✓ Store: ${store.name} — ${store.city}, OH ${store.zip}`);
  }

  console.log(`\nSeeding complete! ${retailers.length} retailers, ${stores.length} stores.\n`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
