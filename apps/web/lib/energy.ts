// Tariff model + cost calculation for the electricity page.
// Energy (kWh) comes from the API; the unit price is user-entered and lives here.
// Two tariff shapes: flat (one rate /unit) and tiered (slab rates /range), the
// standard residential billing models.

import type { BillingSettings } from "@/types/api";

export interface FlatTariff {
  type: "flat";
  currency: string;
  rate: number; // price per kWh
  fixedCharge: number; // fixed monthly charge added once
}

export interface Tier {
  upTo: number | null; // slab ceiling in kWh; null = unbounded top slab
  rate: number; // price per kWh within this slab
}

export interface TieredTariff {
  type: "tiered";
  currency: string;
  fixedCharge: number;
  tiers: Tier[];
}

export type Tariff = FlatTariff | TieredTariff;

export const DEFAULT_TARIFF: FlatTariff = {
  type: "flat",
  currency: "₹",
  rate: 8,
  fixedCharge: 0,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Cost of `kwh` units under `tariff`, in the tariff's currency. */
export function computeCost(kwh: number, tariff: Tariff): number {
  const fixed = tariff.fixedCharge || 0;
  if (tariff.type === "flat") {
    return round2(fixed + kwh * tariff.rate);
  }
  // Tiered: consume each slab's width at its rate, top slab is unbounded.
  let remaining = kwh;
  let prevCap = 0;
  let cost = fixed;
  for (const tier of tariff.tiers) {
    const width = tier.upTo === null ? Infinity : tier.upTo - prevCap;
    const used = Math.min(remaining, width);
    if (used <= 0) break;
    cost += used * tier.rate;
    remaining -= used;
    if (tier.upTo !== null) prevCap = tier.upTo;
    if (remaining <= 0) break;
  }
  return round2(cost);
}

/** Blended average price per kWh (handy for the per-device breakdown). */
export function effectiveRate(kwh: number, tariff: Tariff): number {
  if (kwh <= 0) return tariff.type === "flat" ? tariff.rate : tariff.tiers[0]?.rate || 0;
  return round2(computeCost(kwh, tariff) / kwh);
}

export function formatMoney(amount: number, currency: string): string {
  return `${currency}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// --- per-home persistence (localStorage) -------------------------------------
const key = (homeId: string) => `domus.tariff.${homeId}`;

export function loadTariff(homeId: string): Tariff {
  if (typeof window === "undefined") return DEFAULT_TARIFF;
  try {
    const raw = window.localStorage.getItem(key(homeId));
    if (raw) return JSON.parse(raw) as Tariff;
  } catch {
    /* fall through to default */
  }
  return DEFAULT_TARIFF;
}

export function saveTariff(homeId: string, tariff: Tariff): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(homeId), JSON.stringify(tariff));
}

export function getCurrentBillingCyclePeriod(startDay: number, now: Date = new Date()) {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  
  const getDateClamped = (year: number, month: number, day: number) => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const clampedDay = Math.min(day, lastDay);
    return new Date(year, month, clampedDay, 0, 0, 0, 0);
  };

  let cycleStart = getDateClamped(currentYear, currentMonth, startDay);
  let cycleEnd: Date;

  if (now >= cycleStart) {
    cycleEnd = getDateClamped(currentYear, currentMonth + 1, startDay);
  } else {
    cycleStart = getDateClamped(currentYear, currentMonth - 1, startDay);
    cycleEnd = getDateClamped(currentYear, currentMonth, startDay);
  }

  return {
    start: cycleStart,
    end: cycleEnd,
  };
}

export function loadBillingCycle(homeId: string): number {
  if (typeof window === "undefined") return 1;
  try {
    const val = window.localStorage.getItem(`domus.billing-cycle.${homeId}`);
    if (val) return parseInt(val) || 1;
  } catch {}
  return 1;
}

export function saveBillingCycle(homeId: string, day: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`domus.billing-cycle.${homeId}`, day.toString());
}

// --- server sync (home.billing_settings is the source of truth) --------------
// The API stores tariff settings per home (snake_case) so web + Android share one
// copy. We mirror it into the same localStorage keys the sync readers above use, so
// existing callers keep working while the data actually syncs through the server.

// Matches the API's HomeOut default (backend/homes/schemas.py BillingSettings).
export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  type: "flat",
  currency: "₹",
  rate: 8,
  fixed_charge: 0,
  tiers: [],
  billing_cycle_start_day: 1,
};

/** API billing settings -> the web Tariff shape (camelCase). */
export function tariffFromSettings(bs?: BillingSettings | null): Tariff {
  if (!bs) return DEFAULT_TARIFF;
  if (bs.type === "tiered") {
    return {
      type: "tiered",
      currency: bs.currency,
      fixedCharge: bs.fixed_charge,
      tiers: (bs.tiers ?? []).map((t) => ({ upTo: t.up_to, rate: t.rate })),
    };
  }
  return { type: "flat", currency: bs.currency, rate: bs.rate, fixedCharge: bs.fixed_charge };
}

/** Web Tariff + cycle day -> API billing settings (snake_case) for PATCH /homes. */
export function settingsFromTariff(tariff: Tariff, billingCycleStartDay: number): BillingSettings {
  const base = {
    currency: tariff.currency,
    fixed_charge: tariff.fixedCharge || 0,
    billing_cycle_start_day: billingCycleStartDay,
  };
  if (tariff.type === "tiered") {
    return {
      ...base,
      type: "tiered",
      rate: 0,
      tiers: tariff.tiers.map((t) => ({ up_to: t.upTo, rate: t.rate })),
    };
  }
  return { ...base, type: "flat", rate: tariff.rate, tiers: [] };
}

/** Mirror the server's settings into the localStorage cache the readers use. */
export function hydrateTariffCache(homeId: string, bs?: BillingSettings | null): void {
  if (typeof window === "undefined" || !bs) return;
  saveTariff(homeId, tariffFromSettings(bs));
  saveBillingCycle(homeId, bs.billing_cycle_start_day ?? 1);
}

