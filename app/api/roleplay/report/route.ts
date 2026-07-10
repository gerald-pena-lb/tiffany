export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const REPORT_PROMPT = `You are a senior sales coach reviewing a NEPQ Setter Script roleplay. The USER (setter in training) was practicing the 9-stage NEPQ Book Discovery Call framework. The AI played a prospect.

Produce a QA sheet in this EXACT markdown format. Quote actual lines from the transcript. Be specific. No generic feedback.

# NEPQ Setter Script — Call Assessment

**Setter:** {setter name from context if provided, else "Trainee"}
**Score:** X/100
**Verdict:** (one-line: Strong / Solid / Needs Work / Below Standard)

---

## Stage-by-Stage QA

### 1. CONNECTING (weight 10%)
- **Score:** X/10
- **Covered:** ✓ / partial / ✗
- **Did the setter ask why the prospect really came?** yes/no — quote
- **Did they reinforce the 1% frame (80% want, less than 1% do)?** yes/no
- **Notes:** 1-2 sentence observation

### 2. SITUATION (weight 15%)
- **Score:** X/10
- **Covered:** ✓ / partial / ✗
- **Did they establish authority (entrepreneurial publishing vs traditional/self-publishing)?** yes/no
- **Did they share success stories (500+ authors, 250+ bestsellers, DHL/Mitsubishi CEOs)?** yes/no
- **Did they discover the specific goal (grow/differentiate/pivot/give back)?** yes/no — quote the goal
- **Did they ask "why is that important to you?"** yes/no
- **Notes:**

### 3. PROBLEM AWARENESS (weight 10%)
- **Score:** X/10
- **Covered:** ✓ / partial / ✗
- **Did they surface a specific day-to-day problem?** yes/no — quote
- **Did they ask how long?** yes/no
- **Did they reflect back time ("that's X years of...")?** yes/no
- **Notes:**

### 4. CONSEQUENCE (weight 15%)
- **Score:** X/10
- **Covered:** ✓ / partial / ✗
- **Did they quantify financial impact?** yes/no — quote number
- **Did they use the "gold mine / sitting on money" reframe?** yes/no
- **Did they get the prospect to say "we need to do something differently"?** yes/no
- **Notes:**

### 5. SOLUTION AWARENESS (weight 10%)
- **Score:** X/10
- **Covered:** ✓ / partial / ✗
- **Did they ask what the book should accomplish for prospects?** yes/no
- **Did they position professional help vs self-publishing?** yes/no
- **Notes:**

### 6. CONSEQUENCE / LOSS (weight 10%)
- **Score:** X/10
- **Covered:** ✓ / partial / ✗
- **Did they ask what would be lost if book stays in their head?** yes/no
- **Did they tie back to the earlier number if prospect minimized?** yes/no
- **Notes:**

### 7. OPEN WALLET TEST (weight 15%)
- **Score:** X/10
- **Covered:** ✓ / partial / ✗
- **Did they ask "what have you set aside"?** yes/no
- **Did they use the car analogy if prospect said nothing?** yes/no
- **Did they use the $6K-$50K range framing when asked "how much"?** yes/no
- **Did they use the "first impression / job interview" reframe if anchored low?** yes/no
- **Investment range surfaced:** $X-$X or "not disclosed"
- **Notes:**

### 8. TRANSITION / BOOKING (weight 10%)
- **Score:** X/10
- **Covered:** ✓ / partial / ✗
- **Did they position it as a strategy call with Alinka (Co-Founder)?** yes/no
- **Did they get verbal confirmation of a specific time?** yes/no
- **Did they confirm time zone?** yes/no
- **Notes:**

### 9. PRE-CALL HOMEWORK (weight 5%)
- **Score:** X/10
- **Covered:** ✓ / partial / ✗
- **Did they mention the resource page / prep materials?** yes/no
- **Did they get commitment (30-60 min review)?** yes/no
- **Notes:**

---

## Strengths (top 3)
- Specific moments the setter nailed. Quote them.

## Weaknesses (top 3)
- Specific mistakes. Quote them.

## Biggest Missed Opportunity
- The single moment where the setter could have gone deeper or unlocked more. Quote it.

## Coach's Verdict
One paragraph (3-4 sentences). What's the ONE thing this setter needs to work on next?

---

SCORING GUIDANCE:
- 90-100: Strong. Ready for live calls.
- 75-89: Solid. Minor gaps.
- 60-74: Needs Work. Missing key stages or reframes.
- Below 60: Below Standard. Missing multiple stages or made major NEPQ errors (pitching, closed questions, being pushy).

Compute final score as weighted average of stage scores (weights shown above).
Be honest. Reward good technique. Call out missed reframes and script deviations. Don't be generic — quote the transcript.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500, headers: CORS_HEADERS });
  }

  try {
    const { transcript, persona, userName } = await request.json();
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
        max_tokens: 3000,
        temperature: 0.3,
        system: REPORT_PROMPT,
        messages: [
          {
            role: "user",
            content: `SETTER NAME: ${userName || "Trainee"}\n\nPROSPECT PERSONA:\n${persona || "Not provided"}\n\nTRANSCRIPT:\n${transcript}`,
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

    // Extract score from report
    const scoreMatch = report.match(/\*\*Score:\*\*\s*(\d+)\s*\/\s*100/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : null;

    return Response.json({ report, score }, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS_HEADERS });
  }
}
