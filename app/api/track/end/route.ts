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
    const { conversationId, stage, booked, messages } = await request.json();
    if (!conversationId) {
      return Response.json({ error: "Missing conversationId" }, { status: 400 });
    }

    // Format transcript
    const transcript = (messages || [])
      .map((m: { role: string; content: string }) =>
        `${m.role === "assistant" ? "Tiffany" : "Prospect"}: ${m.content}`
      )
      .join("\n\n");

    // Generate NEPQ summary via Haiku (only if we have an API key and messages)
    let summary = "";
    if (apiKey && messages?.length > 1) {
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
            messages: [{ role: "user", content: transcript }],
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

    // Update Supabase with everything
    const supabase = getSupabase();
    await supabase
      .from("conversations")
      .update({
        last_stage: stage || 1,
        booked: booked || false,
        transcript,
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
