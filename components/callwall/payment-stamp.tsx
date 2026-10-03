"use client";

import { AnimatePresence } from "motion/react";
import { RubberStamp } from "@/components/freight/rubber-stamp";

/** AUTHORIZED in blue when Stripe holds the card, PAID in green when delivery captures it. */
export function PaymentStamp({ status }: { status: string | null }) {
  const stamp =
    status === "captured"
      ? { text: "Paid", color: "green" as const }
      : status === "authorized"
        ? { text: "Authorized", color: "blue" as const }
        : status === "canceled"
          ? { text: "Voided", color: "red" as const }
          : status === "failed"
            ? { text: "Declined", color: "red" as const }
            : null;
  return (
    <AnimatePresence mode="wait">
      {stamp && (
        <div key={stamp.text} data-testid="payment-stamp" data-status={status ?? ""}>
          <RubberStamp color={stamp.color} size="md" rotate={-7}>
            {stamp.text}
          </RubberStamp>
        </div>
      )}
    </AnimatePresence>
  );
}
