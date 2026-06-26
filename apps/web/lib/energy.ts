// Tariff model + cost calculation for the electricity page.
// Energy (kWh) comes from the API; the unit price is user-entered and lives here.
// Two tariff shapes: flat (one rate /unit) and tiered (slab rates /range), the
// standard residential billing models.

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
