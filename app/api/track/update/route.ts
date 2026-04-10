import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { conversationId, stage, chunk } = await request.json();
    if (!conversationId) {
      return Response.json({ error: "Missing conversationId" }, { status: 400 });
    }

    if (!chunk || chunk.length === 0) {
      return Response.json({ ok: true });
    }

    // Format new messages as transcript text
    const newText = chunk
      .map((m: { role: string; content: string }) =>
        `${m.role === "assistant" ? "Tiffany" : "Prospect"}: ${m.content}`
      )
      .join("\n\n");

    const supabase = getSupabase();

    // Read current transcript, append new chunk
    const { data } = await supabase
      .from("conversations")
      .select("transcript")
      .eq("id", conversationId)
      .single();

    const existing = data?.transcript || "";
    const transcript = existing ? `${existing}\n\n${newText}` : newText;

    await supabase
      .from("conversations")
      .update({
        last_stage: stage || 1,
        transcript,
      })
      .eq("id", conversationId);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Track update error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
