export const runtime = "edge";

const VOICE_ID = "EST9Ui6982FZPSi7gCHi"; // Tiffany's voice from ElevenLabs

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

  const ttsResponse = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: body.text,
        model_id: "eleven_v3_conversational",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: 1.0,
        },
      }),
    }
  );

  if (!ttsResponse.ok) {
    const err = await ttsResponse.text();
    console.error("ElevenLabs TTS error:", ttsResponse.status, err);
    return Response.json({ error: "TTS failed", details: err }, { status: ttsResponse.status });
  }

  // Stream the audio directly back to the client
  return new Response(ttsResponse.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
    },
  });
}
