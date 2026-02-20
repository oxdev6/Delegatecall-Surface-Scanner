export type RiskLevel = "low" | "medium" | "high" | "unknown";

export type StackExpression =
  | { kind: "Literal"; value: string }
  | { kind: "Storage"; slotExpr: StackExpression }
  | { kind: "Calldata"; offsetExpr: StackExpression }
  | { kind: "Environment"; source: "CALLER" | "ADDRESS" | "ORIGIN" }
  | { kind: "Op"; op: string; args: StackExpression[] }
  | { kind: "Unknown" };

export interface Opcode {
  pc: number;
  op: string;
  pushData?: string;
  stackIn: number;
  stackOut: number;
}

export interface DelegatecallSite {
  id: string;
  pc: number;
  blockId: string;
  targetExpression: StackExpression;
  classification: TargetClassification;
  patternMatch?: ProxyPatternMatch | null;
}

export type TargetType = "hardcoded" | "storage" | "calldata" | "dynamic" | "unknown";

export interface TargetClassification {
  type: TargetType;
  addressLiteral?: string;
  storageSlotLiteral?: string;
  details?: string;
}

export interface ProxyPatternMatch {
  name: string;
  description: string;
}

export interface ProxyPatternSummary {
  name: string;
  count: number;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: "contract" | "implementation" | "facet" | "unknown";
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  siteId: string;
  risk: RiskLevel;
}

export interface GraphOutput {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DelegatecallSurfaceReport {
  contractAddress?: string;
  network?: string;
  bytecodeHash: string;
  delegatecallCount: number;
  overallRisk?: RiskLevel;
  sites: Array<{
    id: string;
    pc: number;
    classification: TargetClassification;
    pattern?: ProxyPatternMatch | null;
    risk: RiskLevel;
    notes?: string[];
  }>;
  proxiesDetected: ProxyPatternSummary[];
  graph?: GraphOutput;
}

