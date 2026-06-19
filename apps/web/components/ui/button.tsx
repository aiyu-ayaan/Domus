import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'default' | 'ghost' | 'outline';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { className, variant = 'default', ...props },
    ref
) {
    const variants = {
        default: 'bg-cyan-500 text-white hover:bg-cyan-400',
        ghost: 'bg-transparent hover:bg-accent/70',
        outline: 'border border-border bg-transparent hover:bg-accent/70'
    };

    return (
        <button
            ref={ref}
            className={cn(
                'inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cyan-500/50',
                variants[variant],
                className
            )}
            {...props}
        />
    );
});
