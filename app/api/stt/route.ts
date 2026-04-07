export const runtime = "edge";

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
  }

  const formData = await request.formData();
  const audio = formData.get("audio") as Blob | null;
  if (!audio) {
    return Response.json({ error: "No audio provided" }, { status: 400 });
  }

  // Forward to ElevenLabs Scribe
  const sttForm = new FormData();
  sttForm.append("file", audio, "audio.webm");
  sttForm.append("model_id", "scribe_v2");
  sttForm.append("language_code", "en");

  const sttResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: sttForm,
  });

  if (!sttResponse.ok) {
    const err = await sttResponse.text();
    console.error("STT error:", sttResponse.status, err);
    return Response.json({ error: "STT failed", details: err }, { status: sttResponse.status });
  }

  const result = await sttResponse.json();
  return Response.json({ text: result.text || "" });
}
