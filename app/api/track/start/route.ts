import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { agentCode, prospectName, lastStage, booked } = await request.json();
    const supabase = getSupabase();

    const { error } = await supabase
      .from("conversations")
      .insert({
        agent_code: agentCode || null,
        prospect_name: prospectName || "Unknown",
        started_at: new Date().toISOString(),
        last_stage: lastStage || 1,
        booked: booked || false,
        ended_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Track error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Track error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
