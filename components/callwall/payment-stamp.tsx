"use client";

import { AnimatePresence, motion } from "motion/react";

/** AUTHORIZED, then PAID: inked onto the booking the moment Stripe's status changes. */
export function PaymentStamp({ status }: { status: string | null }) {
  const label = status === "captured" ? "PAID" : status === "authorized" ? "AUTHORIZED" : status === "canceled" ? "VOIDED" : status === "failed" ? "DECLINED" : null;
  const color = status === "captured" ? "var(--signal)" : status === "authorized" ? "var(--sodium)" : "var(--alarm)";
  return (
    <AnimatePresence mode="wait">
      {label && (
        <motion.div
          key={label}
          initial={{ scale: 2.4, rotate: -16, opacity: 0 }}
          animate={{ scale: 1, rotate: -7, opacity: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 420, damping: 18 }}
          className="inline-block select-none rounded-[4px] border-[3px] px-4 py-1.5 font-display text-2xl font-black tracking-[0.12em] font-wide"
          style={{ color, borderColor: color, textShadow: `0 0 18px ${color}`, boxShadow: `0 0 24px -6px ${color}, inset 0 0 12px -4px ${color}` }}
          data-testid="payment-stamp"
          data-status={status ?? ""}
        >
          {label}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
