// EmptyState component for empty list fallbacks
import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-dashed border-border/80 rounded-3xl bg-card/15 backdrop-blur-sm">
      <div className="rounded-2xl border border-border bg-background/50 p-4 text-muted-foreground/60 mb-4 shadow-sm animate-pulse-slow">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="font-semibold text-lg text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 py-2.5 text-sm transition cursor-pointer shadow-lg shadow-primary/25"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
