// Switch toggle component based on Radix Switch primitive
"use client";

import React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { motion, useReducedMotion } from "framer-motion";

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted"
      {...props}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          className="pointer-events-none block h-5 w-5 rounded-full bg-card border border-border/80 shadow-glow ring-0"
          animate={{ x: checked ? 20 : 0 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 500, damping: 30 }
          }
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}
export default Switch;
