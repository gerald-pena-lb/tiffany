import { getSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { userName, persona, mode, transcript, assessment, score } = await request.json();

    if (!userName || !transcript) {
      return Response.json({ error: "Missing userName or transcript" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("training_sessions")
      .insert({
        user_name: userName,
        persona: persona || null,
        mode: mode || "guided",
        transcript,
        assessment: assessment || null,
        score: score ?? null,
      })
      .select("id")
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, id: data?.id });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
