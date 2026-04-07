import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentCode, prospectName, lastStage, booked } = body;
    const supabase = getSupabase();

    // If no conversationId, create a new record (call start)
    if (!body.conversationId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          agent_code: agentCode || null,
          prospect_name: prospectName || "Unknown",
          started_at: new Date().toISOString(),
          last_stage: lastStage || 1,
          booked: booked || false,
        })
        .select("id")
        .single();

      if (error) {
        console.error("Track start error:", error);
        return Response.json({ error: error.message }, { status: 500 });
      }

      return Response.json({ conversationId: data.id });
    }

    // If conversationId provided, this is a final update (call end)
    const { error } = await supabase
      .from("conversations")
      .update({
        last_stage: lastStage || 1,
        booked: booked || false,
        ended_at: new Date().toISOString(),
      })
      .eq("id", body.conversationId);

    if (error) {
      console.error("Track end error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Track error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
