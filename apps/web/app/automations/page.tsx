// Automations page implementation with IF-THEN visual rules builder
"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useHomeStore } from "@/stores/home-store";
import { useDeviceStore } from "@/stores/device-store";
import { useAutomationStore } from "@/stores/automation-store";
import { PageHeader } from "@/components/shared/page-header";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Zap,
  Plus,
  Trash2,
  Sliders,
  Play,
  Cpu,
  Sparkles,
  Bell,
  Clock,
  AlertCircle,
  Pencil,
} from "lucide-react";
import type { TriggerType, ActionType, ConditionOp } from "@/types/api";

const automationSchema = z.object({
  name: z.string().min(2, "Automation name must be at least 2 characters"),
  enabled: z.boolean(),
  trigger: z.object({
    type: z.enum([
      "device_state",
      "device_offline",
      "new_device",
      "time",
      "manual",
    ] as const),
    device_id: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    at: z.string().nullable().optional(),
  }),
  conditions: z
    .array(
      z.object({
        field: z.string().min(1, "Field name required"),
        op: z.enum(["eq", "ne", "gt", "lt", "gte", "lte", "in"] as const),
        value: z.string().min(1, "Target check value required"),
      }),
    )
    .optional(),
  actions: z
    .array(
      z.object({
        type: z.enum([
          "device.turn_on",
          "device.turn_off",
          "device.toggle",
          "notification.send",
        ] as const),
        device_id: z.string().optional(),
        title: z.string().optional(),
        body: z.string().optional(),
      }),
    )
    .min(1, "Automation requires at least one action"),
});

type AutomationFormValues = z.infer<typeof automationSchema>;

export default function AutomationsPage() {
  const shouldReduceMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04,
      },
    },
  };

  const itemVariants = {
    hidden: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: 8, filter: "blur(4px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        type: "spring" as const,
        duration: 0.35,
        bounce: 0,
      },
    },
  };

  const { activeHomeId } = useHomeStore();
  const { devices } = useDeviceStore();
  const {
    automations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    triggerAutomation,
    toggleAutomation,
  } = useAutomationStore();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AutomationFormValues>({
    resolver: zodResolver(automationSchema),
    defaultValues: {
      name: "",
      enabled: true,
      trigger: { type: "device_state", device_id: "", state: "on", at: "" },
      conditions: [],
      actions: [{ type: "device.turn_on", device_id: "" }],
    },
  });

  const {
    fields: condFields,
    append: condAppend,
    remove: condRemove,
  } = useFieldArray({
    control,
    name: "conditions",
  });

  const {
    fields: actFields,
    append: actAppend,
    remove: actRemove,
  } = useFieldArray({
    control,
    name: "actions",
  });

  const watchTriggerType = watch("trigger.type");
  const watchActions = watch("actions");

  const handleEditClick = (auto: any) => {
    setEditingAutomationId(auto.id);
    reset({
      name: auto.name,
      enabled: auto.enabled,
      trigger: {
        type: auto.trigger.type,
        device_id: auto.trigger.device_id || "",
        state: auto.trigger.state || "on",
        at: auto.trigger.at || "",
      },
      conditions: (auto.conditions || []).map((c: any) => ({
        field: c.field,
        op: c.op,
        value: String(c.value),
      })),
      actions: (auto.actions || []).map((a: any) => ({
        type: a.type,
        device_id: a.device_id || "",
        title: a.title || "",
        body: a.body || "",
      })),
    });
    setIsCreateOpen(true);
  };

  const handleFormSubmit = async (data: AutomationFormValues) => {
    if (!activeHomeId) return;

    // Sanitize trigger fields based on selected trigger type
    const triggerPayload: any = { type: data.trigger.type };
    if (data.trigger.type === "device_state") {
      triggerPayload.device_id = data.trigger.device_id || null;
      triggerPayload.state = data.trigger.state || null;
    } else if (data.trigger.type === "device_offline") {
      triggerPayload.device_id = data.trigger.device_id || null;
    } else if (data.trigger.type === "time") {
      triggerPayload.at = data.trigger.at || null;
    }

    // Sanitize conditions
    const conditionsPayload = (data.conditions || []).map((c) => ({
      field: c.field,
      op: c.op as ConditionOp,
      value: isNaN(Number(c.value)) ? c.value : Number(c.value),
    }));

    try {
      if (editingAutomationId) {
        await updateAutomation(editingAutomationId, {
          name: data.name,
          enabled: data.enabled,
          trigger: triggerPayload,
          conditions: conditionsPayload,
          actions: data.actions as any,
        });
        toast.success("Automation rule updated successfully!");
      } else {
        await createAutomation({
          home_id: activeHomeId,
          name: data.name,
          enabled: data.enabled,
          trigger: triggerPayload,
          conditions: conditionsPayload,
          actions: data.actions as any,
        });
        toast.success("Automation rule created successfully!");
      }
      setIsCreateOpen(false);
      setEditingAutomationId(null);
      reset();
    } catch (err: any) {
      toast.error(err?.error?.message || `Failed to ${editingAutomationId ? "update" : "create"} automation`);
    }
  };

  const handleToggleRule = async (id: string, currentStatus: boolean) => {
    try {
      await toggleAutomation(id, !currentStatus);
      toast.success(`Rule ${!currentStatus ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Could not toggle rule status.");
    }
  };

  const handleTriggerManually = async (id: string, name: string) => {
    try {
      const res = await triggerAutomation(id, { lux: 5, state: "on" }); // seed dummy evaluation context
      if (res.executed) {
        toast.success(`Automation executed successfully!`, {
          description: `Fired all actions for "${name}".`,
        });
      } else {
        toast.warning(`Automation conditions did not match`, {
          description: `Fired matching triggers but logic conditions blocked action runs.`,
        });
      }
    } catch (err: any) {
      toast.error(`Automation failed during execution`, {
        description: err?.message || "Check hardware bindings.",
      });
    }
  };

  const handleDeleteClick = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the rule "${name}"?`)) {
      try {
        await deleteAutomation(id);
        toast.success(`Removed rule "${name}"`);
      } catch (err: any) {
        toast.error(err?.error?.message || "Failed to delete automation");
      }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automations"
        description="Visual builder for smart local-first event triggers."
      >
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setEditingAutomationId(null);
        }}>
          <DialogTrigger asChild>
            <button
              onClick={() => {
                setEditingAutomationId(null);
                reset({
                  name: "",
                  enabled: true,
                  trigger: { type: "device_state", device_id: "", state: "on", at: "" },
                  conditions: [],
                  actions: [{ type: "device.turn_on", device_id: "" }],
                });
              }}
              className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground px-4 py-2.5 text-xs font-semibold transition cursor-pointer shadow-lg shadow-primary/20"
            >
              <Plus className="h-4 w-4" />
              <span>Create Rule</span>
            </button>
          </DialogTrigger>
          <DialogContent
            title={editingAutomationId ? "Edit Automation Rule" : "Visual Automation Builder"}
            description={editingAutomationId ? "Modify IF-THEN triggers and local actions." : "Configure IF-THEN triggers and local actions."}
          >
            <form
              onSubmit={handleSubmit(handleFormSubmit)}
              className="space-y-4 mt-2 max-h-[72vh] overflow-y-auto pr-1"
            >
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Automation Name
                </label>
                <input
                  type="text"
                  placeholder="Hallway motion sensor light on"
                  className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-xs text-rose-500 font-semibold">
                    {errors.name.message}
                  </p>
                )}
              </div>

              {/* TRIGGER CONFIG */}
              <div className="border border-border/60 bg-background/20 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  1. IF Event Trigger
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">
                      Trigger Type
                    </label>
                    <select
                      className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs outline-none focus:border-primary cursor-pointer"
                      {...register("trigger.type")}
                    >
                      <option value="device_state">Device State Change</option>
                      <option value="device_offline">
                        Device Goes Offline
                      </option>
                      <option value="time">Time Scheduler</option>
                      <option value="new_device">New Device Found</option>
                    </select>
                  </div>

                  {watchTriggerType === "device_state" && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">
                          Select Device
                        </label>
                        <select
                          className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs outline-none focus:border-primary cursor-pointer"
                          {...register("trigger.device_id")}
                        >
                          <option value="">Any Device</option>
                          {devices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">
                          Trigger State
                        </label>
                        <select
                          className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs outline-none focus:border-primary cursor-pointer"
                          {...register("trigger.state")}
                        >
                          <option value="on">Turned On</option>
                          <option value="off">Turned Off</option>
                          <option value="closed">Locked / Closed</option>
                          <option value="open">Unlocked / Opened</option>
                        </select>
                      </div>
                    </>
                  )}

                  {watchTriggerType === "device_offline" && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-muted-foreground">
                        Target Device
                      </label>
                      <select
                        className="w-full rounded-xl border border-border bg-background py-2 px-3 text-xs outline-none focus:border-primary cursor-pointer"
                        {...register("trigger.device_id")}
                      >
                        <option value="">Choose Accessory</option>
                        {devices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {watchTriggerType === "time" && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-muted-foreground">
                        Scheduled Time / Event
                      </label>
                      <input
                        type="text"
                        placeholder="23:00 or sunset"
                        className="w-full rounded-xl border border-border bg-background/50 py-2 px-3 text-xs outline-none focus:border-primary"
                        {...register("trigger.at")}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* CONDITIONS CONFIG */}
              <div className="border border-border/60 bg-background/20 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">
                    2. AND Conditions (Optional)
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      condAppend({ field: "lux", op: "lt", value: "10" })
                    }
                    className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    + Add Check
                  </button>
                </div>

                <div className="space-y-2">
                  {condFields.map((field, idx) => (
                    <div key={field.id} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="lux or temperature"
                        className="flex-1 rounded-xl border border-border bg-background/50 py-1.5 px-3.5 text-xs outline-none focus:border-primary"
                        {...register(`conditions.${idx}.field` as const)}
                      />
                      <select
                        className="w-20 rounded-xl border border-border bg-background py-1.5 px-2 text-xs outline-none focus:border-primary cursor-pointer"
                        {...register(`conditions.${idx}.op` as const)}
                      >
                        <option value="eq">==</option>
                        <option value="ne">!=</option>
                        <option value="lt">&lt;</option>
                        <option value="gt">&gt;</option>
                        <option value="lte">&lt;=</option>
                        <option value="gte">&gt;=</option>
                      </select>
                      <input
                        type="text"
                        placeholder="10"
                        className="w-20 rounded-xl border border-border bg-background/50 py-1.5 px-3.5 text-xs outline-none focus:border-primary"
                        {...register(`conditions.${idx}.value` as const)}
                      />
                      <button
                        type="button"
                        onClick={() => condRemove(idx)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ACTIONS CONFIG */}
              <div className="border border-border/60 bg-background/20 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">
                    3. THEN Actions (Chained)
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      actAppend({ type: "device.turn_on", device_id: "" })
                    }
                    className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    + Add Action
                  </button>
                </div>
                {errors.actions && (
                  <p className="text-xs text-rose-500 font-semibold">
                    {errors.actions.message}
                  </p>
                )}

                <div className="space-y-3">
                  {actFields.map((field, idx) => {
                    const type = watchActions[idx]?.type;
                    return (
                      <div
                        key={field.id}
                        className="flex gap-2 items-start border-b border-border/30 pb-3 last:border-b-0 last:pb-0"
                      >
                        <div className="grid grid-cols-2 gap-2 flex-1">
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-bold text-muted-foreground">
                              Action Type
                            </label>
                            <select
                              className="w-full rounded-xl border border-border bg-background py-1.5 px-2 text-xs outline-none focus:border-primary cursor-pointer"
                              {...register(`actions.${idx}.type` as const)}
                            >
                              <option value="device.turn_on">
                                Turn On Device
                              </option>
                              <option value="device.turn_off">
                                Turn Off Device
                              </option>
                              <option value="device.toggle">
                                Toggle Device
                              </option>
                              <option value="notification.send">
                                Send Toast Alert
                              </option>
                            </select>
                          </div>

                          {type && type.startsWith("device.") && (
                            <div className="space-y-1">
                              <label className="text-[9px] uppercase font-bold text-muted-foreground">
                                Target Accessory
                              </label>
                              <select
                                className="w-full rounded-xl border border-border bg-background py-1.5 px-2 text-xs outline-none focus:border-primary cursor-pointer"
                                {...register(
                                  `actions.${idx}.device_id` as const,
                                )}
                              >
                                <option value="">Select Device</option>
                                {devices.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {type === "notification.send" && (
                            <>
                              <div className="space-y-1">
                                <label className="text-[9px] uppercase font-bold text-muted-foreground">
                                  Title
                                </label>
                                <input
                                  type="text"
                                  placeholder="Motion Alert"
                                  className="w-full rounded-xl border border-border bg-background/50 py-1.5 px-3 text-xs outline-none focus:border-primary"
                                  {...register(`actions.${idx}.title` as const)}
                                />
                              </div>
                              <div className="space-y-1 col-span-2">
                                <label className="text-[9px] uppercase font-bold text-muted-foreground">
                                  Alert Body Message
                                </label>
                                <input
                                  type="text"
                                  placeholder="Hallway lights activated automatically."
                                  className="w-full rounded-xl border border-border bg-background/50 py-1.5 px-3 text-xs outline-none focus:border-primary"
                                  {...register(`actions.${idx}.body` as const)}
                                />
                              </div>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => actRemove(idx)}
                          disabled={actFields.length === 1}
                          className="p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-50 transition mt-6 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-2.5 mt-2 text-sm transition cursor-pointer"
              >
                {editingAutomationId ? "Save Changes" : "Save Rule"}
              </button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {automations.length === 0 ? (
        <EmptyState
          title="No Automations Defined"
          description="Orchestrate triggers like motion detector switches or sunset timers to control devices automatically."
          icon={Zap}
          actionLabel="Create Rule"
          onAction={() => setIsCreateOpen(true)}
        />
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 md:grid-cols-2"
        >
          {automations.map((auto) => {
            let triggerText = "IF ";
            if (auto.trigger.type === "device_state") {
              const devName =
                devices.find((d) => d.id === auto.trigger.device_id)?.name ||
                "Device";
              triggerText += `"${devName}" changes state to "${auto.trigger.state}"`;
            } else if (auto.trigger.type === "device_offline") {
              const devName =
                devices.find((d) => d.id === auto.trigger.device_id)?.name ||
                "Device";
              triggerText += `"${devName}" goes offline`;
            } else if (auto.trigger.type === "time") {
              triggerText += `clock hits ${auto.trigger.at}`;
            } else if (auto.trigger.type === "new_device") {
              triggerText += "new device registered by discovery scans";
            } else {
              triggerText += "triggered manually";
            }

            if (auto.conditions.length > 0) {
              triggerText += ` AND ${auto.conditions.map((c) => `${c.field} ${c.op} ${c.value}`).join(" AND ")}`;
            }

            return (
              <motion.div
                key={auto.id}
                variants={itemVariants}
                className={`rounded-3xl border p-5 backdrop-blur-sm flex flex-col justify-between transition hover:bg-card/30 ${
                  auto.enabled
                    ? "border-border/60 bg-card/25"
                    : "border-border/30 bg-card/5 opacity-60"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-xl border p-2.5 bg-background/80 ${auto.enabled ? "text-primary border-primary/20 shadow-sm animate-pulse-slow" : "text-muted-foreground border-border/80"}`}
                    >
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base leading-tight">
                        {auto.name}
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Runs {auto.actions.length}{" "}
                        {auto.actions.length === 1 ? "action" : "actions"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTriggerManually(auto.id, auto.name)}
                      className="rounded-lg p-1.5 border border-border bg-background/70 text-primary hover:bg-accent transition cursor-pointer"
                      title="Run automation now"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleEditClick(auto)}
                      className="rounded-lg p-1.5 border border-border bg-background/70 text-muted-foreground hover:text-foreground hover:bg-accent transition cursor-pointer"
                      title="Edit automation"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(auto.id, auto.name)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
                      title="Delete Rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-background/30 rounded-2xl border border-border/40 text-xs leading-relaxed text-muted-foreground font-medium">
                  {triggerText}
                </div>

                {auto.last_error && (
                  <div className="mt-2.5 p-2 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-[10px] font-semibold flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Last Run Error: {auto.last_error}</span>
                  </div>
                )}

                <div className="border-t border-border/40 pt-3 flex items-center justify-between text-xs text-muted-foreground mt-4">
                  <span className="text-[10px] text-muted-foreground/80">
                    {auto.last_triggered_at
                      ? `Last run: ${new Date(auto.last_triggered_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Never executed"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                      {auto.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <div className="scale-85">
                      <Switch
                        checked={auto.enabled}
                        onCheckedChange={() =>
                          handleToggleRule(auto.id, auto.enabled)
                        }
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
