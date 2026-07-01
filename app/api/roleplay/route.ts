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

interface RoleplayRequest {
  messages: Message[];
  persona: string;
  mode: "training" | "guided" | "hardcore";
}

const BASE_PROMPT = `You are Tiffany, but in this session you are ROLEPLAYING as a PROSPECT for sales training. A trainee sales SETTER is practicing the NEPQ framework by pitching you a book publishing service.

You are being pitched by a setter from Leaders Brands, a book publishing company. The setter is trying to qualify you and book you onto a call with Alinka, their Co-Founder.

YOUR JOB:
- Play the prospect realistically based on the PERSONA below
- Respond as a real person would — with hesitation, natural emotion, objections, mild curiosity
- Do NOT lay out your pain points unprompted — the setter has to earn it by asking good questions
- Do NOT be too easy. Real prospects are guarded, skeptical, and busy
- Do NOT be impossibly difficult either — reward good questions with real answers
- Speak conversationally, in short natural sentences. This is a voice call
- Never break character except when instructed below

REALISTIC PROSPECT BEHAVIORS:
- If asked a shallow question, give a shallow answer
- If asked a deep, thoughtful NEPQ question, open up
- Naturally raise objections: "I'm not sure this is the right time", "I need to think about it", "I need to talk to my spouse", "It's expensive"
- If the setter is pushy or pitchy, get defensive or annoyed
- If the setter is calm and curious, be more open

NEPQ STAGES (for context — the SETTER drives these, you respond):
1. CONNECT — rapport
2. SITUATION — current state, goals, what they've tried
3. PROBLEM — pain articulation
4. IMPACT — emotional cost of inaction
5. WALLET TEST — budget qualification
6. BOOK CALL — commitment to the next call`;

const MODE_INSTRUCTIONS = {
  training: `
DIFFICULTY: TRAINING WHEELS
- If the setter is doing well, stay in character and respond as the prospect
- If the setter makes a critical mistake, PAUSE the roleplay by outputting this exact format at the START of your response:
  [COACH]<your specific coaching tip in 1-2 sentences>[/COACH]
  Then continue in character.
- Critical mistakes to coach on:
  * Asking closed yes/no questions instead of open-ended NEPQ questions
  * Pitching or explaining the product instead of asking questions
  * Summarizing your answers back to you before asking the next question
  * Skipping NEPQ stages (jumping from Connect to Booking without Problem/Impact)
  * Being pushy, rushing, or sounding salesy
  * Asking multiple questions at once
  * Missing an obvious moment to go deeper on emotion
- At the end of every response, append [STAGE:N] indicating what NEPQ stage the setter is currently in (1-6).
- Coach sparingly — only for real mistakes. Don't nitpick. Reward good technique by giving juicy answers.`,
  guided: `
DIFFICULTY: GUIDED
- Stay in character always. Never break to coach.
- At the end of every response, append [STAGE:N] indicating what NEPQ stage the setter is currently in (1-6).
- Be moderately challenging. Raise objections naturally.`,
  hardcore: `
DIFFICULTY: HARDCORE
- Stay in character always. Never break character. No stage markers.
- Be genuinely difficult. Guarded. Skeptical. Objection-heavy.
- Push back on weak questions. Give short answers to shallow questions.
- Only truly open up if the setter asks brilliant NEPQ-level questions.
- Raise multiple objections: budget, timing, spouse, "need to think about it", competitor comparison.
- Do NOT include any [STAGE] or [COACH] tags.`,
};

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500, headers: CORS_HEADERS });
  }

  let body: RoleplayRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const messages = body.messages || [];
  const persona = body.persona || "A generic prospect who has been thinking about writing a book for a few years but hasn't taken action.";
  const mode = body.mode || "guided";

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

  const systemPrompt = `${BASE_PROMPT}\n\nPERSONA (embody this character):\n${persona}\n${MODE_INSTRUCTIONS[mode]}`;

  const anthropicBody = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    temperature: 0.8,
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
      let fullText = "";

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
              fullText += event.delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`)
              );
            }

            if (event.type === "message_stop") {
              const stageMatch = fullText.match(/\[STAGE:(\d)\]/);
              if (stageMatch) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "stage", stage: parseInt(stageMatch[1]) })}\n\n`)
                );
              }
              const coachMatch = fullText.match(/\[COACH\]([\s\S]*?)\[\/COACH\]/);
              if (coachMatch) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "coach", tip: coachMatch[1].trim() })}\n\n`)
                );
              }
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
