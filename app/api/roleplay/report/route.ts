export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const REPORT_PROMPT = `You are a senior sales coach reviewing a training roleplay. The USER was practicing as a sales SETTER using the NEPQ framework (Jeremy Miner). The AI played a prospect based on a persona.

Analyze the transcript and produce a coaching report in this EXACT format (markdown):

## Score: X/10
(one-line reason)

## Stages Reached
- Connect: ✓ / partial / ✗
- Situation: ✓ / partial / ✗
- Problem: ✓ / partial / ✗
- Impact: ✓ / partial / ✗
- Wallet Test: ✓ / partial / ✗
- Book Call: ✓ / partial / ✗

## What You Did Well
- 3-5 specific things the setter did right (quote them where possible)

## What Needs Work
- 3-5 specific mistakes or weak moments (quote them where possible)

## Missed Opportunities
- Specific moments where the setter could have gone deeper on emotion, followed up, or challenged the status quo

## Coach's Verdict
One paragraph (3-4 sentences) — honest, direct, actionable. What's the ONE thing this setter needs to work on most?

Be specific. Quote actual lines from the transcript. Don't be generic. NEPQ principles: neutral tone, no pitching, one question at a time, no summarizing prospect's answers back, use silence, use binary reframes, surface emotion.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500, headers: CORS_HEADERS });
  }

  try {
    const { transcript, persona } = await request.json();
    if (!transcript) {
      return Response.json({ error: "Missing transcript" }, { status: 400, headers: CORS_HEADERS });
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        temperature: 0.3,
        system: REPORT_PROMPT,
        messages: [
          {
            role: "user",
            content: `PROSPECT PERSONA:\n${persona || "Not provided"}\n\nTRANSCRIPT:\n${transcript}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: errText }, { status: res.status, headers: CORS_HEADERS });
    }

    const data = await res.json();
    const report = data.content?.[0]?.text || "Report generation failed.";
    return Response.json({ report }, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS_HEADERS });
  }
}
