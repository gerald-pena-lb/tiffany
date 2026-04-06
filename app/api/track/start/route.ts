import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { agentCode, prospectName } = await request.json();
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        agent_code: agentCode || null,
        prospect_name: prospectName || "Unknown",
        started_at: new Date().toISOString(),
        last_stage: 1,
        booked: false,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Track start error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ conversationId: data.id });
  } catch (err) {
    console.error("Track start error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
