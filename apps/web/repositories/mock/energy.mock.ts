// Mock Energy Repository — synthesizes a believable usage summary for demos.
import type { IEnergyRepository } from "../types";
import type { EnergySummary, EnergyPoint } from "@/types/api";

export class MockEnergyRepository implements IEnergyRepository {
  public async summary(params: {
    home_id: string;
    hours?: number;
  }): Promise<EnergySummary> {
    const hours = params.hours ?? 24;
    const bucketSeconds = hours <= 48 ? 3600 : 86400;
    const buckets = Math.max(1, Math.round((hours * 3600) / bucketSeconds));
    const now = Date.now();

    const series: EnergyPoint[] = Array.from({ length: buckets }, (_, i) => {
      const t = new Date(now - (buckets - 1 - i) * bucketSeconds * 1000);
      // Daily-ish load curve: low at night, peaks morning/evening.
      const hourOfDay = t.getHours();
      const shape = 0.4 + 0.6 * Math.abs(Math.sin((hourOfDay / 24) * Math.PI * 2));
      const kwh = +(shape * (bucketSeconds / 3600) * 0.22).toFixed(4);
      return { t: t.toISOString(), kwh };
    });

    const totalKwh = +series.reduce((a, p) => a + p.kwh, 0).toFixed(4);
    return {
      range_hours: hours,
      total_power_w: 218.4,
      total_kwh: totalKwh,
      devices: [
        {
          device_id: "mock-plug-1",
          name: "TP-Link Tapo Plug",
          model: "Tapo P110",
          power_w: 218.4,
          energy_kwh: +(totalKwh * 0.7).toFixed(4),
        },
        {
          device_id: "mock-plug-2",
          name: "Living Room TV",
          model: "Tapo P110",
          power_w: 0,
          energy_kwh: +(totalKwh * 0.3).toFixed(4),
        },
      ],
      series,
    };
  }
}
