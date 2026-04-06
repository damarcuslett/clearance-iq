"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { DealWithRelations } from "@/lib/types";
import { useMemo } from "react";
import { formatPrice } from "@/lib/format";

interface StoreGroup {
  key: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  deals: DealWithRelations[];
}

export default function DealMap({ deals }: { deals: DealWithRelations[] }) {
  const groups = useMemo<StoreGroup[]>(() => {
    const map = new Map<string, StoreGroup>();
    for (const d of deals) {
      const key = `${d.store.name}|${d.store.city}`;
      const existing = map.get(key);
      if (existing) {
        existing.deals.push(d);
      } else {
        map.set(key, {
          key,
          name: d.store.name,
          city: d.store.city,
          lat: d.store.lat,
          lng: d.store.lng,
          deals: [d],
        });
      }
    }
    return Array.from(map.values());
  }, [deals]);

  return (
    <MapContainer
      center={[40.0, -82.9]}
      zoom={7}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      {groups.map((g) => {
        const count = g.deals.length;
        const radius = Math.min(20, 6 + Math.sqrt(count) * 2);
        return (
          <CircleMarker
            key={g.key}
            center={[g.lat, g.lng]}
            radius={radius}
            pathOptions={{
              color: "#F97316",
              fillColor: "#F97316",
              fillOpacity: 0.5,
              weight: 2,
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-bold">{g.name}</div>
                <div className="text-xs opacity-70">{g.city}</div>
                <div className="mt-2 text-xs">
                  <strong>{count}</strong> active deal{count !== 1 ? "s" : ""}
                </div>
                <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto text-xs">
                  {g.deals.slice(0, 10).map((d) => (
                    <li key={d.id} className="flex justify-between gap-3">
                      <span className="truncate">{d.product.name}</span>
                      <span className="font-mono text-[#F97316]">
                        {formatPrice(d.currentPrice)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
