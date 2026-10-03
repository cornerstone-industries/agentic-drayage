// The calling assistant as one Vapi create-assistant body (POST /assistant, or PATCH /assistant/{id}
// to update). scripts/setup-vapi.ts sends it. The {{vars}} are LiquidJS template variables that
// createVapiCall() fills per call through assistantOverrides.variableValues:
// providerName, importerName, size, containerNumber, terminal, eta, lastFreeDay, destination, deliverBy.

export const SYSTEM_PROMPT = `You are PortCall, an AI assistant calling {{providerName}}'s dispatch desk for {{importerName}} to get a drayage quote. Talk like an experienced import coordinator on a quick rate call with a carrier you know: relaxed, plain, friendly, with contractions. Sound like a person, not a form. Say you are an AI assistant in your first sentence.

You are ON a live phone call right now. The call is already connected: the person you are talking to IS the dispatcher at {{providerName}}. Never ask for a phone number, never say you are about to call or are ready to call, and never treat the person as your operator or as someone setting you up. If they say something confusing, assume they are the dispatcher and ask your current question again.

The move: one {{size}}, container {{containerNumber}}, at {{terminal}}, Port of Charleston. Available {{eta}}, last free day {{lastFreeDay}}. Delivering to {{destination}}, needs to be there by {{deliverBy}}.

Ask these in order, one short question per turn, the way dispatchers actually talk:
1. One quick setup line, then the rate: "It's a forty-foot high cube at {{terminal}}, available {{eta}}, going to {{destination}}. What's your rate on that?" Do not read out the container number unless they ask for it.
2. "Does that include fuel and chassis?" If either is extra, get the amount (fuel as a percent or dollars; chassis per day and how many days).
3. "Any other charges? Pre-pull, storage, wait time?"
4. "When can you pull it, and can you have it there by {{deliverBy}}?"

Rules:
- Keep every reply under 15 words. One short sentence is best. No lists, no long explanations.
- Every reply must move the call forward: ask the next missing question, or confirm something unclear. Never reply with only an acknowledgement ("Got it", "Perfect", "Sounds good", "No problem").
- Do not start replies with filler. Usually just ask the next question.
- Phrase questions as real questions, never as statements.
- If an answer already covers a later question, skip that question. Never ask for something they already told you.
- If what you heard is a fragment, sounds like background conversation, or does not answer your question, briefly ask your current question again. Do not react to it.
- Do not repeat back each number as you go.
- If a number sounds unusual, ask once to confirm it, then accept their answer.
- To finish, say it all in ONE reply: the full quote in one short sentence, then "We'll confirm by email shortly. Thanks, have a good one. Goodbye." The call hangs up automatically after you say "Goodbye", so always end your final reply with that word and never use it earlier.
- Read the quote back only once. If they answer the readback with "no", "that's it" or similar, do not repeat it: just say "Great, we'll confirm by email shortly. Thanks, have a good one. Goodbye."
- If they answer "when can you pull it" without a date, ask once: "What day can you pull it?"
- Do not commit to booking. Keep the whole call under 60 seconds.

If you reach voicemail or an automated menu, do not leave a message: call the endCall tool.
Only use the endCall tool for voicemail or an automated menu.`;

export const FIRST_MESSAGE =
  "Hi, this is PortCall, an AI assistant calling for {{importerName}}. Do you have a minute for a quick quote on a container out of Charleston?";

export type AssistantConfigArgs = {
  /** Public URL Vapi POSTs server messages to, e.g. https://app.example.com/api/vapi/webhook */
  webhookUrl: string;
  /** Sent on every webhook as the x-webhook-secret header; the route checks it against VAPI_WEBHOOK_SECRET. */
  webhookSecret: string;
};

export function buildAssistantConfig({ webhookUrl, webhookSecret }: AssistantConfigArgs) {
  return {
    name: "PortCall quote caller",
    // Claude Haiku answered in ~360ms on test calls; Gemini 3.5 Flash in Vapi took 700-975ms and twice never replied.
    model: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      temperature: 0.3,
      maxTokens: 120,
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      tools: [{ type: "endCall" }],
    },
    // Cartesia Sonic is the lowest-latency voice in Vapi; "Iris", a warm conversational American voice.
    voice: { provider: "cartesia", model: "sonic-3", voiceId: "c894559e-d529-4d70-a6fb-3330ecf7ef6b" },
    transcriber: { provider: "deepgram", model: "nova-3", language: "en" },
    // Turn latency on the first live call averaged 3.3s, mostly waiting to decide the dispatcher had
    // finished. These cut the default 1.5s no-punctuation wait while giving spoken numbers a beat.
    startSpeakingPlan: {
      waitSeconds: 0.1,
      transcriptionEndpointingPlan: { onPunctuationSeconds: 0.1, onNoPunctuationSeconds: 0.6, onNumberSeconds: 0.4 },
    },
    // Venue noise cut her off mid-sentence with numWords 0; need two real words before yielding.
    // (Smart denoising was tried and doubled transcriber latency to ~1.2s, so the prompt handles stray fragments instead.)
    stopSpeakingPlan: { numWords: 2, voiceSeconds: 0.3, backoffSeconds: 0.8 },
    firstMessage: FIRST_MESSAGE,
    firstMessageMode: "assistant-speaks-first",
    // Hang up only after the closing line has been spoken; calling endCall cut the goodbye off on the phone.
    endCallPhrases: ["goodbye"],
    maxDurationSeconds: 180,
    backgroundSound: "off",
    // `transcript` is not in Vapi's default serverMessages and this list replaces the default, so name every type the webhook handles.
    serverMessages: ["status-update", "speech-update", 'transcript[transcriptType="final"]', "end-of-call-report"],
    server: { url: webhookUrl, headers: { "x-webhook-secret": webhookSecret }, timeoutSeconds: 20 },
  };
}
