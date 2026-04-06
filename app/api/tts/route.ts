export const runtime = "edge";

const VOICE_ID = "EST9Ui6982FZPSi7gCHi";

export async function GET() {
  return Response.json({
    voiceId: VOICE_ID,
    note: "POST with {text: '...'} to generate speech",
  });
}

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
  }

  let body: { text: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.text?.trim()) {
    return Response.json({ error: "No text provided" }, { status: 400 });
  }

  // Try non-streaming first (simpler, more reliable)
  const ttsResponse = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: body.text,
        model_id: "eleven_multilingual_v2",
      }),
    }
  );

  if (!ttsResponse.ok) {
    const err = await ttsResponse.text();
    console.error("TTS error:", ttsResponse.status, err);

    // If model fails, try without specifying model (uses default)
    const fallbackResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({ text: body.text }),
      }
    );

    if (!fallbackResponse.ok) {
      const fallbackErr = await fallbackResponse.text();
      console.error("TTS fallback error:", fallbackResponse.status, fallbackErr);
      return Response.json(
        { error: "TTS failed", primary: err, fallback: fallbackErr },
        { status: 500 }
      );
    }

    return new Response(fallbackResponse.body, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  }

  return new Response(ttsResponse.body, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
