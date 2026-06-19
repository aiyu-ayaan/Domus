// PageHeader shared component for UI consistency
import React from 'react';

interface PageHeaderProps {
    title: string;
    description?: string;
    children?: React.ReactNode; // For action buttons
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border/50 mb-6">
            <div>
                <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">{title}</h1>
                {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
            </div>
            {children && <div className="flex items-center gap-3 flex-shrink-0">{children}</div>}
        </div>
    );
}
