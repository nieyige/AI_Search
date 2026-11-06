import Anthropic from "@anthropic-ai/sdk";

// Credentials/base URL come from ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL.
const client = new Anthropic();
const MODEL = () => process.env.LLM_MODEL || "claude-sonnet-5-5";

function textOf(message) {
  if (message.stop_reason === "refusal") {
    throw new Error("The model declined this request (refusal).");
  }
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** One non-streaming call that must return JSON matching `schema`. */
export async function llmJson({ system, prompt, schema, signal }) {
  const message = await client.messages.create(
    {
      model: MODEL(),
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema },
      },
    },
    { signal },
  );
  const text = textOf(message);
  try {
    return JSON.parse(text);
  } catch {
    // Tolerate code fences or stray prose around the JSON.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Model did not return JSON: " + text.slice(0, 200));
    return JSON.parse(m[0]);
  }
}

/** Streaming call; invokes onDelta(text) for each text chunk. */
export async function llmStream({ system, prompt, onDelta, signal }) {
  const stream = client.messages.stream(
    {
      model: MODEL(),
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "medium" },
    },
    { signal },
  );
  stream.on("text", (t) => onDelta(t));
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error("The model declined this request (refusal).");
  }
}
