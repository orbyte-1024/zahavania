"use client";

import { motion } from "motion/react";

export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="screen-inner"
      initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.75, ease: [0.19, 1, 0.22, 1] }}
    >
      {children}
    </motion.div>
  );
}
