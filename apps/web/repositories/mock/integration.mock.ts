// Mock Integration Repository implementation
import type { IIntegrationRepository } from "../types";
import type {
  IntegrationOut,
  IntegrationCreate,
  IntegrationUpdate,
  DiscoveryResult,
  DiscoveredDevice,
  DeviceOut,
} from "@/types/api";
import { mockDb } from "@/mocks/mock-db";

export class MockIntegrationRepository implements IIntegrationRepository {
  private delay(ms: number = 150) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async listAvailable(): Promise<string[]> {
    await this.delay(50);
    return [
      "tapo",
      "xiaomi",
      "tuya",
      "mqtt",
      "matter",
      "zigbee",
      "shelly",
      "sonoff",
    ];
  }

  public async list(homeId?: string): Promise<IntegrationOut[]> {
    await this.delay();
    const integrations = mockDb.get("integrations");
    if (homeId) {
      return integrations.filter((i) => i.home_id === homeId);
    }
    return integrations;
  }

  public async get(id: string): Promise<IntegrationOut> {
    await this.delay();
    const integrations = mockDb.get("integrations");
    const integration = integrations.find((i) => i.id === id);
    if (!integration) {
      throw {
        error: {
          code: "not_found",
          message: "Integration not found",
          details: null,
        },
      };
    }
    return integration;
  }

  public async create(req: IntegrationCreate): Promise<IntegrationOut> {
    await this.delay(200);
    const integrations = mockDb.get("integrations");
    const newIntegration: IntegrationOut = {
      id: "int-" + Math.random().toString(36).substr(2, 9),
      home_id: req.home_id,
      name: req.name,
      type: req.type,
      enabled: req.enabled !== undefined ? req.enabled : true,
      last_sync_at: null,
      created_at: new Date().toISOString(),
    };
    mockDb.set("integrations", [...integrations, newIntegration]);
    return newIntegration;
  }

  public async update(
    id: string,
    req: IntegrationUpdate,
  ): Promise<IntegrationOut> {
    await this.delay(100);
    const integrations = mockDb.get("integrations");
    const idx = integrations.findIndex((i) => i.id === id);
    if (idx === -1) {
      throw {
        error: {
          code: "not_found",
          message: "Integration not found",
          details: null,
        },
      };
    }
    const updated = {
      ...integrations[idx],
      ...req,
    } as IntegrationOut;
    const updatedList = [...integrations];
    updatedList[idx] = updated;
    mockDb.set("integrations", updatedList);
    return updated;
  }

  public async delete(id: string): Promise<void> {
    await this.delay(150);
    const integrations = mockDb.get("integrations");
    mockDb.set(
      "integrations",
      integrations.filter((i) => i.id !== id),
    );

    // Delete or orphan devices connected to this integration
    const devices = mockDb.get("devices");
    mockDb.set(
      "devices",
      devices.filter((d) => d.integration_id !== id),
    );
  }

  public async discover(id: string): Promise<DiscoveryResult> {
    await this.delay(2000); // Simulate network scan duration
    const integration = await this.get(id);

    // Predefined discovered devices candidates
    const candidates: Record<string, DiscoveredDevice[]> = {
      tapo: [
        {
          external_id: "tapo-l900-02",
          name: "TP-Link Tapo LED Strip Room 2",
          device_type: "light",
          manufacturer: "TP-Link",
          model: "Tapo L900-5",
          serial_number: "TAPO-L900-4491",
          attributes: { brightness: 100 },
          already_registered: false,
        },
        {
          external_id: "tapo-p110-02",
          name: "TP-Link Smart Plug Coffee Machine",
          device_type: "plug",
          manufacturer: "TP-Link",
          model: "Tapo P110",
          serial_number: "TAPO-P110-2394",
          attributes: { power: 0 },
          already_registered: false,
        },
      ],
      tuya: [
        {
          external_id: "tuya-bulb-02",
          name: "Tuya Ceiling Light Living Room",
          device_type: "light",
          manufacturer: "Tuya",
          model: "Bulb RGBW",
          serial_number: "TUYA-BULB-7741",
          attributes: { brightness: 80 },
          already_registered: false,
        },
      ],
      xiaomi: [
        {
          external_id: "xiaomi-temp-01",
          name: "Xiaomi Temperature Humidistat",
          device_type: "sensor",
          manufacturer: "Xiaomi",
          model: "Mijia Sensor",
          serial_number: "XIAO-TEMP-9922",
          attributes: { temperature: 22.4, humidity: 48 },
          already_registered: false,
        },
      ],
      zigbee: [
        {
          external_id: "zigbee-leak-01",
          name: "Zigbee Water Leak Sensor",
          device_type: "sensor",
          manufacturer: "Aqara",
          model: "Leak Sensor",
          serial_number: "AQ-LEAK-3829",
          attributes: { battery: 98, water_leak: false },
          already_registered: false,
        },
      ],
      matter: [
        {
          external_id: "matter-lock-02",
          name: "Matter Smart Lock Backdoor",
          device_type: "lock",
          manufacturer: "Schlage",
          model: "Encode Plus",
          serial_number: "SCH-LOCK-1188",
          attributes: { battery: 94, locked: true },
          already_registered: false,
        },
      ],
    };

    const discovered = candidates[integration.type] || [
      {
        external_id: `${integration.type}-device-01`,
        name: `${integration.name} Device 01`,
        device_type: "switch",
        manufacturer: "Generic",
        model: "Smart Switch",
        serial_number: "GEN-SW-0001",
        attributes: {},
        already_registered: false,
      },
    ];

    const devices = mockDb.get("devices");
    const newDevicesToRegister: DeviceOut[] = [];
    const resultDiscovered: DiscoveredDevice[] = [];

    discovered.forEach((item) => {
      const exists = devices.find(
        (d) =>
          d.home_id === integration.home_id &&
          d.external_id === item.external_id,
      );
      if (exists) {
        resultDiscovered.push({ ...item, already_registered: true });
      } else {
        resultDiscovered.push({ ...item, already_registered: false });
        // Register it in our devices database
        newDevicesToRegister.push({
          id: "dev-" + Math.random().toString(36).substr(2, 9),
          home_id: integration.home_id,
          integration_id: id,
          room_id: null, // initially unassigned
          external_id: item.external_id,
          name: item.name,
          manufacturer: item.manufacturer,
          model: item.model,
          serial_number: item.serial_number,
          device_type: item.device_type,
          online: true,
          last_seen: new Date().toISOString(),
          meta: {},
          created_at: new Date().toISOString(),
        });
      }
    });

    if (newDevicesToRegister.length > 0) {
      mockDb.set("devices", [...devices, ...newDevicesToRegister]);

      // Set states
      const states = mockDb.get("deviceStates");
      newDevicesToRegister.forEach((d) => {
        const defaultState =
          d.device_type === "thermostat"
            ? "21.0"
            : d.device_type === "lock"
              ? "closed"
              : "off";
        states[d.id] = {
          id: "state-" + Math.random().toString(36).substr(2, 9),
          device_id: d.id,
          state: defaultState,
          attributes: {},
          created_at: new Date().toISOString(),
        };
      });
      mockDb.set("deviceStates", states);
    }

    // Update integration sync timestamp
    const integrations = mockDb.get("integrations");
    const intIdx = integrations.findIndex((i) => i.id === id);
    if (intIdx !== -1) {
      integrations[intIdx].last_sync_at = new Date().toISOString();
      mockDb.set("integrations", integrations);
    }

    // Dispatch integration event to trigger WebSocket toast notification
    if (typeof window !== "undefined" && newDevicesToRegister.length > 0) {
      window.dispatchEvent(
        new CustomEvent("domus_mock_ws_broadcast", {
          detail: {
            type: "integration.new_device_found",
            home_id: integration.home_id,
            data: {
              name: newDevicesToRegister[0].name,
              external_id: newDevicesToRegister[0].external_id,
            },
          },
        }),
      );
    }

    return {
      integration_id: id,
      new_count: newDevicesToRegister.length,
      existing_count: resultDiscovered.length - newDevicesToRegister.length,
      discovered: resultDiscovered,
    };
  }
}
