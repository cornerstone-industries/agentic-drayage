"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import Vapi from "@vapi-ai/web";
import { Wordmark } from "@/components/console/wordmark";

type IncomingCall = {
  callId: string;
  containerNumber: string;
  importerName: string;
  variableValues: Record<string, string>;
};

type Phase = "waiting" | "ringing" | "connecting" | "on_call" | "ended";

const POLL_MS = 2_000;

// CALL_MODE=web stand-in for a carrier's phone: polls for a queued call, rings, and on Answer starts a
// Vapi web call with the same assistant a phone call uses. metadata.callId lets the webhook map it.
export function PhoneView({
  providerId,
  providerName,
  publicKey,
  assistantId,
}: {
  providerId: string;
  providerName: string;
  publicKey: string;
  assistantId: string;
}) {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<Vapi | null>(null);

  // Poll while idle; a new queued call starts ringing.
  useEffect(() => {
    if (phase !== "waiting") return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/phone/${providerId}`, { cache: "no-store" });
        const body = (await res.json()) as { call: IncomingCall | null };
        if (!stop && body.call) {
          setCall(body.call);
          setPhase("ringing");
          navigator.vibrate?.([400, 200, 400]);
        }
      } catch {
        // Network blips just wait for the next tick.
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [phase, providerId]);

  useEffect(() => () => void vapiRef.current?.stop(), []);

  const answer = useCallback(async () => {
    if (!call) return;
    if (!publicKey || !assistantId) {
      setError("Web calls are not configured: set NEXT_PUBLIC_VAPI_PUBLIC_KEY and VAPI_ASSISTANT_ID");
      return;
    }
    setError(null);
    setPhase("connecting");
    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;
    vapi.on("call-start", () => setPhase("on_call"));
    vapi.on("speech-start", () => setSpeaking(true));
    vapi.on("speech-end", () => setSpeaking(false));
    vapi.on("call-end", () => {
      setSpeaking(false);
      setPhase("ended");
    });
    vapi.on("error", (e: unknown) => {
      setError(e instanceof Error ? e.message : "The call dropped");
      setPhase("ended");
    });
    try {
      await vapi.start(assistantId, { variableValues: call.variableValues, metadata: { callId: call.callId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the call");
      setPhase("ended");
    }
  }, [assistantId, call, publicKey]);

  const decline = useCallback(async () => {
    if (!call) return;
    await fetch(`/api/phone/${providerId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "decline", callId: call.callId }),
    }).catch(() => null);
    setPhase("ended");
  }, [call, providerId]);

  const reset = () => {
    setCall(null);
    setError(null);
    setPhase("waiting");
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col px-4 pb-10 pt-5" data-testid="phone-page" data-phase={phase}>
      <div className="flex items-center justify-between">
        <Wordmark href="/" />
        <span className="font-mono text-[10.5px] text-muted">Carrier phone</span>
      </div>

      <section className="mt-8">
        <p className="font-mono text-[11px] text-muted">Dispatch line</p>
        <h1 className="stencil mt-2 text-[34px] leading-none text-fg">{providerName}</h1>
      </section>

      <section className="panel mt-6 flex flex-1 flex-col items-center justify-center rounded-[6px] p-6 text-center">
        {phase === "waiting" && (
          <>
            <motion.div
              className="h-3 w-3 rounded-full bg-sodium"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
            <p className="mt-4 text-[15px] text-fg">Waiting for calls</p>
            <p className="mt-1 font-mono text-[11.5px] text-muted">Keep this page open. It rings when PortCall calls.</p>
          </>
        )}

        {phase === "ringing" && call && (
          <>
            <motion.div
              className="font-mono text-[12px] text-sodium"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              Incoming call
            </motion.div>
            <p className="mt-3 text-[18px] text-fg">PortCall for {call.importerName}</p>
            <p className="mt-1 font-mono text-[12px] text-muted">Quote request, {call.containerNumber}</p>
            <div className="mt-8 grid w-full grid-cols-2 gap-3">
              <button type="button" className="rounded-[4px] border border-alarm/50 py-4 text-base text-alarm" onClick={decline} data-testid="phone-decline">
                Decline
              </button>
              <button type="button" className="btn-sodium w-full !py-4 !text-base" onClick={answer} data-testid="phone-answer">
                Answer
              </button>
            </div>
          </>
        )}

        {phase === "connecting" && <p className="text-[15px] text-fg">Connecting...</p>}

        {phase === "on_call" && (
          <>
            <p className="font-mono text-[12px] text-sodium">On the line with PortCall</p>
            <motion.div
              className="mt-6 h-16 w-16 rounded-full border-2 border-sodium"
              animate={speaking ? { scale: [1, 1.15, 1] } : { scale: 1 }}
              transition={{ duration: 0.6, repeat: speaking ? Infinity : 0 }}
            />
            <p className="mt-4 font-mono text-[11.5px] text-muted">{speaking ? "PortCall is speaking" : "Your turn: give your quote out loud"}</p>
            <button type="button" className="mt-8 w-full rounded-[4px] border border-alarm/50 py-4 text-base text-alarm" onClick={() => void vapiRef.current?.stop()}>
              Hang up
            </button>
          </>
        )}

        {phase === "ended" && (
          <>
            <p className="text-[15px] text-fg">Call ended</p>
            <button type="button" className="btn-sodium mt-6 w-full !py-3" onClick={reset}>
              Wait for the next call
            </button>
          </>
        )}

        {error && <p className="mt-4 rounded-[4px] border border-alarm/40 bg-alarm/10 p-3 text-sm text-alarm">{error}</p>}
      </section>

      <p className="mt-4 text-center font-mono text-[10.5px] text-muted">Web call mode: in production PortCall dials this carrier&apos;s phone.</p>
    </main>
  );
}
