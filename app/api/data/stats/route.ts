import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data: conversations } = await supabase.from("conversations").select("*");
    const { data: agents } = await supabase.from("agents").select("*");

    const convos = conversations || [];
    const agentList = agents || [];
    const agentMap = new Map(agentList.map((a: { code: string; name: string }) => [a.code, a.name]));

    // Overall stats
    const total = convos.length;
    const booked = convos.filter((c: { booked: boolean }) => c.booked).length;
    const avgStage = total > 0
      ? convos.reduce((sum: number, c: { last_stage: number }) => sum + (c.last_stage || 1), 0) / total
      : 0;

    // Stage funnel
    const stageCounts = [0, 0, 0, 0, 0, 0];
    for (const c of convos) {
      const stage = (c as { last_stage: number }).last_stage || 1;
      for (let i = 0; i < stage; i++) stageCounts[i]++;
    }

    // Per-agent stats
    const agentStats: Record<string, { name: string; conversations: number; booked: number; avgStage: number }> = {};
    for (const a of agentList) {
      const agent = a as { code: string; name: string };
      const agentConvos = convos.filter((c: { agent_code: string }) => c.agent_code === agent.code);
      agentStats[agent.code] = {
        name: agent.name,
        conversations: agentConvos.length,
        booked: agentConvos.filter((c: { booked: boolean }) => c.booked).length,
        avgStage: agentConvos.length > 0
          ? agentConvos.reduce((sum: number, c: { last_stage: number }) => sum + (c.last_stage || 1), 0) / agentConvos.length
          : 0,
      };
    }

    // Direct (no agent code)
    const directConvos = convos.filter((c: { agent_code: string | null }) => !c.agent_code);
    if (directConvos.length > 0) {
      agentStats["direct"] = {
        name: "Direct (no agent)",
        conversations: directConvos.length,
        booked: directConvos.filter((c: { booked: boolean }) => c.booked).length,
        avgStage: directConvos.reduce((sum: number, c: { last_stage: number }) => sum + (c.last_stage || 1), 0) / directConvos.length,
      };
    }

    return Response.json({
      overall: { total, booked, conversionRate: total > 0 ? (booked / total * 100).toFixed(1) : "0", avgStage: avgStage.toFixed(1) },
      stageFunnel: stageCounts,
      agentStats,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
