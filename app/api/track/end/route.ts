export const runtime = "edge";

import { getSupabase } from "@/lib/supabase";

const SUMMARY_PROMPT = `You are analyzing a completed NEPQ sales call transcript. Create a structured summary in this exact format:

**Stage Reached:** [Connect / Situation / Problem / Impact / Wallet Test / Book Call]
**Pain Points:** [Key problems the prospect articulated]
**Emotional Drivers:** [What emotionally drove them]
**Budget:** [Budget range discussed, or "Not discussed"]
**Objections:** [Any objections raised and how they were handled]
**Readiness:** [Low / Medium / High]
**Outcome:** [Booked / Did not book / Dropped off]
**Key Moments:** [2-3 turning points in the conversation]

Be factual — only include what the prospect actually said. Keep it under 150 words.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  try {
    const { conversationId, stage, booked, chunk, messages } = await request.json();
    if (!conversationId) {
      return Response.json({ error: "Missing conversationId" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Append any remaining chunk to transcript
    if (chunk && chunk.length > 0) {
      const newText = chunk
        .map((m: { role: string; content: string }) =>
          `${m.role === "assistant" ? "Tiffany" : "Prospect"}: ${m.content}`
        )
        .join("\n\n");

      const { data } = await supabase
        .from("conversations")
        .select("transcript")
        .eq("id", conversationId)
        .single();

      const existing = data?.transcript || "";
      const transcript = existing ? `${existing}\n\n${newText}` : newText;

      await supabase
        .from("conversations")
        .update({ transcript })
        .eq("id", conversationId);
    }

    // Read final transcript for summary
    const { data: convo } = await supabase
      .from("conversations")
      .select("transcript")
      .eq("id", conversationId)
      .single();

    const fullTranscript = convo?.transcript || "";

    // Generate NEPQ summary via Haiku (once, at end)
    let summary = "";
    if (apiKey && fullTranscript.length > 50) {
      try {
        const haikuRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 300,
            temperature: 0,
            system: SUMMARY_PROMPT,
            messages: [{ role: "user", content: fullTranscript }],
          }),
        });

        if (haikuRes.ok) {
          const data = await haikuRes.json();
          summary = data.content?.[0]?.text || "";
        }
      } catch {
        // Summary generation failed — not critical
      }
    }

    // Final update
    await supabase
      .from("conversations")
      .update({
        last_stage: stage || 1,
        booked: booked || false,
        summary: summary || null,
        ended_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Track end error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
