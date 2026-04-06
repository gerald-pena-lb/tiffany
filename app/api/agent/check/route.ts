export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID not set" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${agentId}`,
      { headers: { "xi-api-key": apiKey } }
    );

    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: "ElevenLabs API error", status: response.status, details: err });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: "Request failed", details: String(err) }, { status: 500 });
  }
}
