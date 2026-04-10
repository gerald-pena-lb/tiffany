"use client";

import React, { useState, useEffect, useCallback } from "react";

interface Agent {
  id: string;
  name: string;
  code: string;
  created_at: string;
}

interface Conversation {
  id: string;
  agent_code: string;
  agent_name: string;
  prospect_name: string;
  started_at: string;
  last_stage: number;
  booked: boolean;
  ended_at: string | null;
  summary: string | null;
  transcript: string | null;
}

interface Stats {
  overall: { total: number; booked: number; conversionRate: string; avgStage: string };
  stageFunnel: number[];
  agentStats: Record<string, { name: string; conversations: number; booked: number; avgStage: number }>;
}

const STAGES = ["Connect", "Situation", "Problem", "Impact", "Wallet Test", "Book Call"];

export default function DataPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentCode, setNewAgentCode] = useState("");
  const [tab, setTab] = useState<"overview" | "agents" | "conversations">("overview");

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (username === "gerald" && password === "wakenbake") {
      setAuthed(true);
      setLoginError("");
    } else {
      setLoginError("Invalid credentials");
    }
  }

  const loadData = useCallback(async () => {
    const [agentsRes, convosRes, statsRes] = await Promise.all([
      fetch("/api/data/agents"),
      fetch("/api/data/conversations"),
      fetch("/api/data/stats"),
    ]);
    setAgents(await agentsRes.json());
    setConversations(await convosRes.json());
    setStats(await statsRes.json());
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  async function addAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!newAgentName || !newAgentCode) return;
    await fetch("/api/data/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newAgentName, code: newAgentCode }),
    });
    setNewAgentName("");
    setNewAgentCode("");
    loadData();
  }

  async function deleteAgent(code: string) {
    await fetch("/api/data/agents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    loadData();
  }

  async function deleteConversation(id: string) {
    await fetch("/api/data/conversations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-80 flex flex-col gap-4">
          <h1 className="text-gold text-xl font-light text-center mb-4">Tiffany Dashboard</h1>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-white/5 border border-gold/20 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-gold/50"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-white/5 border border-gold/20 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-gold/50"
          />
          {loginError && <p className="text-red-400 text-xs text-center">{loginError}</p>}
          <button
            type="submit"
            className="bg-gold/20 border border-gold/30 rounded-lg px-4 py-3 text-gold text-sm hover:bg-gold/30 transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-gold text-2xl font-light">Tiffany Dashboard</h1>
          <button onClick={loadData} className="text-gold/50 text-xs hover:text-gold transition-colors">
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-gold/10">
          {(["overview", "agents", "conversations"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize transition-colors ${
                tab === t ? "text-gold border-b-2 border-gold" : "text-gold/40 hover:text-gold/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {tab === "overview" && stats && (
          <div className="space-y-8">
            {/* Overall Stats */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total Calls", value: stats.overall.total },
                { label: "Booked", value: stats.overall.booked },
                { label: "Conversion", value: `${stats.overall.conversionRate}%` },
                { label: "Avg Stage", value: stats.overall.avgStage },
              ].map((s) => (
                <div key={s.label} className="bg-white/5 border border-gold/10 rounded-xl p-4">
                  <p className="text-gold/50 text-xs">{s.label}</p>
                  <p className="text-gold text-2xl font-light mt-1">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Stage Funnel */}
            <div className="bg-white/5 border border-gold/10 rounded-xl p-6">
              <h3 className="text-gold/70 text-sm mb-4">Stage Funnel</h3>
              <div className="space-y-2">
                {STAGES.map((name, i) => {
                  const count = stats.stageFunnel[i] || 0;
                  const maxCount = stats.stageFunnel[0] || 1;
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-gold/40 text-xs w-24">{name}</span>
                      <div className="flex-1 bg-white/5 rounded-full h-6 overflow-hidden">
                        <div
                          className="bg-gold/30 h-full rounded-full transition-all"
                          style={{ width: `${(count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-gold/60 text-xs w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per-Agent Stats */}
            <div className="bg-white/5 border border-gold/10 rounded-xl p-6">
              <h3 className="text-gold/70 text-sm mb-4">Agent Performance</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gold/40 text-xs">
                    <th className="text-left pb-3">Agent</th>
                    <th className="text-right pb-3">Calls</th>
                    <th className="text-right pb-3">Booked</th>
                    <th className="text-right pb-3">Rate</th>
                    <th className="text-right pb-3">Avg Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.agentStats).map(([code, s]) => (
                    <tr key={code} className="border-t border-gold/5">
                      <td className="py-2 text-gold/80">{s.name}</td>
                      <td className="py-2 text-right text-gold/60">{s.conversations}</td>
                      <td className="py-2 text-right text-gold/60">{s.booked}</td>
                      <td className="py-2 text-right text-gold/60">
                        {s.conversations > 0 ? ((s.booked / s.conversations) * 100).toFixed(0) : 0}%
                      </td>
                      <td className="py-2 text-right text-gold/60">{s.avgStage.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Agents Tab */}
        {tab === "agents" && (
          <div className="space-y-6">
            <form onSubmit={addAgent} className="flex gap-3">
              <input
                type="text"
                placeholder="Agent name"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                className="flex-1 bg-white/5 border border-gold/20 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-gold/50"
              />
              <input
                type="text"
                placeholder="Code"
                value={newAgentCode}
                onChange={(e) => setNewAgentCode(e.target.value)}
                className="w-24 bg-white/5 border border-gold/20 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-gold/50"
              />
              <button
                type="submit"
                className="bg-gold/20 border border-gold/30 rounded-lg px-4 py-2 text-gold text-sm hover:bg-gold/30 transition-colors"
              >
                Add
              </button>
            </form>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-gold/40 text-xs">
                  <th className="text-left pb-3">Name</th>
                  <th className="text-left pb-3">Code</th>
                  <th className="text-left pb-3">Link Format</th>
                  <th className="text-right pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} className="border-t border-gold/5">
                    <td className="py-3 text-gold/80">{a.name}</td>
                    <td className="py-3 text-gold/60">{a.code}</td>
                    <td className="py-3 text-gold/40 text-xs font-mono">?name=...&{a.code}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => deleteAgent(a.code)}
                        className="text-red-400/50 hover:text-red-400 text-xs transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {agents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-gold/30 text-sm">
                      No agents registered yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Conversations Tab */}
        {tab === "conversations" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gold/40 text-xs">
                  <th className="text-left pb-3">Prospect</th>
                  <th className="text-left pb-3">Agent</th>
                  <th className="text-left pb-3">Stage</th>
                  <th className="text-left pb-3">Booked</th>
                  <th className="text-left pb-3">Date</th>
                  <th className="text-right pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c) => (
                  <React.Fragment key={c.id}>
                  <tr
                    className="border-t border-gold/5 cursor-pointer hover:bg-gold/5 transition-colors"
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  >
                    <td className="py-2 text-gold/80">{c.prospect_name}</td>
                    <td className="py-2 text-gold/60">{c.agent_name}</td>
                    <td className="py-2">
                      <span className="text-gold/60">{c.last_stage}/6</span>
                      <span className="text-gold/30 text-xs ml-2">{STAGES[c.last_stage - 1]}</span>
                    </td>
                    <td className="py-2">
                      {c.booked ? (
                        <span className="text-green-400 text-xs">Yes</span>
                      ) : (
                        <span className="text-gold/30 text-xs">No</span>
                      )}
                    </td>
                    <td className="py-2 text-gold/40 text-xs">
                      {new Date(c.started_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                        className="text-red-400/50 hover:text-red-400 text-xs transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 bg-gold/5 space-y-4">
                        {c.summary && (
                          <div>
                            <p className="text-gold/50 text-[10px] uppercase tracking-wider mb-1">NEPQ Summary</p>
                            <pre className="text-gold/70 text-xs whitespace-pre-wrap font-sans leading-relaxed">{c.summary}</pre>
                          </div>
                        )}
                        {c.transcript && (
                          <div>
                            <p className="text-gold/50 text-[10px] uppercase tracking-wider mb-1">Transcript</p>
                            <pre className="text-gold/60 text-xs whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-y-auto">{c.transcript}</pre>
                          </div>
                        )}
                        {!c.summary && !c.transcript && (
                          <p className="text-gold/30 text-xs">No data yet — call may still be in progress</p>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
                {conversations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gold/30 text-sm">
                      No conversations yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
