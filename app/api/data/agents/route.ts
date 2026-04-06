import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, code } = await request.json();
    if (!name || !code) {
      return Response.json({ error: "Name and code required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("agents")
      .insert({ name, code: String(code) })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { code } = await request.json();
    if (!code) return Response.json({ error: "Code required" }, { status: 400 });

    const supabase = getSupabase();
    const { error } = await supabase.from("agents").delete().eq("code", code);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
