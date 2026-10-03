// The calling assistant as one Vapi create-assistant body (POST /assistant, or PATCH /assistant/{id}
// to update). scripts/setup-vapi.ts sends it. The {{vars}} are LiquidJS template variables that
// createVapiCall() fills per call through assistantOverrides.variableValues:
// providerName, importerName, size, containerNumber, terminal, eta, lastFreeDay, destination, deliverBy.

export const SYSTEM_PROMPT = `You are PortCall, an AI assistant calling {{providerName}} on behalf of {{importerName}} to get a drayage quote. Say you are an AI assistant in your first sentence.

Load: one {{size}} container, number {{containerNumber}}, discharging at {{terminal}}, Port of Charleston, ETA {{eta}}. Last free day is {{lastFreeDay}}. Deliver to {{destination}} by {{deliverBy}}.

Get, in a natural conversation:
1. Linehaul rate
2. Fuel surcharge (percent or dollars)
3. Chassis cost per day and expected chassis days
4. Any other fees (pre-pull, storage, overweight, wait time)
5. Earliest pickup date
6. Whether they can deliver by {{deliverBy}}

Ask one thing at a time. Read the numbers back to confirm. Do not commit to booking; say "we'll confirm by email shortly." Be brief, friendly, and professional, like an experienced logistics coordinator. Keep the call under 90 seconds. Thank them and end the call.

If you reach voicemail or an automated menu, do not leave a message: call the endCall tool.
When the quote is confirmed and you have said goodbye, call the endCall tool.`;

export const FIRST_MESSAGE =
  "Hi, this is PortCall, an AI assistant calling for {{importerName}}. Do you have a minute for a quick drayage quote?";

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
      maxTokens: 250,
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      tools: [{ type: "endCall" }],
    },
    voice: { provider: "vapi", voiceId: "Elliot" },
    transcriber: { provider: "deepgram", model: "nova-3", language: "en" },
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
