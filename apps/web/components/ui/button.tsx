import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = "default", ...props }, ref) {
    const variants = {
      default:
        "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[0.98] active:scale-[0.96] shadow-glow",
      ghost:
        "bg-transparent hover:bg-secondary text-foreground hover:scale-[0.98] active:scale-[0.96]",
      outline:
        "border border-border bg-transparent hover:bg-secondary text-foreground hover:scale-[0.98] active:scale-[0.96]",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition duration-200 focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
          variants[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
