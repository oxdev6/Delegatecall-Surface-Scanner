import { Opcode } from "../types/analysis";

interface OpcodeInfo {
  name: string;
  in: number;
  out: number;
  pushBytes?: number;
}

const OPCODES: Record<number, OpcodeInfo> = {};

function addOpcode(byte: number, name: string, stackIn: number, stackOut: number, pushBytes?: number) {
  OPCODES[byte] = { name, in: stackIn, out: stackOut, pushBytes };
}

// Populate core opcodes (partial but sufficient for delegatecall analysis)
// PUSH1 - PUSH32
for (let i = 0; i < 32; i += 1) {
  addOpcode(0x60 + i, `PUSH${i + 1}`, 0, 1, i + 1);
}

// DUP1 - DUP16
for (let i = 0; i < 16; i += 1) {
  addOpcode(0x80 + i, `DUP${i + 1}`, i + 1, i + 2);
}

// SWAP1 - SWAP16
for (let i = 0; i < 16; i += 1) {
  addOpcode(0x90 + i, `SWAP${i + 1}`, i + 2, i + 2);
}

// Common stack ops and calls
addOpcode(0x00, "STOP", 0, 0);
addOpcode(0x01, "ADD", 2, 1);
addOpcode(0x02, "MUL", 2, 1);
addOpcode(0x03, "SUB", 2, 1);
addOpcode(0x10, "LT", 2, 1);
addOpcode(0x11, "GT", 2, 1);
addOpcode(0x14, "EQ", 2, 1);
addOpcode(0x15, "ISZERO", 1, 1);
addOpcode(0x33, "CALLER", 0, 1);
addOpcode(0x34, "CALLVALUE", 0, 1);
addOpcode(0x35, "CALLDATALOAD", 1, 1);
addOpcode(0x36, "CALLDATASIZE", 0, 1);
addOpcode(0x37, "CALLDATACOPY", 3, 0);
addOpcode(0x3d, "RETURNDATASIZE", 0, 1);
addOpcode(0x3e, "RETURNDATACOPY", 3, 0);
addOpcode(0x51, "MLOAD", 1, 1);
addOpcode(0x52, "MSTORE", 2, 0);
addOpcode(0x53, "MSTORE8", 2, 0);
addOpcode(0x54, "SLOAD", 1, 1);
addOpcode(0x55, "SSTORE", 2, 0);
addOpcode(0x56, "JUMP", 1, 0);
addOpcode(0x57, "JUMPI", 2, 0);
addOpcode(0x5b, "JUMPDEST", 0, 0);
addOpcode(0xf1, "CALL", 7, 1);
addOpcode(0xf2, "CALLCODE", 7, 1);
addOpcode(0xf4, "DELEGATECALL", 6, 1);
addOpcode(0xfa, "STATICCALL", 6, 1);
addOpcode(0xfd, "REVERT", 2, 0);
addOpcode(0xff, "SELFDESTRUCT", 1, 0);

export function decodeBytecode(bytecode: string): Opcode[] {
  const clean = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }

  const instructions: Opcode[] = [];
  let pc = 0;

  while (pc < bytes.length) {
    const byte = bytes[pc] ?? 0;
    const info = OPCODES[byte];

    if (!info) {
      // Unknown opcode, treat as 0 stack in/out
      instructions.push({
        pc,
        op: `0x${byte.toString(16).padStart(2, "0")}`,
        stackIn: 0,
        stackOut: 0
      });
      pc += 1;
      continue;
    }

    let pushData: string | undefined;
    if (info.pushBytes && info.pushBytes > 0) {
      const start = pc + 1;
      const end = start + info.pushBytes;
      const dataBytes = bytes.slice(start, end);
      pushData = `0x${dataBytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
      pc = end;
    } else {
      pc += 1;
    }

    instructions.push({
      pc,
      op: info.name,
      pushData,
      stackIn: info.in,
      stackOut: info.out
    });
  }

  return instructions;
}

