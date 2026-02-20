import { DelegatecallSite, ProxyPatternMatch, ProxyPatternSummary } from "../types/analysis";

// Minimal proxy (EIP-1167) patterns (simplified)
// 0x363d3d373d3d3d363d73<impl>5af43d82803e903d91602b57fd5bf3
const EIP1167_PREFIX = "363d3d373d3d3d363d73";
const EIP1167_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

// EIP-1967 implementation slot
const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc".toLowerCase();

// EIP-1967 admin slot (for transparent proxies)
const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103".toLowerCase();

// UUPS upgradeable slot (EIP-1822)
const UUPS_SLOT =
  "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7".toLowerCase();

export function detectProxyPatterns(bytecode: string, sites: DelegatecallSite[]): DelegatecallSite[] {
  const clean = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;

  const isEip1167 = detectEip1167(clean);
  const storageSlots = new Set(
    sites
      .map((s) => s.classification.storageSlotLiteral?.toLowerCase())
      .filter((s): s is string => s !== undefined)
  );

  // Detect Diamond pattern: multiple delegatecalls with different storage slots
  const isDiamond = detectDiamondPattern(sites);

  return sites.map((site) => {
    let patternMatch: ProxyPatternMatch | null = null;

    if (isEip1167) {
      patternMatch = {
        name: "EIP-1167",
        description: "Minimal proxy clone pattern"
      };
    } else if (site.classification.storageSlotLiteral?.toLowerCase() === EIP1967_IMPL_SLOT) {
      // Check if UUPS slot is also present
      const hasUUPS = storageSlots.has(UUPS_SLOT);
      patternMatch = {
        name: hasUUPS ? "UUPS" : "EIP-1967",
        description: hasUUPS
          ? "UUPS upgradeable proxy pattern"
          : "EIP-1967 transparent proxy implementation slot"
      };
    } else if (isDiamond) {
      patternMatch = {
        name: "Diamond",
        description: "EIP-2535 Diamond pattern (multiple facets)"
      };
    }

    return {
      ...site,
      patternMatch
    };
  });
}

function detectDiamondPattern(sites: DelegatecallSite[]): boolean {
  // Diamond pattern heuristic:
  // - Multiple delegatecall sites
  // - All are storage-driven
  // - Different storage slots (indicating facet mapping)
  if (sites.length < 2) return false;

  const storageSites = sites.filter((s) => s.classification.type === "storage");
  if (storageSites.length < 2) return false;

  const uniqueSlots = new Set(
    storageSites.map((s) => s.classification.storageSlotLiteral).filter((s): s is string => s !== undefined)
  );

  // If we have multiple storage-driven delegatecalls with different slots, likely Diamond
  return uniqueSlots.size >= 2;
}

export function summarizeProxyPatterns(sites: DelegatecallSite[]): ProxyPatternSummary[] {
  const counts: Record<string, number> = {};

  for (const site of sites) {
    if (!site.patternMatch) continue;
    const { name } = site.patternMatch;
    counts[name] = (counts[name] ?? 0) + 1;
  }

  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}

function detectEip1167(cleanBytecode: string): boolean {
  const lower = cleanBytecode.toLowerCase();
  const idx = lower.indexOf(EIP1167_PREFIX);
  if (idx === -1) return false;
  const suffixIdx = lower.indexOf(EIP1167_SUFFIX, idx + EIP1167_PREFIX.length + 40); // skip 20-byte impl
  return suffixIdx !== -1;
}

