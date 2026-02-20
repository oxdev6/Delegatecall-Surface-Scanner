import { Opcode } from "../types/analysis";

export interface BasicBlock {
  id: string;
  startPc: number;
  endPc: number;
  instructions: Opcode[];
  successors: number[]; // PC addresses of successor blocks
  predecessors: number[]; // PC addresses of predecessor blocks
}

export interface ControlFlowGraph {
  blocks: Map<number, BasicBlock>; // keyed by startPc
  entryBlock: BasicBlock | null;
}

const TERMINATORS = new Set([
  "STOP",
  "RETURN",
  "REVERT",
  "SELFDESTRUCT",
  "JUMP",
  "JUMPI"
]);

export function buildCFG(instructions: Opcode[]): ControlFlowGraph {
  const blocks = new Map<number, BasicBlock>();
  const jumpTargets = new Set<number>();
  const leaders = new Set<number>([0]); // First instruction is always a leader

  // First pass: identify leaders (jump targets and instructions after jumps)
  for (let i = 0; i < instructions.length; i += 1) {
    const instr = instructions[i];
    if (!instr) continue;

    if (instr.op === "JUMPDEST") {
      leaders.add(instr.pc);
      jumpTargets.add(instr.pc);
    }

    if (TERMINATORS.has(instr.op)) {
      const nextPc = instructions[i + 1]?.pc;
      if (nextPc !== undefined) {
        leaders.add(nextPc);
      }
    }
  }

  // Second pass: build basic blocks
  const sortedLeaders = Array.from(leaders).sort((a, b) => a - b);

  for (let i = 0; i < sortedLeaders.length; i += 1) {
    const startPc = sortedLeaders[i] ?? 0;
    const endPc = i + 1 < sortedLeaders.length ? (sortedLeaders[i + 1] ?? 0) - 1 : instructions.length - 1;

    const blockInstrs: Opcode[] = [];
    for (const instr of instructions) {
      if (instr.pc >= startPc && instr.pc <= endPc) {
        blockInstrs.push(instr);
      }
    }

    const block: BasicBlock = {
      id: `block-${startPc}`,
      startPc,
      endPc,
      instructions: blockInstrs,
      successors: [],
      predecessors: []
    };

    blocks.set(startPc, block);
  }

  // Third pass: connect blocks (build edges)
  for (const block of blocks.values()) {
    const lastInstr = block.instructions[block.instructions.length - 1];
    if (!lastInstr) continue;

    if (lastInstr.op === "JUMP") {
      // Unconditional jump - target is on stack, we can't statically determine it
      // For now, mark as having unknown successors (could be improved with constant propagation)
    } else if (lastInstr.op === "JUMPI") {
      // Conditional jump - fallthrough + jump target
      const nextPc = instructions.find((instr) => instr.pc > lastInstr.pc)?.pc;
      if (nextPc !== undefined) {
        const nextBlock = findBlockContaining(blocks, nextPc);
        if (nextBlock) {
          block.successors.push(nextBlock.startPc);
          nextBlock.predecessors.push(block.startPc);
        }
      }
      // Jump target would be on stack - mark as unknown for now
    } else if (!TERMINATORS.has(lastInstr.op)) {
      // Fallthrough
      const nextPc = instructions.find((instr) => instr.pc > lastInstr.pc)?.pc;
      if (nextPc !== undefined) {
        const nextBlock = findBlockContaining(blocks, nextPc);
        if (nextBlock) {
          block.successors.push(nextBlock.startPc);
          nextBlock.predecessors.push(block.startPc);
        }
      }
    }
  }

  return {
    blocks,
    entryBlock: blocks.get(0) ?? null
  };
}

export function getBlockContaining(blocks: Map<number, BasicBlock>, pc: number): BasicBlock | null {
  for (const block of blocks.values()) {
    if (pc >= block.startPc && pc <= block.endPc) {
      return block;
    }
  }
  return null;
}

function findBlockContaining(blocks: Map<number, BasicBlock>, pc: number): BasicBlock | null {
  return getBlockContaining(blocks, pc);
}
