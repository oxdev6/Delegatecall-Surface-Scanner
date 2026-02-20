import { StackExpression } from "../types/analysis";
import { BasicBlock, ControlFlowGraph, getBlockContaining } from "./cfg";
import { Opcode } from "../types/analysis";

export interface BlockState {
  stack: StackExpression[];
  memory: Map<number, StackExpression>; // Simplified memory model
}

function applyInstructionToStack(
  op: string,
  pushData: string | undefined,
  stack: StackExpression[]
): void {
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
    case "MLOAD": {
      pop(1); // offset
      stack.push({ kind: "Unknown" }); // Memory reads are complex, mark as unknown
      break;
    }
    case "MSTORE":
    case "MSTORE8": {
      pop(2); // offset, value
      break;
    }
    case "ADD":
    case "SUB":
    case "MUL":
    case "DIV":
    case "MOD":
    case "AND":
    case "OR":
    case "XOR":
    case "EQ":
    case "LT":
    case "GT":
    case "ISZERO": {
      const args = pop(op === "ISZERO" ? 1 : 2);
      stack.push({ kind: "Op", op, args });
      break;
    }
    case "POP": {
      pop(1);
      break;
    }
    default: {
      // For unmodelled ops, conservatively handle stack
      // This is approximate but keeps analysis tractable
      const info = getOpcodeInfo(op);
      if (info) {
        for (let i = 0; i < info.stackIn; i += 1) {
          pop(1);
        }
        for (let i = 0; i < info.stackOut; i += 1) {
          stack.push({ kind: "Unknown" });
        }
      }
    }
  }
}

function getOpcodeInfo(op: string): { stackIn: number; stackOut: number } | null {
  // Simplified opcode info - in production, use full opcode table
  const known: Record<string, { stackIn: number; stackOut: number }> = {
    STOP: { stackIn: 0, stackOut: 0 },
    ADD: { stackIn: 2, stackOut: 1 },
    MUL: { stackIn: 2, stackOut: 1 },
    SUB: { stackIn: 2, stackOut: 1 },
    DIV: { stackIn: 2, stackOut: 1 },
    MOD: { stackIn: 2, stackOut: 1 },
    AND: { stackIn: 2, stackOut: 1 },
    OR: { stackIn: 2, stackOut: 1 },
    XOR: { stackIn: 2, stackOut: 1 },
    EQ: { stackIn: 2, stackOut: 1 },
    LT: { stackIn: 2, stackOut: 1 },
    GT: { stackIn: 2, stackOut: 1 },
    ISZERO: { stackIn: 1, stackOut: 1 },
    CALLDATALOAD: { stackIn: 1, stackOut: 1 },
    CALLDATASIZE: { stackIn: 0, stackOut: 1 },
    SLOAD: { stackIn: 1, stackOut: 1 },
    SSTORE: { stackIn: 2, stackOut: 0 },
    JUMP: { stackIn: 1, stackOut: 0 },
    JUMPI: { stackIn: 2, stackOut: 0 },
    DELEGATECALL: { stackIn: 6, stackOut: 1 },
    CALL: { stackIn: 7, stackOut: 1 },
    STATICCALL: { stackIn: 6, stackOut: 1 }
  };

  return known[op] ?? null;
}

export function simulateBlock(
  block: BasicBlock,
  initialState: BlockState
): BlockState {
  const state: BlockState = {
    stack: [...initialState.stack],
    memory: new Map(initialState.memory)
  };

  for (const instr of block.instructions) {
    applyInstructionToStack(instr.op, instr.pushData, state.stack);
  }

  return state;
}

function joinStates(state1: BlockState, state2: BlockState): BlockState {
  // Simple join: if stacks differ in length or content, mark as unknown
  // More sophisticated joins would use abstract domains
  if (state1.stack.length !== state2.stack.length) {
    return {
      stack: state1.stack.map(() => ({ kind: "Unknown" as const })),
      memory: new Map()
    };
  }

  const joinedStack: StackExpression[] = [];
  for (let i = 0; i < state1.stack.length; i += 1) {
    const expr1 = state1.stack[i];
    const expr2 = state2.stack[i];
    if (!expr1 || !expr2) {
      joinedStack.push({ kind: "Unknown" });
      continue;
    }

    // If expressions are identical (by structure), keep; otherwise mark unknown
    if (JSON.stringify(expr1) === JSON.stringify(expr2)) {
      joinedStack.push(expr1);
    } else {
      joinedStack.push({ kind: "Unknown" });
    }
  }

  return {
    stack: joinedStack,
    memory: new Map()
  };
}

export function traceStackAtPC(
  cfg: ControlFlowGraph,
  targetPc: number
): StackExpression[] {
  const targetBlock = getBlockContaining(cfg.blocks, targetPc);
  if (!targetBlock) {
    return [];
  }

  // Worklist algorithm for fixed-point iteration
  const worklist: number[] = [targetBlock.startPc];
  const states = new Map<number, BlockState>();

  // Initialize entry block
  if (cfg.entryBlock) {
    states.set(cfg.entryBlock.startPc, {
      stack: [],
      memory: new Map()
    });
  }

  while (worklist.length > 0) {
    const blockPc = worklist.shift();
    if (blockPc === undefined) continue;

    const block = cfg.blocks.get(blockPc);
    if (!block) continue;

    // Get initial state by joining predecessors
    let initialState: BlockState = {
      stack: [],
      memory: new Map()
    };

    if (block.predecessors.length === 0) {
      // Entry block
      initialState = states.get(blockPc) ?? initialState;
    } else {
      // Join predecessor states
      const predStates = block.predecessors
        .map((predPc) => states.get(predPc))
        .filter((s): s is BlockState => s !== undefined);

      if (predStates.length > 0) {
        initialState = predStates.reduce((acc, s) => joinStates(acc, s), predStates[0] ?? initialState);
      }
    }

    // Simulate block
    const finalState = simulateBlock(block, initialState);

    // Check if state changed
    const oldState = states.get(blockPc);
    const changed =
      !oldState ||
      JSON.stringify(oldState.stack) !== JSON.stringify(finalState.stack);

    if (changed) {
      states.set(blockPc, finalState);

      // Add successors to worklist
      for (const succPc of block.successors) {
        if (!worklist.includes(succPc)) {
          worklist.push(succPc);
        }
      }
    }
  }

  // Find the instruction within the target block
  const targetInstr = targetBlock.instructions.find((instr) => instr.pc === targetPc);
  if (!targetInstr) {
    return [];
  }

  // Simulate up to the target instruction
  const blockState = states.get(targetBlock.startPc);
  if (!blockState) {
    return [];
  }

  const localState: BlockState = {
    stack: [...blockState.stack],
    memory: new Map(blockState.memory)
  };

  for (const instr of targetBlock.instructions) {
    if (instr.pc === targetPc) {
      break;
    }
    applyInstructionToStack(instr.op, instr.pushData, localState.stack);
  }

  return localState.stack;
}
