#!/usr/bin/env node
/* eslint-disable no-console */
import { Command } from "commander";
import { analyzeBytecode } from "../analysis/delegateScanner";
import { loadBytecodeFromAddress } from "../services/bytecodeLoader";

const program = new Command();

program
  .name("delegate-scan")
  .description("Delegatecall Surface Scanner - analyze EVM delegatecall execution surfaces")
  .version("1.0.0");

program
  .option("--address <address>", "Contract address to analyze")
  .option("--network <network>", "Network name (used for RPC env lookup)", "mainnet")
  .option("--rpc-url <url>", "Explicit RPC URL")
  .option("--bytecode <hex>", "Raw bytecode to analyze")
  .option("--json", "Output JSON report", false);

program.action(async (opts) => {
  try {
    let bytecode: string;
    let address: string | undefined;

    if (opts.bytecode) {
      bytecode = opts.bytecode;
    } else if (opts.address) {
      address = opts.address as string;
      bytecode = await loadBytecodeFromAddress(address, {
        network: opts.network as string | undefined,
        rpcUrl: opts.rpcUrl as string | undefined
      });
    } else {
      console.error("Either --address or --bytecode is required.");
      process.exitCode = 1;
      return;
    }

    const report = analyzeBytecode(bytecode, {
      contractAddress: address,
      network: opts.network
    });

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    printHumanReadable(report);
  } catch (err) {
    console.error("Analysis failed:", (err as Error).message);
    process.exitCode = 1;
  }
});

program.parse(process.argv);

function printHumanReadable(report: ReturnType<typeof analyzeBytecode>): void {
  console.log("Delegatecall Surface Summary");
  console.log("====================================\n");

  if (report.contractAddress) {
    console.log(`Contract: ${report.contractAddress}`);
  }
  if (report.network) {
    console.log(`Network: ${report.network}`);
  }
  console.log(`Bytecode hash: ${report.bytecodeHash}`);
  console.log(`Total delegatecall sites: ${report.delegatecallCount}\n`);
  if (report.overallRisk) {
    console.log(`Overall risk: ${report.overallRisk.toUpperCase()}\n`);
  }

  report.sites.forEach((site, idx) => {
    console.log(`Site #${idx + 1} @ pc 0x${site.pc.toString(16)}`);
    console.log(`  Target type: ${site.classification.type}`);
    if (site.classification.addressLiteral) {
      console.log(`  Address: ${site.classification.addressLiteral}`);
    }
    if (site.classification.storageSlotLiteral) {
      console.log(`  Storage slot: ${site.classification.storageSlotLiteral}`);
    }
    if (site.pattern) {
      console.log(`  Pattern: ${site.pattern.name} - ${site.pattern.description}`);
    }
    console.log(`  Risk: ${site.risk}`);
    console.log("");
  });

  if (report.proxiesDetected.length > 0) {
    console.log("Detected proxy patterns:");
    for (const p of report.proxiesDetected) {
      console.log(`  - ${p.name}: ${p.count} site(s)`);
    }
  }
}

