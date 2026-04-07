export const runtime = "edge";

import { getSupabase } from "@/lib/supabase";

const SUMMARY_PROMPT = `You are analyzing a live NEPQ sales call. Summarize the conversation so far in this exact format:

**Stage:** [Current NEPQ stage: Connect / Situation / Problem / Impact / Wallet Test / Book Call]
**Pain Points:** [Key problems the prospect has articulated, or "Not yet uncovered"]
**Emotional Drivers:** [What's emotionally driving them, or "Not yet surfaced"]
**Budget:** [Budget range if discussed, or "Not discussed"]
**Objections:** [Any objections raised, or "None"]
**Readiness:** [Low / Medium / High — how ready they are to move forward]

Keep it under 100 words total. Be factual — only include what the prospect actually said.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  try {
    const { conversationId, stage, messages } = await request.json();
    if (!conversationId || !messages?.length) {
      return Response.json({ error: "Missing fields" }, { status: 400 });
    }

    // Call Haiku for NEPQ summary
    const convoText = messages
      .map((m: { role: string; content: string }) =>
        `${m.role === "assistant" ? "Tiffany" : "Prospect"}: ${m.content}`
      )
      .join("\n");

    const haikuRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        temperature: 0,
        system: SUMMARY_PROMPT,
        messages: [{ role: "user", content: convoText }],
      }),
    });

    let summary = "";
    if (haikuRes.ok) {
      const data = await haikuRes.json();
      summary = data.content?.[0]?.text || "";
    }

    // Update Supabase
    const supabase = getSupabase();
    await supabase
      .from("conversations")
      .update({
        last_stage: stage || 1,
        ...(summary ? { summary } : {}),
      })
      .eq("id", conversationId);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Track update error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
