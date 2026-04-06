export const runtime = "edge";

const VOICE_ID = "EST9Ui6982FZPSi7gCHi";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ELEVENLABS_API_KEY not set" });
  }

  try {
    const modelsRes = await fetch("https://api.elevenlabs.io/v1/models", {
      headers: { "xi-api-key": apiKey },
    });

    if (!modelsRes.ok) {
      const err = await modelsRes.text();
      return Response.json({ error: "Models fetch failed", status: modelsRes.status, details: err });
    }

    const modelsData = await modelsRes.json();
    const models = Array.isArray(modelsData) ? modelsData : modelsData.models || [];

    return Response.json({
      voiceId: VOICE_ID,
      models: models.map((m: { model_id: string; name: string }) => ({
        id: m.model_id,
        name: m.name,
      })),
    });
  } catch (err) {
    return Response.json({ error: "Request failed", details: String(err) });
  }
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

  // Try multiple models in order of preference
  const models = ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_turbo_v2", "eleven_monolingual_v1"];

  for (const model of models) {
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
          model_id: model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (ttsResponse.ok) {
      return new Response(ttsResponse.body, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-cache",
        },
      });
    }

    const err = await ttsResponse.text();
    console.error(`TTS model ${model} failed (${ttsResponse.status}):`, err);
  }

  return Response.json({ error: "All TTS models failed" }, { status: 500 });
}
