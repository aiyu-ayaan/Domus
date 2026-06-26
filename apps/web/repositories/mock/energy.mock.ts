// Mock Energy Repository — synthesizes a believable usage summary for demos.
import type { IEnergyRepository } from "../types";
import type { EnergySummary, EnergyPoint, EnergyDeviceOut } from "@/types/api";
import { mockDb } from "@/mocks/mock-db";

export class MockEnergyRepository implements IEnergyRepository {
  public async summary(params: {
    home_id: string;
    hours?: number;
  }): Promise<EnergySummary> {
    const hours = params.hours ?? 24;
    const bucketSeconds = hours <= 48 ? 3600 : 86400;
    const buckets = Math.max(1, Math.round((hours * 3600) / bucketSeconds));
    const now = Date.now();

    // 1. Fetch registered devices for this home from the mock database
    const allDevices = mockDb.get("devices") || [];
    const homeDevices = allDevices.filter(
      (d) => d.home_id === params.home_id && d.device_type === "plug",
    );

    const states = mockDb.get("deviceStates") || {};

    let devicesOut: EnergyDeviceOut[] = [];
    let totalPower = 0;

    // 2. Generate consumption curve series based on current time
    const series: EnergyPoint[] = Array.from({ length: buckets }, (_, i) => {
      const t = new Date(now - (buckets - 1 - i) * bucketSeconds * 1000);
      // Daily load curve profile
      const hourOfDay = t.getHours();
      const shape = 0.4 + 0.6 * Math.abs(Math.sin((hourOfDay / 24) * Math.PI * 2));
      const kwh = +(shape * (bucketSeconds / 3600) * 0.22).toFixed(4);
      return { t: t.toISOString(), kwh };
    });

    const totalKwh = +series.reduce((a, p) => a + p.kwh, 0).toFixed(4);

    if (homeDevices.length > 0) {
      // Dynamic computation using actual registered plugs
      homeDevices.forEach((d) => {
        const state = states[d.id];
        const isOn = state ? state.state === "on" : false;
        const powerAttr =
          state?.attributes?.power_w ??
          state?.attributes?.current_consumption ??
          (isOn ? 150.0 : 0.0);
        const power = isOn ? Number(powerAttr) : 0.0;
        totalPower += power;

        devicesOut.push({
          device_id: d.id,
          name: d.name,
          model: d.model,
          power_w: power,
          energy_kwh: +(totalKwh * (power > 0 ? 0.7 : 0.1)).toFixed(4),
        });
      });
    } else {
      // Fallback to default mock plugs if none are registered yet, but calculate power live if states exist in mockDb
      const plug1State = states["mock-plug-1"];
      const plug2State = states["mock-plug-2"];

      const p1Power = plug1State
        ? plug1State.state === "on"
          ? (plug1State.attributes?.power_w ??
            plug1State.attributes?.current_consumption ??
            218.4)
          : 0.0
        : 218.4; // Default to on/218.4W if not instantiated yet

      const p2Power = plug2State
        ? plug2State.state === "on"
          ? (plug2State.attributes?.power_w ??
            plug2State.attributes?.current_consumption ??
            120.0)
          : 0.0
        : 0.0; // Default to off/0W

      totalPower = Number(p1Power) + Number(p2Power);

      devicesOut = [
        {
          device_id: "mock-plug-1",
          name: "TP-Link Tapo Plug",
          model: "Tapo P110",
          power_w: Number(p1Power),
          energy_kwh: +(totalKwh * 0.7).toFixed(4),
        },
        {
          device_id: "mock-plug-2",
          name: "Living Room TV",
          model: "Tapo P110",
          power_w: Number(p2Power),
          energy_kwh: +(totalKwh * 0.3).toFixed(4),
        },
      ];
    }

    return {
      range_hours: hours,
      total_power_w: +totalPower.toFixed(1),
      total_kwh: totalKwh,
      devices: devicesOut.sort((a, b) => b.energy_kwh - a.energy_kwh),
      series,
    };
  }
}
