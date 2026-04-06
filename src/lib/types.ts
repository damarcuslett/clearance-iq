export interface DealWithRelations {
  id: string;
  currentPrice: number;
  originalPrice: number;
  discountPct: number;
  dealType: string;
  inStock: boolean;
  quantity: number | null;
  aisle: string | null;
  bay: string | null;
  sourceUrl: string | null;
  aiScore: number | null;
  aiScoreReason: string | null;
  foundAt: string;
  lastVerifiedAt: string;
  expiresAt: string | null;
  isActive: boolean;
  product: {
    id: string;
    upc: string;
    sku: string | null;
    name: string;
    brand: string | null;
    category: string | null;
    imageUrl: string | null;
    msrp: number | null;
    description: string | null;
  };
  store: {
    name: string;
    city: string;
    zip: string;
    lat: number;
    lng: number;
  };
  retailer: {
    key: string;
    name: string;
    color: string;
  };
}

export interface DealsResponse {
  deals: DealWithRelations[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface StatsResponse {
  dealsFoundToday: number;
  pennyDeals: number;
  totalActiveDeals: number;
  avgDiscount: number;
  storesLive: number;
  alertsSent: number;
  lastSyncAt: string | null;
}

export interface SyncStatusItem {
  retailerId: string;
  retailerKey: string;
  retailerName: string;
  retailerColor: string;
  lastSyncedAt: string | null;
  latestSync: {
    id: string;
    startedAt: string;
    completedAt: string | null;
    itemsScanned: number;
    dealsFound: number;
    dealsBelow70: number;
    status: string;
    errorMessage: string | null;
  } | null;
}

export interface WatchlistItem {
  id: string;
  upc: string;
  productName: string;
  targetPrice: number | null;
  minDiscount: number;
  notifyEmail: boolean;
  notifyPush: boolean;
  notifyDiscord: boolean;
  lastAlertedAt: string | null;
  createdAt: string;
}
