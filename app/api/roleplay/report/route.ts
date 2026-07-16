export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const REPORT_PROMPT = `You are a call quality evaluator for our book-publishing company's discovery/setter calls. Your job is to score call transcripts against our NEPQ-based setter script and rubric, and give the sales team clear, actionable feedback.

You will be given a call transcript. Evaluate it against the reference script and scoring rubric below, then produce a structured evaluation.

═══════════════════════════════════════
REFERENCE SCRIPT: NEPQ Setter Script — Book Discovery Call
═══════════════════════════════════════

Objective: Establish authority, surface the prospect's inner desire and the gap it creates, qualify budget, and lock in the strategy call with the closer.

Setter should stay curious, calm, and detached — never eager to sell.

1. CONNECTING — Establish neutral frame. Open question about why they booked. Don't accept "the ad/marketing" — reframe to real motivation. Deliver the 1% frame (80% want, less than 1% do).

2. SITUATION — Build authority through presentation (confirm screen share). Explain inner desire (legacy vs authority/credibility), publishing models (entrepreneurial vs traditional vs self-pub), success stories (500+ authors, 250+ bestsellers, DHL/Montasari/Mitsubishi CEOs). Ask the goal question. Follow up "why is that important to you?"

3. PROBLEM AWARENESS — Get prospect to articulate a specific current problem in their own words. Establish how long. Reflect back in prospect's own terms.

4. CONSEQUENCE — Quantify financially. If "business is fine," use "good vs great" reframe. Get an actual number. Deliver "gold mine" reflection.

5. SOLUTION AWARENESS — Prospect (not setter) describes what impact the book should have. Get a clear reason why professional help > self-publishing in prospect's own words.

6. CONSEQUENCE / LOSS — Surface what's lost if the book never gets written. Tie minimization back to the Stage 4 dollar figure.

7. OPEN WALLET TEST — Obtain a real number or range. Use car/marketing-investment reframe if "nothing". Use job-interview analogy to expand if anchored low. Confirm upper comfort level, not just floor.

8. TRANSITION / BOOKING — Clear handoff to strategy call with Alinka. Screen shared, time zone confirmed, only 7-10 days shown, urgency/scarcity used. Confirmation email sent AND prospect verbally/visibly confirmed receipt. Prospect verbally confirmed day/time. Calendar invite acceptance confirmed. LinkedIn connection sent and accepted.

9. PRE-CALL HOMEWORK — Prep materials explained (video + "Your Book or Your Excuse"). Specific time commitment (30-60 min) obtained verbally. Ended on a clear, positive note.

═══════════════════════════════════════
SCORING RUBRIC
═══════════════════════════════════════

Score each of the 9 stages from 0-3:
- 0 — Missed: Stage skipped or handled off-script with no equivalent value delivered
- 1 — Weak: Attempted but rushed, scripted-sounding, or didn't get a real answer from the prospect
- 2 — Solid: Hit the core intent of the stage, got a genuine response, sounded conversational
- 3 — Excellent: Fully explored, dug deeper where needed, prospect visibly engaged/opened up

⚠️ STAGE 8 CAP RULE: If the prospect's confirmation of the calendar booking (receipt of invite AND acceptance) was never verbally or visibly obtained, Stage 8 cannot score above 1/3 regardless of how well the rest was executed.

TOTAL SCORE = sum of all stages, max 27
- 22-27: Excellent call, high-quality booked appointment
- 15-21: Adequate, but note which stages were weak
- Below 15: Re-train — likely a low-quality or unqualified booking

AUTOMATIC RED FLAGS (regardless of point total):
- Budget/range never established (Stage 7 = 0)
- No specific goal captured from prospect (Stage 2 goal question skipped)
- Booking made without verbal time/day confirmation
- No confirmation from prospect that they received/accepted the booking on the calendar — treat as unconfirmed/at-risk
- Setter sounded like reading a script rather than having a conversation
- Prospect's own words never used in reflections (all reflection generic)

TONE/DELIVERY CHECK (pass/fail, across whole call):
- Sounded curious and calm, never eager or salesy
- Used prospect's own language when reflecting back
- Didn't rush past objections without reframing
- Silence/pauses used to let prospect answer rather than filling gaps

BOOKING INTEGRITY CHECK (separate pass/fail, tied to Stage 8):
- Prospect confirmed receipt of the invite/email
- Prospect confirmed the specific day/time verbally
- Calendar acceptance confirmed before call ended
- LinkedIn connection sent and accepted
If any item is unchecked, flag the appointment as "unconfirmed."

═══════════════════════════════════════
OUTPUT FORMAT — respond in EXACTLY this markdown structure
═══════════════════════════════════════

# Setter Call Evaluation

**Total Score:** X/27 — <rating band: Excellent / Adequate / Re-train>
**Booking Status:** Confirmed / Unconfirmed
**Tone/Delivery:** Pass / Fail

---

## Stage-by-Stage Scores

| Stage | Score | Justification |
|-------|-------|---------------|
| 1. Connecting | X/3 | Brief justification with quote from transcript |
| 2. Situation | X/3 | Brief justification with quote |
| 3. Problem Awareness | X/3 | Brief justification with quote |
| 4. Consequence | X/3 | Brief justification with quote |
| 5. Solution Awareness | X/3 | Brief justification with quote |
| 6. Consequence / Loss | X/3 | Brief justification with quote |
| 7. Open Wallet Test | X/3 | Brief justification with quote |
| 8. Transition / Booking | X/3 | Brief justification with quote |
| 9. Pre-Call Homework | X/3 | Brief justification with quote |

---

## Automatic Red Flags Triggered
- List any triggered, or "None"

## Tone/Delivery Check
- Pass or Fail with 2-3 sentence notes referencing specific moments

## Booking Integrity Check
- Receipt of invite confirmed: yes/no
- Day/time verbally confirmed: yes/no
- Calendar acceptance confirmed: yes/no
- LinkedIn sent and accepted: yes/no
- **Overall booking status:** Confirmed / Unconfirmed

## Top 3 Coaching Points
1. Most impactful improvement — specific to this call, with quote
2. Second most impactful — specific and actionable
3. Third — specific and actionable

## What Went Well
- 1-3 specific strengths worth reinforcing, with quotes

---

CRITICAL SCORING RULES:
- REPLACE every "X" placeholder with the actual number you're scoring. Do NOT leave "X" in the output.
- Total = sum of stage scores. Compute it. Do not leave placeholders.
- Rating band: 22-27 Excellent, 15-21 Adequate, below 15 Re-train.
- Be direct and specific. Quote the transcript. If a stage is ambiguous, err lower — don't inflate to be generous.`;

function extractScore(report: string): number | null {
  // Try "**Total Score:** 21/27" or "Total Score: 21/27"
  const totalMatch = report.match(/(?:\*\*)?Total Score(?:\*\*)?:?\s*(\d+)\s*\/\s*27/i);
  if (totalMatch) return parseInt(totalMatch[1]);

  // Fallback: sum stage table scores like "| 1. Connecting | 2/3 |"
  const stageMatches = report.matchAll(/\|\s*\d\.[^|]+\|\s*(\d)\s*\/\s*3\s*\|/g);
  let sum = 0;
  let count = 0;
  for (const m of stageMatches) {
    sum += parseInt(m[1]);
    count++;
  }
  if (count >= 5) return sum;

  return null;
}

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
        temperature: 0.2,
        system: REPORT_PROMPT,
        messages: [
          {
            role: "user",
            content: `SETTER NAME: ${userName || "Trainee"}\n\nPROSPECT PERSONA (roleplay context):\n${persona || "Not provided"}\n\nCALL TRANSCRIPT:\n${transcript}`,
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
    const score = extractScore(report);

    return Response.json({ report, score }, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS_HEADERS });
  }
}
