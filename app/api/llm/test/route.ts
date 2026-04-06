export const runtime = "edge";

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 50,
        messages: [{ role: "user", content: "Say hello in one word." }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: "API call failed", status: response.status, details: err });
    }

    const data = await response.json();
    return Response.json({ success: true, model: "claude-opus-4-6", response: data });
  } catch (err) {
    return Response.json({ error: "Request failed", details: String(err) }, { status: 500 });
  }
}
