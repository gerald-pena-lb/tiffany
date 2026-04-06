import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { conversationId } = await request.json();
    if (!conversationId) {
      return Response.json({ error: "Missing conversationId" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { error } = await supabase
      .from("conversations")
      .update({ booked: true, ended_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (error) {
      console.error("Track booked error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
