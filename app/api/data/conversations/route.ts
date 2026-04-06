import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();

    // Get conversations with agent names
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Get agents for name lookup
    const { data: agents } = await supabase.from("agents").select("name, code");
    const agentMap = new Map((agents || []).map((a: { name: string; code: string }) => [a.code, a.name]));

    const enriched = (conversations || []).map((c: { agent_code: string; [key: string]: unknown }) => ({
      ...c,
      agent_name: c.agent_code ? agentMap.get(c.agent_code) || `Code: ${c.agent_code}` : "Direct",
    }));

    return Response.json(enriched);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
