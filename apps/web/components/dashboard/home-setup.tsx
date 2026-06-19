"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Home, Plus, Loader2 } from "lucide-react";
import { useHomeStore } from "@/stores/home-store";

const homeSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  timezone: z.string().min(1, "Please select a timezone"),
});

type HomeFormValues = z.infer<typeof homeSchema>;

const timezones = [
  ["Europe/Berlin", "Europe/Berlin (GMT+1)"],
  ["Europe/Lisbon", "Europe/Lisbon (GMT+0)"],
  ["America/New_York", "America/New_York (EST)"],
  ["Asia/Tokyo", "Asia/Tokyo (JST)"],
  ["Asia/Kolkata", "Asia/Kolkata (IST)"],
] as const;

/**
 * First-run provisioning surface. Rendered on the home route when the
 * authenticated operator has no home workspaces yet — the only path that
 * leads here is having an empty `homes` list.
 */
export function HomeSetup() {
  const createHome = useHomeStore((s) => s.createHome);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<HomeFormValues>({
    resolver: zodResolver(homeSchema),
    defaultValues: { name: "", description: "", timezone: "Europe/Berlin" },
  });

  const onSubmit = async (data: HomeFormValues) => {
    try {
      await createHome({
        name: data.name,
        description: data.description || null,
        timezone: data.timezone,
      });
      toast.success("Home registered", {
        description: `${data.name} is now your active workspace.`,
      });
    } catch (err) {
      const message =
        (err as { error?: { message?: string } })?.error?.message ||
        "Failed to register home";
      toast.error(message);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center py-8">
      <div className="relative w-full max-w-xl overflow-hidden rounded-none border-2 border-border bg-card shadow-subtle">
        {/* Hazard top stripe */}
        <div className="h-1 w-full bg-[#E61919]" />

        {/* Scanline texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, hsl(var(--foreground)) 0px, hsl(var(--foreground)) 1px, transparent 1px, transparent 4px)",
          }}
        />

        <div className="relative p-6 sm:p-8">
          {/* Tactical header row */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Domus OS // Provisioning
            </p>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              REV 1.0
            </p>
          </div>

          <div className="mt-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-none border-2 border-[#E61919]/40 bg-[#E61919]/10 text-[#E61919]">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-mono text-2xl font-bold uppercase leading-none tracking-tight text-foreground sm:text-3xl">
                No Home Registered
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                Register your first home workspace to bring devices, rooms,
                scenes, and automations online. Everything routes through this
                unit.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
            <Field label="Home Name" error={errors.name?.message}>
              <input
                type="text"
                autoFocus
                placeholder="Main House"
                className="w-full rounded-none border-2 border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-[#E61919]"
                {...register("name")}
              />
            </Field>

            <Field label="Description" hint="Optional">
              <input
                type="text"
                placeholder="Primary residence"
                className="w-full rounded-none border-2 border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-[#E61919]"
                {...register("description")}
              />
            </Field>

            <Field label="Timezone" error={errors.timezone?.message}>
              <select
                className="w-full rounded-none border-2 border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-[#E61919]"
                {...register("timezone")}
              >
                {timezones.map(([value, labelText]) => (
                  <option key={value} value={value}>
                    {labelText}
                  </option>
                ))}
              </select>
            </Field>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-none bg-foreground px-4 font-mono text-xs font-bold uppercase tracking-wider text-background transition hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isSubmitting ? "Registering" : "Initialize Workspace"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {hint}
          </span>
        )}
      </span>
      {children}
      {error && (
        <span className="block font-mono text-[10px] font-semibold uppercase text-[#E61919]">
          {error}
        </span>
      )}
    </label>
  );
}
