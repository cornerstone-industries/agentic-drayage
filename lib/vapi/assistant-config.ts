// The calling assistant as one Vapi create-assistant body (POST /assistant, or PATCH /assistant/{id}
// to update). scripts/setup-vapi.ts sends it. The {{vars}} are LiquidJS template variables that
// createVapiCall() fills per call through assistantOverrides.variableValues:
// providerName, importerName, size, containerNumber, terminal, eta, lastFreeDay, destination, deliverBy.

export const SYSTEM_PROMPT = `You are PortCall, an AI assistant for {{importerName}}. You are on a live phone call that is already connected; the person you are talking to IS the dispatcher at {{providerName}}. Never ask for a phone number and never act as if you are about to call.

The load: one {{size}} at {{terminal}}, Port of Charleston, available {{eta}}, last free day {{lastFreeDay}}, delivering to {{destination}} by {{deliverBy}}.

Sound like a friendly, experienced import coordinator who calls carriers every day: relaxed, warm, short, plain words, contractions. Talk like a person on the phone, not a form.

Your opening line already asked for their rate and told them it's available {{eta}} and due by {{deliverBy}}. Then you need only:
1. Whether that rate is all in: fuel, chassis and any extras (pre-pull, storage, wait time). Ask it once: "Is that all in, with fuel, chassis and any extras?" If something is extra, get the amount.
2. When they can pull it, and whether that makes the deliver-by date (your opening line already told them the dates). Ask it once: "When could you pull it, and does that make the deadline?"

Rules:
- Replies under 12 words. One question at a time. No filler words, no lists.
- Understand natural answers: "tomorrow", "Monday", "yep", "all in", "eight hundred flat" are complete answers. Never ask for something they already told you, and never ask the same question twice.
- If something you hear is not an answer to your question (side conversation, a fragment, noise), ignore it and wait or briefly repeat your question once.
- If they ask what you mean, rephrase in plain words: the price to truck the container from the port to the warehouse.
- When you have the rate, what's included, and the pickup day, close in ONE reply: a very short readback, then a warm goodbye: "I'll send it over by email. Thanks so much, have a great rest of your day. Bye now!" Example: "Perfect, eight hundred all in, pulling tomorrow. I'll send it over by email. Thanks so much, have a great rest of your day. Bye now!" After that, stay quiet and let them hang up.
- Never repeat the readback. Do not commit to booking.

If you reach voicemail or an automated menu, say "Sorry, wrong number. Bye now!" and nothing else.

Never say goodbye until you have the rate, what's included and the pickup day, and you are giving your closing line. If they keep talking after your goodbye, answer in a few words.`;

export const FIRST_MESSAGE =
  "Hi, this is PortCall, an AI assistant for {{importerName}}. Could you quote me a {{size}} from {{terminal}} to {{destination}}? It's available {{eta}} and has to be there by {{deliverBy}}.";

export type AssistantConfigArgs = {
  /** Public URL Vapi POSTs server messages to, e.g. https://app.example.com/api/vapi/webhook */
  webhookUrl: string;
  /** Sent on every webhook as the x-webhook-secret header; the route checks it against VAPI_WEBHOOK_SECRET. */
  webhookSecret: string;
};

export function buildAssistantConfig({ webhookUrl, webhookSecret }: AssistantConfigArgs) {
  return {
    name: "PortCall quote caller",
    // Claude Haiku: ~480ms per reply on the phone. GPT-4o-mini measured 494ms and looped on "tomorrow", so it went back.
    model: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      temperature: 0.3,
      maxTokens: 120,
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
    },
    // Cartesia Sonic is the lowest-latency voice in Vapi; "Iris", a warm conversational American voice.
    voice: { provider: "cartesia", model: "sonic-3", voiceId: "c894559e-d529-4d70-a6fb-3330ecf7ef6b", generationConfig: { speed: 1.1 } },
    transcriber: { provider: "deepgram", model: "nova-3", language: "en" },
    // Turn latency on the first live call averaged 3.3s, mostly waiting to decide the dispatcher had
    // finished. These cut the default 1.5s no-punctuation wait while giving spoken numbers a beat.
    startSpeakingPlan: {
      waitSeconds: 0.1,
      transcriptionEndpointingPlan: { onPunctuationSeconds: 0.1, onNoPunctuationSeconds: 0.6, onNumberSeconds: 0.4 },
    },
    // Venue noise cut her off mid-sentence (even mid-goodbye at numWords 2); she yields only to 4+ words of real speech.
    // (Smart denoising was tried and doubled transcriber latency to ~1.2s, so the prompt handles stray fragments instead.)
    stopSpeakingPlan: { numWords: 4, voiceSeconds: 0.5, backoffSeconds: 0.8 },
    firstMessage: FIRST_MESSAGE,
    firstMessageMode: "assistant-speaks-first",
    // She never hangs up herself (a spoken end phrase clipped the goodbye on the phone): she says goodbye and the
    // dispatcher hangs up, or Vapi ends the call after 30s of silence (answers have registered 10-13s late in a noisy room).
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 180,
    backgroundSound: "off",
    // `transcript` is not in Vapi's default serverMessages and this list replaces the default, so name every type the webhook handles.
    serverMessages: ["status-update", "speech-update", 'transcript[transcriptType="final"]', "end-of-call-report"],
    server: { url: webhookUrl, headers: { "x-webhook-secret": webhookSecret }, timeoutSeconds: 20 },
  };
}
