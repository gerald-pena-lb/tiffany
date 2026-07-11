export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const REPORT_PROMPT = `You are a senior interview coach and hiring expert. A candidate just went through a mock voice interview with an AI interviewer. You have the job description, the candidate's resume, and the full transcript.

Produce a detailed written assessment in this EXACT markdown format. Quote specific lines from the transcript. Be honest and specific — no generic advice.

# Interview Assessment

**Overall Verdict:** (Strong / Solid / Needs Work / Below Standard)
**Score:** X/100
**One-line summary:** (single sentence)

---

## How It Went

### What You Did Well
- 3-5 specific things the candidate did right. Quote actual answers. Be specific about WHY they landed.

### What Needs Work
- 3-5 specific weaknesses. Quote the moments they happened. Explain what was missing.

### Communication Observations
- Clarity, conciseness, filler words, hedging, confidence signals
- Anything the candidate did well or poorly in HOW they spoke

### STAR Method Usage
For each behavioral answer, evaluate whether the candidate used STAR (Situation, Task, Action, Result):
- Which answers had all four components?
- Which answers were missing Situation/Task setup? Which jumped straight to Action?
- Which answers had no measurable Result?
- Quote 1-2 specific examples of strong OR weak STAR structure from the transcript.

### Tough Question Handling
Evaluate how the candidate handled the hard questions specifically:
- **"Biggest weakness"** — was it a real weakness or a humblebrag? Quote the answer.
- **"Why hire you over others"** — did they differentiate specifically or generically?
- **"Why NOT hire you"** — did they show self-awareness or deflect?
- **"Difficult coworker / conflict"** — did they take ownership, or blame the other person?
- **"Failure / mistake"** — did they own it, learn from it, or minimize it?
- **Pushback moments** — when the interviewer pushed back on a weak answer, did the candidate strengthen it or double down on the fluff?

### Job Fit Signal
- Based on the transcript alone, how strong is the case that this candidate matches the JD?
- Which JD requirements did they demonstrate clearly? Which did they miss?

---

## Tips to Improve Interview Performance

### Immediate Fixes (next interview)
- 3-5 concrete things to do differently next time. Actionable, not vague.
- Example format: "When asked about X, structure the answer as [approach]" — reference the actual weak moments.

### Answer Frameworks to Practice
- Specific STAR examples they should prepare based on the JD's key requirements
- List 3-5 stories from their resume that would land better if practiced

### Questions to Prepare for Next Time
- 5-7 likely questions given this JD + their resume gaps
- Prioritize the ones they'd currently struggle with

---

## Resume Improvement Tips

Review their resume for how it lands against this specific JD. Be direct.

### What Works
- What's strong about the resume as presented

### What to Fix
- Specific problems: gaps, weak bullet points, missing quantification, buzzwords, formatting concerns you can infer, keyword mismatches with the JD

### Specific Rewrites
- Take 2-3 specific bullet points or sections from their resume and show what a stronger version looks like. Format:
  - Current: [quote from resume]
  - Better: [rewritten version with numbers, action verbs, JD-aligned keywords]

### Missing Content to Add
- What experiences, projects, certifications, or skills should they consider adding based on the JD

---

## Coach's Final Take

One direct paragraph (3-4 sentences). What's the ONE thing they need to work on most before their real interview for this role?

---

BE SPECIFIC. Quote the transcript. Quote the resume. Don't give generic career advice — everything should be tied to what actually happened in this interview and what's actually on their resume against this specific JD.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500, headers: CORS_HEADERS });
  }

  try {
    const { transcript, jobDescription, resume, candidateName } = await request.json();
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
        max_tokens: 4000,
        temperature: 0.3,
        system: REPORT_PROMPT,
        messages: [
          {
            role: "user",
            content: `CANDIDATE: ${candidateName || "Candidate"}\n\nJOB DESCRIPTION:\n${jobDescription || "(not provided)"}\n\nRESUME:\n${resume || "(not provided)"}\n\nTRANSCRIPT:\n${transcript}`,
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
    const scoreMatch = report.match(/\*\*Score:\*\*\s*(\d+)\s*\/\s*100/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : null;

    return Response.json({ report, score }, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS_HEADERS });
  }
}
