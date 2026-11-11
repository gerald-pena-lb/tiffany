import scenariosData from "./scenarios.json";

export interface Scenario {
  scenario_id: string;
  difficulty: "Easy" | "Medium" | "Hard";
  segment: string;
  prospect_name: string;
  position: string;
  company_context: string;
  location: string;
  book_idea: string;
  working_title: string;
  manuscript_status: string;
  personality: string;
  inner_desire: string;
  book_use: string;
  s1_connecting: string;
  s2_situation: string;
  s3_problem_awareness: string;
  s4_consequence: string;
  s5_rationale: string;
  s6_open_wallet: string;
  s7_transition_scheduling: string;
  s8_prep_homework: string;
  gate_trigger_and_date: string;
  gate_capacity_book_feeds: string;
  gate_money_available_now: string;
  money_set_aside_answer: string;
  other_decision_makers: string;
  competing_options: string;
  tried_on_own: string;
  hidden_pain: string;
  main_objection: string;
  objection_stage: string;
  script_traps: string;
  correct_scheduling_decision: string;
  setter_win_condition: string;
  handoff_note_answer_key: string;
  best_fit_offer: string;
  fit_level: string;
}

export const SCENARIOS: Scenario[] = scenariosData as Scenario[];

export const STAGE_LABELS = [
  "Connecting",
  "Situation",
  "Problem Awareness",
  "Consequence",
  "Rationale",
  "Open Wallet",
  "Transition / Scheduling",
  "Prep / Homework",
];

export function getScenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.scenario_id === id);
}

export function stageBehavior(scenario: Scenario, stage: number): string {
  const keys = [
    "s1_connecting",
    "s2_situation",
    "s3_problem_awareness",
    "s4_consequence",
    "s5_rationale",
    "s6_open_wallet",
    "s7_transition_scheduling",
    "s8_prep_homework",
  ] as const;
  return scenario[keys[stage - 1]];
}
