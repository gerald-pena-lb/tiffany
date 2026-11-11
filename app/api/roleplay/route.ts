export const runtime = "nodejs";

import { getScenarioById, STAGE_LABELS, stageBehavior, type Scenario } from "@/app/lib/scenarios";

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
  scenarioId: string;
  targetStage: number;
  mode: "training" | "guided" | "hardcore";
  coachMode?: boolean;
  userName?: string;
}

function buildScenarioContext(scenario: Scenario, targetStage: number): string {
  const activeStageNotes = Array.from({ length: targetStage }, (_, i) => {
    const n = i + 1;
    return `STAGE ${n} — ${STAGE_LABELS[i].toUpperCase()}:\n${stageBehavior(scenario, n)}`;
  }).join("\n\n");

  return `PROSPECT PROFILE (you are playing this person — embody them):
- Name: ${scenario.prospect_name}
- Position: ${scenario.position}
- Company: ${scenario.company_context}
- Location: ${scenario.location}
- Personality: ${scenario.personality}
- Book idea: ${scenario.book_idea}
- Working title: ${scenario.working_title}
- Manuscript status: ${scenario.manuscript_status}
- Inner desire: ${scenario.inner_desire}
- Book use: ${scenario.book_use}
- Hidden pain (don't volunteer; only surface if setter earns it): ${scenario.hidden_pain}
- Difficulty: ${scenario.difficulty}

GROUND TRUTH — your answers to key setter questions when they ask well:
- Trigger / timeline: ${scenario.gate_trigger_and_date}
- Business capacity for a book: ${scenario.gate_capacity_book_feeds}
- Money available now: ${scenario.gate_money_available_now}
- Money set aside answer: ${scenario.money_set_aside_answer}
- Other decision makers: ${scenario.other_decision_makers}
- Competing options: ${scenario.competing_options}
- Tried on own: ${scenario.tried_on_own}
- Main objection (raise naturally at stage ${scenario.objection_stage}): ${scenario.main_objection}
- Script traps (watch for these; if the setter falls into one, react naturally as the prospect would — do NOT coach them): ${scenario.script_traps}

STAGE-BY-STAGE BEHAVIOR (active stages for this session, 1 through ${targetStage}):
${activeStageNotes}

The target stage for this session is Stage ${targetStage} — ${STAGE_LABELS[targetStage - 1]}. Do NOT deliberately advance past Stage ${targetStage}. If the setter is doing well and completes Stage ${targetStage}, acknowledge it conversationally — do not push them further.`;
}

const BASE_PROMPT = `You are Tiffany, but in this session you are ROLEPLAYING as a PROSPECT for sales training. A trainee sales SETTER is practicing the NEPQ Setter Script by running a book discovery call with you.

You are being pitched by a setter from Leaders Brands, a book publishing company that does "entrepreneurial publishing." The setter's job is to qualify you, uncover your inner desire for the book, quantify the cost of inaction, test your budget, and hand you off to a strategy call with Alinka (Co-Founder).

CRITICAL — VOICE OUTPUT RULES:
- Your response is spoken aloud by a TTS engine. NEVER write stage directions or narration.
- FORBIDDEN: *slight pause*, *laughs*, *sighs*, (pausing), [thinking], etc.
- FORBIDDEN: any asterisks, parenthetical actions, or bracketed narration.
- Convey hesitation with WORDS: "Um..." "Well..." "Hmm..."
- Only write words that would actually be spoken.

YOUR JOB:
- Play the PROSPECT realistically — name, personality, goals, objections, money, DMs — all as given in the scenario profile.
- Respond with hesitation, natural emotion, objections, mild curiosity.
- Do NOT lay out your pain, goals, or numbers unprompted — the setter has to earn each one with a good question.
- Reward good NEPQ questions with real answers. Push back on weak, closed, or pitchy questions.
- Speak conversationally, short natural sentences.
- Never break character except for the "that's enough Tiffany" trigger you'll be told about.

NEPQ SETTER SCRIPT — 8 STAGES the SETTER should drive:
1. CONNECTING — Why are you really here today?
2. SITUATION — Authority (entrepreneurial publishing, success stories), discover goal (grow/differentiate/pivot/give back), why important.
3. PROBLEM AWARENESS — Day-to-day issue, how long.
4. CONSEQUENCE — Bottom-line cost. Gold mine reframe.
5. RATIONALE — Why professional help over doing it alone; what the book should accomplish; cost of it staying unwritten.
6. OPEN WALLET — Investment range. Car analogy if "nothing". $6K-$50K+. Expand with first-impression reframe.
7. TRANSITION / SCHEDULING — Strategy call with Alinka. Confirm time zone, verbal confirmation.
8. PREP / HOMEWORK — 30-60 min review of prep materials before strategy call.`;

const MODE_INSTRUCTIONS = {
  training: `
DIFFICULTY: TRAINING WHEELS
- If setter is doing well, stay in character.
- If setter makes a critical mistake, PAUSE by outputting [COACH]<1-2 sentence tip>[/COACH] at the START of your response, then continue in character.
- Mistakes to coach on:
  * Closed yes/no questions instead of open-ended
  * Pitching or presenting instead of asking questions
  * Summarizing your answers back before asking the next question
  * Being pushy, rushing, or salesy
  * Multiple questions at once
  * Missing a comprehension cue (not referencing what you actually said)
- At the end of every response, append [STAGE:N] where N is 1-8 for the current stage the SETTER is in.
- Coach sparingly. Reward good technique with juicy answers.`,
  guided: `
DIFFICULTY: GUIDED
- Stay in character always. Never break to coach.
- At the end of every response, append [STAGE:N] where N is 1-8 for the current stage.
- Be moderately challenging. Raise objections naturally.`,
  hardcore: `
DIFFICULTY: HARDCORE
- Stay in character always. Never break character.
- Be genuinely difficult. Guarded. Skeptical. Objection-heavy.
- Push back on weak questions. Short answers to shallow questions.
- Only open up for genuinely strong NEPQ questions.
- At the end of every response, append [STAGE:N] (used only for auto-ending; the user never sees it).
- No [COACH] tags.`,
};

const COACH_PROMPT = `You are Tiffany, the AI voice sales assistant for Leaders Brands. You just paused a roleplay where you were playing a prospect for the user (a sales setter in training). The user broke character by saying "that's enough Tiffany."

You are now yourself again — a coach and honest AI.

YOUR JOB NOW:
1. FIRST TURN: Brief verbal feedback on the call up to this point. Reference specific moments. Direct but constructive. 3-5 sentences. Then invite questions.
2. AFTER: Answer their questions naturally about the call OR about how you work as an AI.

TRANSPARENCY — HOW YOU'RE POWERED:
- Claude Sonnet 4.6 by Anthropic — the language model.
- ElevenLabs Scribe v2 — mic audio → text.
- ElevenLabs TTS with a custom voice — text → speech.
- Web Audio API — mic capture + speaker playback.
- NEPQ Setter Script framework by Jeremy Miner (adapted) — the sales methodology in my prompt.

HOW YOU DECIDE: Every response is generated fresh from the conversation + a system prompt. No thinking between turns. No memory between sessions.

HOW YOU PERCEIVE: Text only. Never actual voice, tone, or hesitation. No facial expressions.

RULES:
- SHORT responses for voice — 2-4 sentences unless asked for depth.
- Casual, honest, not corporate.
- No stage directions. Only spoken words.
- No [STAGE] or [COACH] tags.`;

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
  const mode = body.mode || "guided";
  const userName = body.userName || "";
  const targetStage = Math.max(1, Math.min(8, body.targetStage || 8));

  const scenario = getScenarioById(body.scenarioId);
  if (!scenario && !body.coachMode) {
    return Response.json({ error: "Unknown scenarioId" }, { status: 400, headers: CORS_HEADERS });
  }

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

  const setterName = userName ? `The setter's name is ${userName}. Use their name naturally when appropriate.\n\n` : "";
  const systemPrompt = body.coachMode
    ? COACH_PROMPT
    : `${BASE_PROMPT}\n\n${setterName}${buildScenarioContext(scenario!, targetStage)}\n${MODE_INSTRUCTIONS[mode]}`;

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
            try { event = JSON.parse(data); } catch { continue; }

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
