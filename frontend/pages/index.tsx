import { FormEvent, useState } from "react";
import axios from "axios";

type RiskLevel = "low" | "medium" | "high" | "unknown";

interface Site {
  id: string;
  pc: number;
  classification: {
    type: string;
    addressLiteral?: string;
    storageSlotLiteral?: string;
    details?: string;
  };
  pattern?: {
    name: string;
    description: string;
  } | null;
  risk: RiskLevel;
  notes?: string[];
}

interface Report {
  contractAddress?: string;
  network?: string;
  bytecodeHash: string;
  delegatecallCount: number;
  overallRisk?: RiskLevel;
  sites: Site[];
  proxiesDetected: { name: string; count: number }[];
  graph?: {
    nodes: { id: string; label: string; kind: string }[];
    edges: {
      id: string;
      from: string;
      to: string;
      label?: string;
      siteId: string;
      risk: RiskLevel;
    }[];
  };
}

export default function HomePage() {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("mainnet");
  const [bytecode, setBytecode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const payload =
        bytecode.trim().length > 0
          ? { bytecode: bytecode.trim() }
          : { address: address.trim(), network };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await axios.post<Report>(`${apiUrl}/analyze`, payload);
      setReport(res.data);
    } catch (err) {
      const message =
        (err as any)?.response?.data?.error || (err as Error).message || "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">
            Delegatecall Surface Scanner
          </h1>
          <p className="text-slate-400 max-w-2xl">
            Analyze EVM bytecode for <code>DELEGATECALL</code> surfaces, proxy patterns, and risk
            levels. Built for auditors and protocol teams.
          </p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-1">
            <form
              onSubmit={handleSubmit}
              className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4"
            >
              <h2 className="text-lg font-medium mb-1">Scan configuration</h2>
              <p className="text-xs text-slate-400 mb-3">
                Provide either a contract address + network or raw bytecode. Bytecode takes
                precedence if both are provided.
              </p>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-200">Contract address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-200">Network</label>
                <select
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="mainnet">Mainnet</option>
                  <option value="sepolia">Sepolia</option>
                  <option value="holesky">Holesky</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-200">Raw bytecode (optional)</label>
                <textarea
                  value={bytecode}
                  onChange={(e) => setBytecode(e.target.value)}
                  placeholder="0x600035..."
                  rows={5}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Analyzing…" : "Run scan"}
              </button>

              {error && <p className="text-xs text-red-400 pt-1">Error: {error}</p>}
            </form>
          </section>

          <section className="lg:col-span-2 space-y-4">
            {!report && !loading && !error && (
              <div className="text-sm text-slate-400">
                No scan yet. Submit an address or bytecode to generate an execution surface report.
              </div>
            )}

            {loading && (
              <div className="text-sm text-slate-300">Analyzing bytecode, please wait…</div>
            )}

            {report && (
              <>
                <ReportSummary report={report} />
                <DelegateTable sites={report.sites} />
                <ExecutionGraph graph={report.graph} />
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function ReportSummary({ report }: { report: Report }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
          Delegatecall Sites
        </div>
        <div className="text-2xl font-semibold">{report.delegatecallCount}</div>
        {report.overallRisk && (
          <div className="mt-2 text-xs text-slate-300">
            Overall risk:{" "}
            <span
              className={
                report.overallRisk === "high"
                  ? "text-red-400"
                  : report.overallRisk === "medium"
                  ? "text-amber-300"
                  : "text-emerald-300"
              }
            >
              {report.overallRisk.toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Bytecode Hash</div>
        <div className="text-xs font-mono break-all text-slate-300">{report.bytecodeHash}</div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Proxy Patterns</div>
        {report.proxiesDetected.length === 0 ? (
          <div className="text-sm text-slate-400">None detected</div>
        ) : (
          <ul className="text-sm text-slate-200 space-y-1">
            {report.proxiesDetected.map((p) => (
              <li key={p.name}>
                {p.name} <span className="text-slate-400 text-xs">({p.count} site)</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DelegateTable({ sites }: { sites: Site[] }) {
  if (sites.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
        No delegatecall instructions were found in this bytecode.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/80 border-b border-slate-800">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-slate-300">Site</th>
            <th className="px-4 py-2 text-left font-medium text-slate-300">Target</th>
            <th className="px-4 py-2 text-left font-medium text-slate-300">Pattern</th>
            <th className="px-4 py-2 text-left font-medium text-slate-300">Risk</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((site, idx) => (
            <tr key={site.id} className="border-t border-slate-800/60">
              <td className="px-4 py-2 align-top">
                <div className="font-medium text-slate-100">Site #{idx + 1}</div>
                <div className="text-xs text-slate-400">pc 0x{site.pc.toString(16)}</div>
              </td>
              <td className="px-4 py-2 align-top">
                <div className="text-slate-100 text-xs uppercase tracking-wide">
                  {site.classification.type}
                </div>
                {site.classification.addressLiteral && (
                  <div className="text-xs text-slate-300 font-mono break-all">
                    {site.classification.addressLiteral}
                  </div>
                )}
                {site.classification.storageSlotLiteral && (
                  <div className="text-xs text-slate-300 font-mono break-all">
                    slot {site.classification.storageSlotLiteral}
                  </div>
                )}
                {site.classification.details && (
                  <div className="text-xs text-slate-400">{site.classification.details}</div>
                )}
              </td>
              <td className="px-4 py-2 align-top">
                {site.pattern ? (
                  <>
                    <div className="text-xs font-medium text-slate-100">{site.pattern.name}</div>
                    <div className="text-xs text-slate-400">{site.pattern.description}</div>
                  </>
                ) : (
                  <span className="text-xs text-slate-500">None</span>
                )}
              </td>
              <td className="px-4 py-2 align-top">
                <RiskBadge risk={site.risk} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const theme =
    risk === "high"
      ? "bg-red-500/10 text-red-300 border-red-500/40"
      : risk === "medium"
      ? "bg-amber-500/10 text-amber-300 border-amber-500/40"
      : risk === "low"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
      : "bg-slate-700/40 text-slate-200 border-slate-600";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${theme}`}
    >
      {risk.toUpperCase()}
    </span>
  );
}

function ExecutionGraph({
  graph
}: {
  graph: Report["graph"];
}) {
  if (!graph || graph.edges.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
      <div className="text-sm font-medium text-slate-100 mb-1">Execution Graph</div>
      <p className="text-xs text-slate-400 mb-2">
        High-level view of delegatecall flows from the analyzed contract to implementation or
        storage-driven targets.
      </p>
      <div className="max-h-64 overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-900/80 border-b border-slate-800">
            <tr>
              <th className="px-3 py-1 text-left font-medium text-slate-300">From</th>
              <th className="px-3 py-1 text-left font-medium text-slate-300">To</th>
              <th className="px-3 py-1 text-left font-medium text-slate-300">Label</th>
              <th className="px-3 py-1 text-left font-medium text-slate-300">Risk</th>
            </tr>
          </thead>
          <tbody>
            {graph.edges.map((edge) => (
              <tr key={edge.id} className="border-t border-slate-800/60">
                <td className="px-3 py-1 font-mono text-slate-300 truncate max-w-[140px]">
                  {edge.from}
                </td>
                <td className="px-3 py-1 font-mono text-slate-300 truncate max-w-[140px]">
                  {edge.to}
                </td>
                <td className="px-3 py-1 text-slate-200">
                  {edge.label ?? "DELEGATECALL"}
                </td>
                <td className="px-3 py-1">
                  <RiskBadge risk={edge.risk} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

