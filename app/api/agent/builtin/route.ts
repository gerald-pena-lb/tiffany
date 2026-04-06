export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID not set" },
      { status: 500 }
    );
  }

  // Switch agent to built-in claude-sonnet-4-6 (no custom LLM)
  // This tests whether the voice pipeline works without the proxy
  const patchBody = {
    conversation_config: {
      agent: {
        prompt: {
          llm: "claude-sonnet-4-6",
          custom_llm: null,
        },
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
    return Response.json({
      success: true,
      message: "Agent switched to built-in claude-sonnet-4-6 (no custom LLM). Test the voice call now.",
      llm: "claude-sonnet-4-6",
    });
  } catch (err) {
    return Response.json({ error: "Request failed", details: String(err) }, { status: 500 });
  }
}
