import { StackExpression, TargetClassification } from "../types/analysis";

const EIP1967_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc".toLowerCase();

export function classifyTarget(expr: StackExpression): TargetClassification {
  if (expr.kind === "Literal") {
    const v = normalize(expr.value);
    if (v.length === 40 || v.length === 42) {
      return {
        type: "hardcoded",
        addressLiteral: v
      };
    }
    return {
      type: "unknown",
      details: `literal(${v})`
    };
  }

  if (expr.kind === "Storage") {
    const slot = extractStorageSlotLiteral(expr.slotExpr);
    if (slot) {
      return {
        type: "storage",
        storageSlotLiteral: slot,
        details: slot.toLowerCase() === EIP1967_SLOT ? "EIP-1967 implementation slot" : undefined
      };
    }
    return {
      type: "storage",
      details: "non-literal storage slot"
    };
  }

  if (expr.kind === "Calldata") {
    return {
      type: "calldata",
      details: "derived from CALLDATALOAD"
    };
  }

  if (expr.kind === "Op") {
    return {
      type: "dynamic",
      details: `op(${expr.op})`
    };
  }

  return {
    type: "unknown"
  };
}

function normalize(v: string): string {
  const clean = v.startsWith("0x") ? v.slice(2) : v;
  return `0x${clean}`;
}

function extractStorageSlotLiteral(slotExpr: StackExpression): string | null {
  if (slotExpr.kind === "Literal") {
    return normalize(slotExpr.value);
  }
  return null;
}

