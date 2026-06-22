// Scenes list — grid of saved multi-device scenes with activate / edit / delete.
"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useHomeStore } from "@/stores/home-store";
import { useDeviceStore } from "@/stores/device-store";
import { useSceneStore } from "@/stores/scene-store";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, Play } from "lucide-react";

export default function ScenesPage() {
  const shouldReduceMotion = useReducedMotion();
  const router = useRouter();
  const { activeHomeId } = useHomeStore();
  const { fetchDevices } = useDeviceStore();
  const { scenes, fetchScenes, deleteScene, activateScene } = useSceneStore();

  useEffect(() => {
    if (activeHomeId) fetchScenes(activeHomeId);
  }, [activeHomeId, fetchScenes]);

  const handleActivate = async (id: string, name: string) => {
    try {
      const res = await activateScene(id);
      toast.success(`Scene "${name}" applied`, {
        description: res
          ? `${res.applied} device(s) updated${res.failed ? `, ${res.failed} failed` : ""}.`
          : "Target states dispatched.",
      });
      if (activeHomeId) fetchDevices(activeHomeId);
    } catch {
      toast.error(`Failed to apply "${name}"`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete the scene "${name}"?`)) return;
    try {
      await deleteScene(id);
      toast.success(`Removed scene "${name}"`);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      toast.error(apiErr?.error?.message || "Failed to delete scene");
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } },
  };
  const itemVariants = {
    hidden: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: 8, filter: "blur(4px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { type: "spring" as const, duration: 0.35, bounce: 0 },
    },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scenes"
        description="Mix multiple devices into one tap — lights, switches and more."
      >
        <Link
          href="/scenes/detail?id=new"
          className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground px-4 py-2.5 text-xs font-semibold transition cursor-pointer shadow-lg shadow-primary/20"
        >
          <Plus className="h-4 w-4" />
          <span>New Scene</span>
        </Link>
      </PageHeader>

      {scenes.length === 0 ? (
        <EmptyState
          title="No Scenes Yet"
          description="Group device states into a scene to control lights and switches together with a single tap."
          icon={Sparkles}
          actionLabel="Build Scene"
          onAction={() => router.push("/scenes/detail?id=new")}
        />
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {scenes.map((scene) => (
            <motion.div
              key={scene.id}
              variants={itemVariants}
              className="rounded-3xl border border-border/60 bg-card/25 p-5 backdrop-blur-sm flex flex-col justify-between min-h-44 transition hover:bg-card/30"
            >
              <div className="flex justify-between items-start">
                <Link
                  href={`/scenes/detail?id=${scene.id}`}
                  className="flex items-center gap-3 group flex-1 min-w-0"
                >
                  <div className="rounded-xl border border-border/80 p-2.5 bg-background/80 text-primary flex-shrink-0">
                    <Sparkles className="h-5.5 w-5.5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base leading-tight truncate group-hover:text-primary transition">
                      {scene.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Controls {scene.states.length}{" "}
                      {scene.states.length === 1 ? "device" : "devices"}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() => handleDelete(scene.id, scene.name)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer flex-shrink-0"
                  title="Delete scene"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="border-t border-border/40 pt-3 flex items-center justify-between text-xs text-muted-foreground mt-4">
                <span className="truncate max-w-[150px]">
                  {scene.description || "No description"}
                </span>
                <button
                  onClick={() => handleActivate(scene.id, scene.name)}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Play className="h-3.5 w-3.5" />
                  Apply
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
