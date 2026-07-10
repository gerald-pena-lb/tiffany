"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Session {
  id: string;
  user_name: string;
  persona: string | null;
  mode: string;
  score: number | null;
  created_at: string;
}

export default function TrainingListPage() {
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (username === "gerald" && password === "wakenbake") {
      setAuthed(true);
      setLoginError("");
    } else {
      setLoginError("Invalid credentials");
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/training/list");
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setSessions([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this session?")) return;
    await fetch("/api/training/list", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-80 flex flex-col gap-4">
          <h1 className="text-gray-800 text-xl font-light text-center mb-4">Training Sessions</h1>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-gray-700 text-sm focus:outline-none focus:border-gold/50 shadow-sm"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-gray-700 text-sm focus:outline-none focus:border-gold/50 shadow-sm"
          />
          {loginError && <p className="text-red-500 text-xs text-center">{loginError}</p>}
          <button
            type="submit"
            className="bg-gold/90 hover:bg-gold rounded-lg px-4 py-3 text-white text-sm transition-colors shadow-sm"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-gray-800 text-2xl font-light">Training Sessions</h1>
          <div className="flex items-center gap-4">
            <Link href="/?train" className="text-gray-500 hover:text-gold text-sm transition-colors">
              New Session →
            </Link>
            <button onClick={load} className="text-gray-400 text-xs hover:text-gold transition-colors">
              Refresh
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs bg-gray-50">
                <th className="text-left p-3">Setter</th>
                <th className="text-left p-3">Mode</th>
                <th className="text-left p-3">Persona</th>
                <th className="text-right p-3">Score</th>
                <th className="text-left p-3">Date</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-300 text-sm">Loading...</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-300 text-sm">No sessions yet</td></tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-3 text-gray-700 font-medium">{s.user_name}</td>
                    <td className="p-3 text-gray-500 text-xs capitalize">{s.mode}</td>
                    <td className="p-3 text-gray-500 text-xs max-w-md truncate">
                      {s.persona || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="p-3 text-right">
                      {s.score !== null ? (
                        <span className={`text-sm font-medium ${
                          s.score >= 90 ? "text-green-600" :
                          s.score >= 75 ? "text-gray-700" :
                          s.score >= 60 ? "text-yellow-600" :
                          "text-red-500"
                        }`}>
                          {s.score}/100
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-400 text-xs">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Link
                        href={`/data/training/${s.id}`}
                        className="text-gold hover:text-gold/80 text-xs transition-colors mr-3"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-red-400 hover:text-red-500 text-xs transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
