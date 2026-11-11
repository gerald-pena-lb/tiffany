export const runtime = "nodejs";

import { getScenarioById, STAGE_LABELS, stageBehavior } from "@/app/lib/scenarios";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function buildReportPrompt(targetStage: number) {
  const activeStages = STAGE_LABELS.slice(0, targetStage);
  const stageRows = activeStages.map((label, i) => {
    return `| ${i + 1}. ${label} | X/3 | Brief justification with transcript quote |`;
  }).join("\n");

  return `You are a senior sales coach and communication coach evaluating a NEPQ Setter Script roleplay. The user (setter in training) practiced stages 1 through ${targetStage} (${activeStages.join(", ")}).

Do NOT score stages past Stage ${targetStage} — they were not in scope for this session.

Produce the evaluation in EXACTLY this markdown structure. Quote specific lines from the transcript. Be direct and specific — no generic advice.

# Setter Training Evaluation

**Target Stage:** Stage ${targetStage} — ${activeStages[targetStage - 1]}
**Target Reached:** Yes / Partial / No — short reason
**NEPQ Score:** [replace with actual integer]/${targetStage * 3}
**Communication Score:** [replace with actual integer]/15 (sum of 3 communication dimensions below, each 0-5)
**Overall Verdict:** Strong / Solid / Needs Work / Below Standard

---

## Stage-by-Stage NEPQ Scores (0-3 each)

0 — Missed · 1 — Weak · 2 — Solid · 3 — Excellent

| Stage | Score | Justification |
|-------|-------|---------------|
${stageRows}

---

## Communication Skills (0-5)

### Tone & Delivery — X/5
- Curiosity, calm, detachment vs. eager/salesy
- Pace, filler words ("um", "like"), hedging
- Quote 1-2 specific moments

### Active Listening & Comprehension — X/5
This is CRITICAL. For each setter response, check whether the setter actually heard what the prospect said:
- Did the setter's next question build on the prospect's actual answer, or go off on a tangent?
- Did the setter reflect the prospect's own words back?
- Did the setter miss an obvious cue (emotional word, specific number, hidden pain)?
- Quote at least ONE comprehension win AND one comprehension miss (if any). If no misses, say so.

### Language Quality — X/5
Evaluate word choice, sentence structure, coherence:
- Word choice — precise and natural vs. awkward, buzzwords, jargon
- Sentence structure — clear and tight vs. rambling, run-ons, mid-sentence pivots
- Coherence — ideas connect logically vs. jumps, incomplete thoughts
- Quote 1-2 moments for each dimension that stood out (positive or negative)

---

## What Went Well
- 3-5 specific wins with quotes

## What Needs to Change
- 3-5 specific improvement areas with quotes
- For each, give the actual fix: what to say instead

## Comprehension Misses (if any)
- List each moment where the setter's response didn't match what the prospect just said
- For each, quote the prospect, quote the setter, and explain the mismatch

## Word Choice & Phrasing Opportunities
- 3-5 specific phrases the setter used that could be sharpened
- Format: "You said: '...' — stronger would be: '...'"

## Coach's Verdict
One direct paragraph (3-4 sentences). What's the ONE thing to work on next?

---

SCORING RULES:
- REPLACE every "X" placeholder with real integers. Do NOT leave "X" in the output.
- NEPQ Score = sum of the ${targetStage} stage scores you give above.
- Communication Score = Tone + Listening + Language (max 15).
- Overall Verdict: Strong = both scores >= 80% of max; Solid = both >= 60%; Needs Work = one < 60%; Below Standard = both < 60%.
- Be strict. If a stage was cursory or off-script, mark it 1. Don't inflate.`;
}

function extractNepqScore(report: string, max: number): number | null {
  const m = report.match(/\*\*NEPQ Score:\*\*\s*(\d+)\s*\/\s*(\d+)/i);
  if (m && parseInt(m[2]) === max) return parseInt(m[1]);
  return null;
}

function extractCommScore(report: string): number | null {
  const m = report.match(/\*\*Communication Score:\*\*\s*(\d+)\s*\/\s*15/i);
  if (m) return parseInt(m[1]);
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500, headers: CORS_HEADERS });
  }

  try {
    const { transcript, scenarioId, targetStage, userName } = await request.json();
    if (!transcript) {
      return Response.json({ error: "Missing transcript" }, { status: 400, headers: CORS_HEADERS });
    }

    const stage = Math.max(1, Math.min(8, targetStage || 8));
    const scenario = getScenarioById(scenarioId);

    const contextForEvaluator = scenario
      ? `SCENARIO: ${scenario.scenario_id} — ${scenario.prospect_name} (${scenario.position})
Difficulty: ${scenario.difficulty}
Key truths: trigger=${scenario.gate_trigger_and_date}; money_available=${scenario.gate_money_available_now}; set_aside=${scenario.money_set_aside_answer}; DMs=${scenario.other_decision_makers}; objection=${scenario.main_objection} (at ${scenario.objection_stage})
Setter win condition for this scenario: ${scenario.setter_win_condition}
Active stage behavior for this run (1 through ${stage}):
${Array.from({ length: stage }, (_, i) => `- Stage ${i + 1} (${STAGE_LABELS[i]}): ${stageBehavior(scenario, i + 1)}`).join("\n")}`
      : "SCENARIO: Not provided";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3500,
        temperature: 0.2,
        system: buildReportPrompt(stage),
        messages: [
          {
            role: "user",
            content: `SETTER NAME: ${userName || "Trainee"}\n\n${contextForEvaluator}\n\nCALL TRANSCRIPT:\n${transcript}`,
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
    const nepqScore = extractNepqScore(report, stage * 3);
    const commScore = extractCommScore(report);

    // Combined score as a percentage for sorting (0-100)
    let combined: number | null = null;
    if (nepqScore !== null && commScore !== null) {
      const nepqPct = nepqScore / (stage * 3);
      const commPct = commScore / 15;
      combined = Math.round(((nepqPct + commPct) / 2) * 100);
    }

    return Response.json({
      report,
      score: combined,
      nepqScore,
      nepqMax: stage * 3,
      commScore,
      commMax: 15,
    }, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS_HEADERS });
  }
}
