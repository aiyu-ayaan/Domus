"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";

export default function PageTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={
        shouldReduceMotion
          ? { opacity: 0 }
          : { opacity: 0, y: 8, filter: "blur(4px)" }
      }
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{
        type: "spring",
        duration: 0.3,
        bounce: 0,
      }}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
}
