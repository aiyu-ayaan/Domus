// PageHeader shared component for UI consistency
import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode; // For action buttons
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between pb-5 border-b border-border/60 mb-6">
      <div>
        <h1 className="font-serif text-4xl sm:text-5xl font-medium tracking-tight text-foreground leading-none">
          {title}
        </h1>
        {description && (
          <p className="text-xs text-muted-foreground mt-2 font-mono tracking-wide uppercase">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3.5 flex-shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
