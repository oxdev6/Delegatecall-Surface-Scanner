import crypto from "crypto";
import {
  DelegatecallSite,
  DelegatecallSurfaceReport,
  RiskLevel,
  StackExpression,
  TargetClassification,
  TargetType
} from "../types/analysis";
import { buildCFG, getBlockContaining } from "./cfg";
import { decodeBytecode } from "./opcodes";
import { classifyTarget } from "./targetClassifier";
import { detectProxyPatterns, summarizeProxyPatterns } from "./proxyPatterns";
import { traceStackAtPC } from "./stackTracer";
import { generateGraph } from "./graphGenerator";

interface ScanOptions {
  contractAddress?: string;
  network?: string;
  useCFG?: boolean; // Enable CFG-based analysis (more accurate but slower)
}

export function analyzeBytecode(bytecode: string, opts: ScanOptions = {}): DelegatecallSurfaceReport {
  const instructions = decodeBytecode(bytecode);
  const useCFG = opts.useCFG !== false; // Default to true for better accuracy

  const sites: DelegatecallSite[] = [];

  if (useCFG) {
    // CFG-based analysis: more accurate for complex control flow
    const cfg = buildCFG(instructions);

    for (const instr of instructions) {
      if (instr.op === "DELEGATECALL") {
        // Trace stack backwards through CFG
        const stack = traceStackAtPC(cfg, instr.pc);

        // DELEGATECALL(gas, to, inOffset, inSize, outOffset, outSize)
        // Target address is at stack[-2] (second from top)
        const idx = stack.length - 2;
        const targetExpr: StackExpression = idx >= 0 ? stack[idx] : { kind: "Unknown" };

        const classification = classifyTarget(targetExpr);
        const block = getBlockContaining(cfg.blocks, instr.pc);

        const site: DelegatecallSite = {
          id: `site-${instr.pc}`,
          pc: instr.pc,
          blockId: block?.id ?? `block-${instr.pc}`,
          targetExpression: targetExpr,
          classification,
          patternMatch: null
        };

        sites.push(site);
      }
    }
  } else {
    // Linear analysis: faster but less accurate for complex control flow
    const stack: StackExpression[] = [];

    for (const instr of instructions) {
      applyInstructionToStack(instr.op, instr.pushData, stack);

      if (instr.op === "DELEGATECALL") {
        const idx = stack.length - 2;
        const targetExpr: StackExpression = idx >= 0 ? stack[idx] : { kind: "Unknown" };

        const classification = classifyTarget(targetExpr);

        const site: DelegatecallSite = {
          id: `site-${instr.pc}`,
          pc: instr.pc,
          blockId: "linear",
          targetExpression: targetExpr,
          classification,
          patternMatch: null
        };

        sites.push(site);
      }
    }
  }

  // Pattern detection (proxy, minimal proxy, diamond, etc.)
  const enrichedSites = detectProxyPatterns(bytecode, sites);

  const reportSites = enrichedSites.map((s) => ({
    id: s.id,
    pc: s.pc,
    classification: s.classification,
    pattern: s.patternMatch ?? null,
    risk: classifyRisk(s.classification, s.patternMatch),
    notes: []
  }));

  const overallRisk: RiskLevel | undefined =
    reportSites.length > 0
      ? reportSites
          .map((s) => s.risk)
          .reduce<RiskLevel>((acc, r) => {
            const order: RiskLevel[] = ["low", "medium", "high", "unknown"];
            return order.indexOf(r) > order.indexOf(acc) ? r : acc;
          }, "low")
      : undefined;

  // Generate graph output
  const graph = generateGraph(opts.contractAddress, enrichedSites);

  const report: DelegatecallSurfaceReport = {
    contractAddress: opts.contractAddress,
    network: opts.network,
    bytecodeHash: crypto.createHash("sha256").update(bytecode).digest("hex"),
    delegatecallCount: sites.length,
    overallRisk,
    sites: reportSites,
    proxiesDetected: summarizeProxyPatterns(enrichedSites),
    graph
  };

  return report;
}

function applyInstructionToStack(op: string, pushData: string | undefined, stack: StackExpression[]): void {
  const pop = (n: number): StackExpression[] => {
    const res: StackExpression[] = [];
    for (let i = 0; i < n; i += 1) {
      res.unshift(stack.pop() ?? { kind: "Unknown" });
    }
    return res;
  };

  if (op.startsWith("PUSH")) {
    const value = pushData ?? "0x";
    stack.push({ kind: "Literal", value });
    return;
  }

  if (op.startsWith("DUP")) {
    const n = parseInt(op.slice(3), 10);
    const idx = stack.length - n;
    stack.push(idx >= 0 ? stack[idx] : { kind: "Unknown" });
    return;
  }

  if (op.startsWith("SWAP")) {
    const n = parseInt(op.slice(4), 10);
    const top = stack.length - 1;
    const other = stack.length - 1 - n;
    if (top >= 0 && other >= 0) {
      const tmp = stack[top];
      stack[top] = stack[other];
      stack[other] = tmp;
    }
    return;
  }

  switch (op) {
    case "CALLDATALOAD": {
      const [offsetExpr] = pop(1);
      stack.push({ kind: "Calldata", offsetExpr });
      break;
    }
    case "SLOAD": {
      const [slotExpr] = pop(1);
      stack.push({ kind: "Storage", slotExpr });
      break;
    }
    case "CALLER": {
      stack.push({ kind: "Environment", source: "CALLER" });
      break;
    }
    case "ADDRESS": {
      stack.push({ kind: "Environment", source: "ADDRESS" });
      break;
    }
    case "ORIGIN": {
      stack.push({ kind: "Environment", source: "ORIGIN" });
      break;
    }
    case "ADD":
    case "SUB":
    case "MUL":
    case "DIV":
    case "AND":
    case "OR":
    case "XOR":
    case "EQ":
    case "LT":
    case "GT": {
      const args = pop(2);
      stack.push({ kind: "Op", op, args });
      break;
    }
    default: {
      // For unknown / unmodelled ops, conservatively pop the declared inputs
      // This is approximate but keeps stack height sane.
      // eslint-disable-next-line no-param-reassign
      stack.length = Math.max(0, stack.length - 1);
    }
  }
}

function classifyRisk(classification: TargetClassification, pattern: { name: string } | null | undefined): RiskLevel {
  const type: TargetType = classification.type;

  if (type === "hardcoded") {
    if (pattern && pattern.name === "EIP-1167") {
      return "medium";
    }
    return "low";
  }

  if (type === "storage") {
    if (pattern && (pattern.name === "EIP-1967" || pattern.name === "UUPS" || pattern.name === "Diamond")) {
      return "medium";
    }
    return "medium";
  }

  if (type === "calldata") {
    return "high";
  }

  if (type === "dynamic") {
    return "high";
  }

  return "unknown";
}

