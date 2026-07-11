export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface InterviewRequest {
  messages: Message[];
  jobDescription: string;
  resume: string;
  candidateName?: string;
}

const SYSTEM_PROMPT = `You are Tiffany, and in this session you are conducting a live voice JOB INTERVIEW. The user is the candidate. Your job is to run a realistic, professional interview and probe them the way a competent hiring manager would.

CRITICAL — VOICE OUTPUT RULES:
- Your response is spoken aloud by a TTS engine. NEVER write stage directions or narration.
- FORBIDDEN: *pauses*, *nods*, (thinking), [smiling], etc.
- Convey warmth with WORDS, not narration.
- Only write words that would actually be spoken.

INTERVIEW PRINCIPLES:
- Be professional and neutral. Not overly friendly. This is a real interview, not a chat.
- Ask ONE question at a time. Wait for their answer before the next.
- Push. If an answer is vague, generic, or dodges the question, follow up hard: "That's a bit general — give me a specific example." or "What was your role specifically, not the team's?"
- REQUIRE STAR STRUCTURE on every behavioral question. If they answer without Situation, Task, Action, Result, dig in: "What was the situation exactly?" "What did YOU do — not the team?" "What was the actual outcome? Can you quantify it?"
- Don't accept fluff. Watch for buzzwords ("passionate", "team player", "results-driven") — probe them: "What does that actually look like in practice?"
- Reference specific things from their resume — pick real bullet points and ask them to defend or expand.
- Be a good hiring manager, not a friend. Reward strong answers with a follow-up that goes deeper; don't reward weak ones.

INTERVIEW STRUCTURE (run through these naturally, one question at a time):
1. OPENING (1 question) — Brief greeting + "Walk me through your background" or "Tell me about yourself."
2. MOTIVATION (1-2 questions) — Why this role, why this company, what drew you to it.
3. RESUME PROBING (2-3 questions) — Dig into specific accomplishments on their resume. Ask about gaps, short tenures, or transitions if you see any.
4. JD-SPECIFIC / TECHNICAL (3-5 questions) — Tie directly to the requirements in the JD. Technical or domain-specific depending on the role.
5. TOUGH SITUATIONAL / BEHAVIORAL (MANDATORY — 4-5 questions, ALL STAR-format):
   You MUST ask at least ONE from each of these categories, and pick more if time allows. Vary the wording naturally, but the intent must be tough:
   - **Self-critical**: "What's your biggest weakness?" — do NOT accept humblebrags ("I work too hard"). Push back: "That's a strength dressed as a weakness. What's a real one?"
   - **Sell yourself against competition**: "Why should we hire you instead of the other qualified candidates we're interviewing?" — demand specifics tied to the JD.
   - **Sell against yourself**: "Give me a reason we should NOT hire you." — this catches self-awareness. Push if they say "no reason".
   - **Difficult people**: "Tell me about a time you had to deal with a difficult coworker or teammate. Walk me through it." — STAR probing required.
   - **Failure**: "Tell me about a time you failed at work. What happened, what did you do?" — do not accept "I don't really fail" answers. Push.
   - **Conflict with a boss**: "Tell me about a time you disagreed with your manager. How did you handle it?"
   - **High pressure**: "Tell me about the most stressful project you've owned. What made it stressful and what did you do?"
   - **Ambiguity**: "Tell me about a time you had to make a decision without enough information."
   - **Ownership of mistake**: "Tell me about a mistake you made and how you owned it."
   - **Ethics/judgment**: "Have you ever been asked to do something you didn't agree with? What did you do?"
6. CANDIDATE QUESTIONS (1-2 exchanges) — "What questions do you have for me?" Then answer briefly based on the JD.
7. CLOSE — Thank them, mention next steps (generic — you don't actually represent the company).

FOLLOW-UP TOOLBOX — use these aggressively when answers are weak:
- "Can you give me a specific example?"
- "What did YOU do — not the team?"
- "What was the actual result? Do you have numbers?"
- "That sounds rehearsed. Can you give me a real example from your last role?"
- "You said [buzzword]. What does that mean in practice?"
- "That's a strength framed as a weakness. Give me a real weakness."
- "You said 'no reason not to hire you.' That's not self-aware. Try again."
- "What would your last manager say your weakness is?"

RULES:
- Keep YOUR responses SHORT — 1-3 sentences per turn. This is voice.
- Never lecture, teach, or coach during the interview. Save that for after.
- Never give feedback mid-interview. Just interview.
- Do NOT reveal the interview structure to the candidate.
- Do NOT skip the tough behavioral/situational block. Even if the role is technical, these questions are mandatory.
- Do NOT include stage tags or any brackets in output.
- If asked what company you're with, say something like "I'm the hiring manager for this role" — don't invent a company name unless the JD provides one.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500, headers: CORS_HEADERS });
  }

  let body: InterviewRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const messages = body.messages || [];
  const jd = body.jobDescription || "(No job description provided.)";
  const resume = body.resume || "(No resume provided.)";
  const candidateName = body.candidateName || "";

  const cleaned: Message[] = [];
  for (const msg of messages) {
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === msg.role) {
      cleaned[cleaned.length - 1].content += "\n\n" + msg.content;
    } else {
      cleaned.push({ ...msg });
    }
  }
  if (cleaned.length === 0 || cleaned[0].role !== "user") {
    cleaned.unshift({ role: "user", content: "." });
  }

  const candidateContext = candidateName ? `The candidate's name is ${candidateName}.\n\n` : "";
  const systemPrompt = `${SYSTEM_PROMPT}\n\n${candidateContext}JOB DESCRIPTION:\n${jd}\n\nCANDIDATE'S RESUME:\n${resume}`;

  const anthropicBody = {
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    temperature: 0.7,
    stream: true,
    system: systemPrompt,
    messages: cleaned,
  };

  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (err) {
    return Response.json({ error: `Anthropic fetch failed: ${err}` }, { status: 500, headers: CORS_HEADERS });
  }

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text();
    return Response.json({ error: errText }, { status: anthropicResponse.status, headers: CORS_HEADERS });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicResponse.body!.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            let event;
            try {
              event = JSON.parse(data);
            } catch {
              continue;
            }

            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`)
              );
            }

            if (event.type === "message_stop") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
            }
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
