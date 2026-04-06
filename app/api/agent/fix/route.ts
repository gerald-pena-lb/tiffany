export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const llmUrl = process.env.LLM_WEBHOOK_URL;

  if (!apiKey || !agentId) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID not set" },
      { status: 500 }
    );
  }

  const patchBody = {
    conversation_config: {
      agent: {
        prompt: {
          llm: "custom-llm/claude-opus-4-6",
          custom_llm: {
            url: llmUrl || "",
            model: "claude-opus-4-6",
          },
        },
      },
      tts: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 1.0,
      },
    },
  };

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${agentId}`,
      {
        method: "PATCH",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patchBody),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: "PATCH failed", status: response.status, details: err });
    }

    const data = await response.json();
    return Response.json({ success: true, agent: data });
  } catch (err) {
    return Response.json({ error: "Request failed", details: String(err) }, { status: 500 });
  }
}
