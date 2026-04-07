import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { conversationId, stage, messages } = await request.json();
    if (!conversationId) {
      return Response.json({ error: "Missing conversationId" }, { status: 400 });
    }

    // Format messages as readable transcript
    const transcript = (messages || [])
      .map((m: { role: string; content: string }) =>
        `${m.role === "assistant" ? "Tiffany" : "Prospect"}: ${m.content}`
      )
      .join("\n\n");

    const supabase = getSupabase();
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
