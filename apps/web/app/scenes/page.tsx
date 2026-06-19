// Scenes presets page implementation with Scene Builder form
"use client";

import React, { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useHomeStore } from "@/stores/home-store";
import { useDeviceStore } from "@/stores/device-store";
import { useSceneStore } from "@/stores/scene-store";
import { PageHeader } from "@/components/shared/page-header";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, Edit2, CheckCircle2 } from "lucide-react";

const sceneSchema = z.object({
  name: z.string().min(2, "Scene name must be at least 2 characters"),
  description: z.string().optional(),
  states: z
    .array(
      z.object({
        device_id: z.string().min(1, "Please select a device"),
        state: z.string().min(1, "Target state required"),
      }),
    )
    .min(1, "Scene requires at least one device state setting"),
});

type SceneFormValues = z.infer<typeof sceneSchema>;

export default function ScenesPage() {
  const { activeHomeId } = useHomeStore();
  const { devices, fetchDevices } = useDeviceStore();
  const { scenes, createScene, deleteScene, activateScene } = useSceneStore();

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SceneFormValues>({
    resolver: zodResolver(sceneSchema),
    defaultValues: {
      name: "",
      description: "",
      states: [{ device_id: "", state: "off" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "states",
  });

  const handleCreateSubmit = async (data: SceneFormValues) => {
    if (!activeHomeId) return;
    try {
      await createScene({
        home_id: activeHomeId,
        name: data.name,
        description: data.description || null,
        states: data.states.map((s) => ({
          device_id: s.device_id,
          state: s.state,
          attributes: {}, // simplify attributes for mock builder
        })),
      });
      toast.success("Scene configured successfully!");
      setIsCreateOpen(false);
      reset();
    } catch (err: any) {
      toast.error(err?.error?.message || "Failed to configure scene");
    }
  };

  const handleActivateClick = async (id: string, name: string) => {
    try {
      await activateScene(id);
      toast.success(`Scene "${name}" activated!`, {
        description: "Target states dispatched successfully.",
      });
      if (activeHomeId) {
        fetchDevices(activeHomeId); // Refresh device cards state
      }
    } catch {
      toast.error(`Failed to activate scene "${name}"`);
    }
  };

  const handleDeleteClick = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the scene "${name}"?`)) {
      try {
        await deleteScene(id);
        toast.success(`Removed scene "${name}"`);
      } catch (err: any) {
        toast.error(err?.error?.message || "Failed to delete scene");
      }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scenes"
        description="Orchestrate multiple device states to apply together."
      >
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <button
              onClick={() =>
                reset({
                  name: "",
                  description: "",
                  states: [{ device_id: "", state: "off" }],
                })
              }
              className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground px-4 py-2.5 text-xs font-semibold transition cursor-pointer shadow-lg shadow-primary/20"
            >
              <Plus className="h-4 w-4" />
              <span>Create Scene</span>
            </button>
          </DialogTrigger>
          <DialogContent
            title="Visual Scene Builder"
            description="Save target states for multiple accessories."
          >
            <form
              onSubmit={handleSubmit(handleCreateSubmit)}
              className="space-y-4 mt-2 max-h-[70vh] overflow-y-auto pr-1"
            >
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Scene Name
                </label>
                <input
                  type="text"
                  placeholder="Movie Night"
                  className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-xs text-rose-500 font-semibold">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Dims hallway lights & closes garage"
                  className="w-full rounded-xl border border-border bg-background/50 py-2.5 px-3.5 text-sm outline-none focus:border-primary"
                  {...register("description")}
                />
              </div>

              {/* Device States Field Array */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Target Device States
                  </label>
                  <button
                    type="button"
                    onClick={() => append({ device_id: "", state: "off" })}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    + Add Device
                  </button>
                </div>
                {errors.states && (
                  <p className="text-xs text-rose-500 font-semibold">
                    {errors.states.root?.message || errors.states.message}
                  </p>
                )}

                <div className="space-y-2">
                  {fields.map((field, idx) => (
                    <div key={field.id} className="flex gap-2 items-center">
                      {/* Select Device */}
                      <select
                        className="flex-1 rounded-xl border border-border bg-background py-2 px-3 text-xs outline-none focus:border-primary cursor-pointer"
                        {...register(`states.${idx}.device_id` as const)}
                      >
                        <option value="">Select Accessory</option>
                        {devices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.device_type})
                          </option>
                        ))}
                      </select>

                      {/* Select State */}
                      <select
                        className="w-28 rounded-xl border border-border bg-background py-2 px-3 text-xs outline-none focus:border-primary cursor-pointer"
                        {...register(`states.${idx}.state` as const)}
                      >
                        <option value="on">Turn On</option>
                        <option value="off">Turn Off</option>
                        <option value="closed">Lock/Close</option>
                        <option value="open">Unlock/Open</option>
                        <option value="21.0">Temp 21°C</option>
                        <option value="18.0">Temp 18°C</option>
                      </select>

                      {/* Delete row */}
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        disabled={fields.length === 1}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-50 transition cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-2.5 mt-4 text-sm transition cursor-pointer"
              >
                Save Scene Preset
              </button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {scenes.length === 0 ? (
        <EmptyState
          title="No Scenes Created"
          description="Group device states into scenes to activate them simultaneously with a single tap."
          icon={Sparkles}
          actionLabel="Build Scene"
          onAction={() => setIsCreateOpen(true)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scenes.map((scene) => (
            <div
              key={scene.id}
              className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm flex flex-col justify-between h-44 transition hover:bg-card/30"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-border/80 p-2.5 bg-background/80 text-primary">
                    <Sparkles className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base leading-tight">
                      {scene.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Controls {scene.states.length}{" "}
                      {scene.states.length === 1 ? "device" : "devices"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteClick(scene.id, scene.name)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
                  title="Delete Scene"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="border-t border-border/40 pt-3 flex items-center justify-between text-xs text-muted-foreground mt-4">
                <span className="text-xs truncate max-w-[150px]">
                  {scene.description || "No description"}
                </span>

                <button
                  onClick={() => handleActivateClick(scene.id, scene.name)}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
                >
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Activate Preset
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
