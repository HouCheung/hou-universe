"use client";

import { useEffect, useState, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════
   useVisitorStats — robust UV/PV counting via localStorage

   Rules:
   - PV: increments on every page load (sessionStorage to avoid
     double-counting on React Strict Mode re-mounts)
   - UV: unique by city+country in last 24h,
     with local fallback when IP API is unreachable
   - Self-visits count normally
   - Data persists in localStorage permanently
   ═══════════════════════════════════════════════════════════ */

const STORAGE_LOCATIONS = "hou_visitor_locations";
const STORAGE_PV = "hou_pv_count";
const STORAGE_LOCAL_ID = "hou_local_visitor_id";
const SESSION_PV_FLAG = "hou_pv_counted";

interface VisitorLocation {
  lat: number;
  lng: number;
  city: string;
  country: string;
  timestamp: number;
}

/* ── Generate a stable local visitor ID for offline UV fallback ── */
function getLocalVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(STORAGE_LOCAL_ID);
    if (!id) {
      id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(STORAGE_LOCAL_ID, id);
    }
    return id;
  } catch {
    return "";
  }
}

/* ── Load stored location records ── */
function loadStoredLocations(): VisitorLocation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_LOCATIONS);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    // Prune records older than 30 days to keep storage small
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const fresh = (data as VisitorLocation[]).filter(
      (loc) => loc.timestamp > cutoff
    );
    if (fresh.length !== data.length) {
      try {
        localStorage.setItem(STORAGE_LOCATIONS, JSON.stringify(fresh.slice(-300)));
      } catch { /* ignore */ }
    }
    return fresh;
  } catch {
    return [];
  }
}

/* ── Get current PV ── */
function getPV(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(STORAGE_PV);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/* ── Increment PV (once per session via sessionStorage flag) ── */
function incrementPV(): number {
  if (typeof window === "undefined") return 0;
  try {
    // Use sessionStorage flag to prevent double-counting in Strict Mode
    if (sessionStorage.getItem(SESSION_PV_FLAG) === "1") {
      return getPV();
    }
    sessionStorage.setItem(SESSION_PV_FLAG, "1");

    const current = getPV();
    const next = current + 1;
    localStorage.setItem(STORAGE_PV, String(next));
    return next;
  } catch {
    return 0;
  }
}

/* ── Calculate UV from location list (24h window) ── */
function getUV(locations: VisitorLocation[]): number {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = locations.filter((l) => l.timestamp > cutoff);
  const unique = new Set<string>();
  for (const loc of recent) {
    const key = `${loc.city}|${loc.country}`;
    if (key !== "|" && key !== "Unknown|Unknown") {
      unique.add(key);
    }
  }
  // Also count local visitors (no IP API) as unique
  return unique.size;
}

export function useVisitorStats() {
  const [uvCount, setUvCount] = useState(0);
  const [pvCount, setPvCount] = useState(0);

  const updateCounts = useCallback(() => {
    const stored = loadStoredLocations();
    const pv = getPV();
    setUvCount(getUV(stored));
    setPvCount(pv);
  }, []);

  useEffect(() => {
    // Immediately load stored data
    updateCounts();

    // Increment PV (once per session)
    const pv = incrementPV();
    setPvCount(pv);

    // Try to fetch geolocation for UV tracking
    let cancelled = false;

    const fetchLocation = async () => {
      try {
        const resp = await fetch(
          "https://ip-api.com/json/?fields=status,lat,lon,city,country,query",
          { mode: "cors" }
        );
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (data.status !== "success" || cancelled) return;

        const newLoc: VisitorLocation = {
          lat: data.lat,
          lng: data.lon,
          city: data.city || "Unknown",
          country: data.country || "Unknown",
          timestamp: Date.now(),
        };

        const current = loadStoredLocations();
        const hasSameCity = current.some(
          (loc) =>
            loc.city === newLoc.city &&
            loc.country === newLoc.country
        );

        if (!hasSameCity) {
          const updated = [...current, newLoc];
          try {
            localStorage.setItem(STORAGE_LOCATIONS, JSON.stringify(updated.slice(-300)));
          } catch { /* ignore */ }
          if (!cancelled) setUvCount(getUV(updated));
        } else {
          // Update timestamp for existing location to keep it fresh
          const updated = current.map((loc) =>
            loc.city === newLoc.city && loc.country === newLoc.country
              ? { ...loc, timestamp: Date.now() }
              : loc
          );
          try {
            localStorage.setItem(STORAGE_LOCATIONS, JSON.stringify(updated.slice(-300)));
          } catch { /* ignore */ }
          if (!cancelled) setUvCount(getUV(updated));
        }
      } catch {
        // Network error — count local visitor as UV fallback
        if (!cancelled) {
          const localId = getLocalVisitorId();
          if (localId) {
            const current = loadStoredLocations();
            // Add a local marker if none exists
            const hasLocal = current.some((loc) => loc.city === localId);
            if (!hasLocal) {
              const localLoc: VisitorLocation = {
                lat: 0,
                lng: 0,
                city: localId,
                country: "local",
                timestamp: Date.now(),
              };
              const updated = [...current, localLoc];
              try {
                localStorage.setItem(STORAGE_LOCATIONS, JSON.stringify(updated.slice(-300)));
              } catch { /* ignore */ }
              if (!cancelled) setUvCount(getUV(updated));
            } else {
              // Refresh timestamp
              const updated = current.map((loc) =>
                loc.city === localId
                  ? { ...loc, timestamp: Date.now() }
                  : loc
              );
              try {
                localStorage.setItem(STORAGE_LOCATIONS, JSON.stringify(updated.slice(-300)));
              } catch { /* ignore */ }
              if (!cancelled) setUvCount(getUV(updated));
            }
          }
        }
      }
    };

    fetchLocation();

    return () => {
      cancelled = true;
    };
  }, [updateCounts]);

  return { uvCount, pvCount };
}
