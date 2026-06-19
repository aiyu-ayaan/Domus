// Mock Automation Repository implementation
import type { IAutomationRepository } from "../types";
import type {
  AutomationOut,
  AutomationCreate,
  AutomationUpdate,
  AutomationRunResult,
} from "@/types/api";
import { mockDb } from "@/mocks/mock-db";
import { MockDeviceRepository } from "./device.mock";
import { MockSceneRepository } from "./scene.mock";

export class MockAutomationRepository implements IAutomationRepository {
  private delay(ms: number = 100) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async list(homeId?: string): Promise<AutomationOut[]> {
    await this.delay();
    const automations = mockDb.get("automations");
    if (homeId) {
      return automations.filter((a) => a.home_id === homeId);
    }
    return automations;
  }

  public async get(id: string): Promise<AutomationOut> {
    await this.delay();
    const automations = mockDb.get("automations");
    const auto = automations.find((a) => a.id === id);
    if (!auto) {
      throw {
        error: {
          code: "not_found",
          message: "Automation not found",
          details: null,
        },
      };
    }
    return auto;
  }

  public async create(req: AutomationCreate): Promise<AutomationOut> {
    await this.delay(200);
    const automations = mockDb.get("automations");
    const newAuto: AutomationOut = {
      id: "auto-" + Math.random().toString(36).substr(2, 9),
      home_id: req.home_id,
      name: req.name,
      enabled: req.enabled !== undefined ? req.enabled : true,
      trigger: req.trigger,
      conditions: req.conditions || [],
      actions: req.actions,
      created_at: new Date().toISOString(),
    };
    mockDb.set("automations", [...automations, newAuto]);
    return newAuto;
  }

  public async update(
    id: string,
    req: AutomationUpdate,
  ): Promise<AutomationOut> {
    await this.delay(150);
    const automations = mockDb.get("automations");
    const idx = automations.findIndex((a) => a.id === id);
    if (idx === -1) {
      throw {
        error: {
          code: "not_found",
          message: "Automation not found",
          details: null,
        },
      };
    }
    const updated = {
      ...automations[idx],
      ...req,
    } as AutomationOut;
    const updatedList = [...automations];
    updatedList[idx] = updated;
    mockDb.set("automations", updatedList);
    return updated;
  }

  public async delete(id: string): Promise<void> {
    await this.delay(100);
    const automations = mockDb.get("automations");
    mockDb.set(
      "automations",
      automations.filter((a) => a.id !== id),
    );
  }

  public async trigger(
    id: string,
    context?: Record<string, any>,
  ): Promise<AutomationRunResult> {
    await this.delay(300);
    const auto = await this.get(id);

    let matched = true;

    // Evaluate conditions if context is provided
    if (context && auto.conditions && auto.conditions.length > 0) {
      for (const cond of auto.conditions) {
        const ctxVal = context[cond.field];
        if (ctxVal === undefined) {
          matched = false;
          break;
        }

        switch (cond.op) {
          case "eq":
            if (ctxVal !== cond.value) matched = false;
            break;
          case "ne":
            if (ctxVal === cond.value) matched = false;
            break;
          case "gt":
            if (ctxVal <= cond.value) matched = false;
            break;
          case "lt":
            if (ctxVal >= cond.value) matched = false;
            break;
          case "gte":
            if (ctxVal < cond.value) matched = false;
            break;
          case "lte":
            if (ctxVal > cond.value) matched = false;
            break;
          case "in":
            if (!Array.isArray(cond.value) || !cond.value.includes(ctxVal))
              matched = false;
            break;
          default:
            matched = false;
        }
        if (!matched) break;
      }
    }

    if (!matched) {
      return {
        automation_id: id,
        matched: false,
        executed: false,
        error: null,
      };
    }

    // Execute actions!
    try {
      const devRepo = new MockDeviceRepository();
      const sceneRepo = new MockSceneRepository();

      for (const action of auto.actions) {
        if (action.type === "device.turn_on" && action.device_id) {
          await devRepo.turnOn(action.device_id);
        } else if (action.type === "device.turn_off" && action.device_id) {
          await devRepo.turnOff(action.device_id);
        } else if (action.type === "device.toggle" && action.device_id) {
          await devRepo.toggle(action.device_id);
        } else if (action.type === "scene.activate" && action.scene_id) {
          await sceneRepo.activate(action.scene_id);
        } else if (action.type === "notification.send") {
          const notifications = mockDb.get("notifications");
          const newNotif = {
            id: "notif-" + Math.random().toString(36).substr(2, 9),
            home_id: auto.home_id,
            type: "info" as const,
            title: action.title || "Automation Triggered",
            body: action.body || `Automation "${auto.name}" ran successfully.`,
            read: false,
            meta: { automation_id: id },
            created_at: new Date().toISOString(),
          };
          mockDb.set("notifications", [newNotif, ...notifications]);

          // Broadcast WS notification event
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("domus_mock_ws_broadcast", {
                detail: {
                  type: "notification.created",
                  home_id: auto.home_id,
                  data: {
                    id: newNotif.id,
                    title: newNotif.title,
                    notification_type: newNotif.type,
                  },
                },
              }),
            );
          }
        }
      }

      // Update last triggered at
      const automations = mockDb.get("automations");
      const idx = automations.findIndex((a) => a.id === id);
      if (idx !== -1) {
        automations[idx].last_triggered_at = new Date().toISOString();
        automations[idx].last_error = null;
        mockDb.set("automations", automations);
      }

      return {
        automation_id: id,
        matched: true,
        executed: true,
        error: null,
      };
    } catch (err: any) {
      const automations = mockDb.get("automations");
      const idx = automations.findIndex((a) => a.id === id);
      const errMsg = err?.error?.message || err?.message || "Execution error";

      if (idx !== -1) {
        automations[idx].last_triggered_at = new Date().toISOString();
        automations[idx].last_error = errMsg;
        mockDb.set("automations", automations);
      }

      // Raise notification about failure
      const notifications = mockDb.get("notifications");
      const failNotif = {
        id: "notif-" + Math.random().toString(36).substr(2, 9),
        home_id: auto.home_id,
        type: "automation_failed" as const,
        title: "Automation Failed",
        body: `Automation "${auto.name}" failed: ${errMsg}`,
        read: false,
        meta: { automation_id: id, error: errMsg },
        created_at: new Date().toISOString(),
      };
      mockDb.set("notifications", [failNotif, ...notifications]);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("domus_mock_ws_broadcast", {
            detail: {
              type: "notification.created",
              home_id: auto.home_id,
              data: {
                id: failNotif.id,
                title: failNotif.title,
                notification_type: failNotif.type,
              },
            },
          }),
        );
      }

      return {
        automation_id: id,
        matched: true,
        executed: false,
        error: errMsg,
      };
    }
  }
}
