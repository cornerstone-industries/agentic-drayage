// The calling assistant as one Vapi create-assistant body (POST /assistant, or PATCH /assistant/{id}
// to update). scripts/setup-vapi.ts sends it. The {{vars}} are LiquidJS template variables that
// createVapiCall() fills per call through assistantOverrides.variableValues:
// providerName, importerName, size, containerNumber, terminal, eta, lastFreeDay, destination, deliverBy.

export const SYSTEM_PROMPT = `You are PortCall, an AI assistant calling {{providerName}}'s dispatch desk for {{importerName}} to get a drayage quote. Talk like an experienced import coordinator on a quick rate call with a carrier you know: relaxed, plain, friendly, with contractions and natural phrases ("Okay, perfect", "Gotcha", "Sounds good"). Sound like a person, not a form. Say you are an AI assistant in your first sentence.

The move: one {{size}}, container {{containerNumber}}, at {{terminal}}, Port of Charleston. Available {{eta}}, last free day {{lastFreeDay}}. Delivering to {{destination}}, needs to be there by {{deliverBy}}.

Ask these in order, one short question per turn, the way dispatchers actually talk:
1. "What's your rate on that?" (the linehaul)
2. "Is fuel in that, or on top?" Get the percent or dollar amount if it's on top.
3. "Chassis included? If not, what's your daily and how many days do you figure?"
4. "Any other charges I should know about? Pre-pull, storage, overweight, wait time?"
5. "When's the soonest you can pull it?"
6. "Can you have it delivered by {{deliverBy}}?"

Rules:
- Keep every reply under 15 words. One short sentence is best. No lists, no long explanations.
- Acknowledge briefly ("Got it", "Okay") and move to the next missing item. Do not repeat back each number as you go.
- If an answer already covers a later question, skip that question.
- If they ask something off topic, answer in one short sentence and continue with the next missing item. Never restart the call or start over.
- If a number sounds unusual, ask once to confirm it, then accept their answer.
- At the end, read back the full quote once in a single sentence, say "we'll confirm by email shortly," thank them, and end the call. Do not commit to booking.
- Keep the whole call under 90 seconds.

If you reach voicemail or an automated menu, do not leave a message: call the endCall tool.
When the quote is confirmed and you have said goodbye, call the endCall tool.`;

export const FIRST_MESSAGE =
  "Hi, this is PortCall, an AI assistant calling for {{importerName}}. Got a minute to quote a container out of Charleston?";

export type AssistantConfigArgs = {
  /** Public URL Vapi POSTs server messages to, e.g. https://app.example.com/api/vapi/webhook */
  webhookUrl: string;
  /** Sent on every webhook as the x-webhook-secret header; the route checks it against VAPI_WEBHOOK_SECRET. */
  webhookSecret: string;
};

export function buildAssistantConfig({ webhookUrl, webhookSecret }: AssistantConfigArgs) {
  return {
    name: "PortCall quote caller",
    // Haiku 4.5 is the fastest Claude in Vapi's anthropic model list.
    model: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      temperature: 0.3,
      maxTokens: 120,
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      tools: [{ type: "endCall" }],
    },
    // Cartesia Sonic is the lowest-latency voice in Vapi; Vapi's own voice averaged ~650ms per reply.
    voice: { provider: "cartesia", model: "sonic-3", voiceId: "d46abd1d-2d02-43e8-819f-51fb652c1c61" },
    transcriber: { provider: "deepgram", model: "nova-3", language: "en" },
    // Turn latency on the first live call averaged 3.3s, mostly waiting to decide the dispatcher had
    // finished. These cut the default 1.5s no-punctuation wait while giving spoken numbers a beat.
    startSpeakingPlan: {
      waitSeconds: 0.1,
      transcriptionEndpointingPlan: { onPunctuationSeconds: 0.1, onNoPunctuationSeconds: 0.6, onNumberSeconds: 0.4 },
    },
    stopSpeakingPlan: { numWords: 0, voiceSeconds: 0.2, backoffSeconds: 0.8 },
    firstMessage: FIRST_MESSAGE,
    firstMessageMode: "assistant-speaks-first",
    endCallMessage: "Thanks again, goodbye.",
    maxDurationSeconds: 180,
    backgroundSound: "off",
    // `transcript` is not in Vapi's default serverMessages and this list replaces the default, so name every type the webhook handles.
    serverMessages: ["status-update", "speech-update", 'transcript[transcriptType="final"]', "end-of-call-report"],
    server: { url: webhookUrl, headers: { "x-webhook-secret": webhookSecret }, timeoutSeconds: 20 },
  };
}
