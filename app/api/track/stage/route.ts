import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { conversationId, stage } = await request.json();
    if (!conversationId || !stage) {
      return Response.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { error } = await supabase
      .from("conversations")
      .update({ last_stage: stage })
      .eq("id", conversationId);

    if (error) {
      console.error("Track stage error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
