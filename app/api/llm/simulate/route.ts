export const runtime = "edge";

export async function GET() {
  const webhookUrl = process.env.LLM_WEBHOOK_URL;
  if (!webhookUrl) {
    return Response.json({ error: "LLM_WEBHOOK_URL not set" }, { status: 500 });
  }

  const samplePayload = {
    model: "claude-opus-4-6",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Say hello briefly." },
    ],
    stream: true,
    temperature: 0.7,
    max_tokens: 100,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(samplePayload),
    });

    const text = await response.text();
    return Response.json({
      success: response.ok,
      status: response.status,
      url: webhookUrl,
      responsePreview: text.slice(0, 500),
    });
  } catch (err) {
    return Response.json(
      { error: "Failed to reach webhook", url: webhookUrl, details: String(err) },
      { status: 500 }
    );
  }
}
