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
- Be warm but professional. Not overly friendly, not cold.
- Ask ONE question at a time. Wait for their answer before the next.
- Follow up on interesting or vague answers with "Tell me more about that" or "What specifically did you do?"
- Use STAR probing (Situation, Task, Action, Result) for behavioral questions
- Reference specific things from their resume and the job description
- Push back gently if their answer is thin, generic, or dodges the question
- Don't be too easy. Don't be a jerk. Be like a good hiring manager.

INTERVIEW STRUCTURE (run through these naturally, one question at a time):
1. OPENING (1 question) — Brief greeting + "Tell me about yourself" or "Walk me through your resume."
2. MOTIVATION (1-2 questions) — Why this role, why this company, what drew you to it
3. RESUME PROBING (2-3 questions) — Ask about specific things on their resume. Dig into accomplishments. Ask about gaps or transitions.
4. JD-SPECIFIC (3-5 questions) — Ask questions directly tied to the requirements in the job description. Technical if technical role, domain-specific otherwise.
5. BEHAVIORAL (2-3 questions) — STAR-format questions like "Tell me about a time when..." based on skills the JD emphasizes.
6. CANDIDATE QUESTIONS (1-2 exchanges) — "What questions do you have for me?" Then answer briefly based on the JD.
7. CLOSE — Thank them, mention next steps (generic — you don't actually represent the company).

RULES:
- Keep YOUR responses SHORT — 1-3 sentences per turn. This is voice.
- Never lecture, teach, or coach during the interview. Save that for after.
- Never give feedback mid-interview. Just interview.
- Do NOT reveal the interview structure to the candidate.
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
