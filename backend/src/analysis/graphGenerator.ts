import { DelegatecallSite, GraphEdge, GraphNode, GraphOutput, RiskLevel } from "../types/analysis";

export function generateGraph(
  contractAddress: string | undefined,
  sites: DelegatecallSite[]
): GraphOutput {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Add contract node
  const contractId = contractAddress ? `contract:${contractAddress}` : "contract:unknown";
  nodes.push({
    id: contractId,
    label: contractAddress ? `${contractAddress.slice(0, 10)}...` : "Contract",
    kind: "contract",
    metadata: {
      address: contractAddress
    }
  });

  // Process each delegatecall site
  const implAddresses = new Map<string, { address: string; risk: RiskLevel; siteIds: string[] }>();

  for (const site of sites) {
    const targetAddr = site.classification.addressLiteral;
    const storageSlot = site.classification.storageSlotLiteral;

    if (targetAddr) {
      // Hardcoded address
      const implId = `impl:${targetAddr}`;
      if (!implAddresses.has(implId)) {
        implAddresses.set(implId, {
          address: targetAddr,
          risk: classifySiteRisk(site),
          siteIds: []
        });
      }
      implAddresses.get(implId)?.siteIds.push(site.id);

      // Create edge
      edges.push({
        id: `edge-${site.id}`,
        from: contractId,
        to: implId,
        label: site.patternMatch?.name ?? "DELEGATECALL",
        siteId: site.id,
        risk: classifySiteRisk(site)
      });
    } else if (storageSlot) {
      // Storage-driven (proxy pattern)
      const implId = `storage:${storageSlot}`;
      if (!implAddresses.has(implId)) {
        implAddresses.set(implId, {
          address: storageSlot,
          risk: classifySiteRisk(site),
          siteIds: []
        });
      }
      implAddresses.get(implId)?.siteIds.push(site.id);

      const patternLabel = site.patternMatch?.name ?? "Storage Proxy";
      edges.push({
        id: `edge-${site.id}`,
        from: contractId,
        to: implId,
        label: `${patternLabel} (slot: ${storageSlot.slice(0, 10)}...)`,
        siteId: site.id,
        risk: classifySiteRisk(site)
      });
    } else {
      // Unknown/dynamic target
      const implId = `unknown:${site.id}`;
      nodes.push({
        id: implId,
        label: "Unknown Target",
        kind: "unknown",
        metadata: {
          siteId: site.id,
          classification: site.classification.type
        }
      });

      edges.push({
        id: `edge-${site.id}`,
        from: contractId,
        to: implId,
        label: "DELEGATECALL (dynamic)",
        siteId: site.id,
        risk: classifySiteRisk(site)
      });
    }
  }

  // Add implementation nodes
  for (const [implId, data] of implAddresses.entries()) {
    const isStorage = implId.startsWith("storage:");
    const isFacet = data.siteIds.length > 1; // Multiple sites = likely facet

    nodes.push({
      id: implId,
      label: isStorage
        ? `Storage Slot\n${data.address.slice(0, 10)}...`
        : `${data.address.slice(0, 10)}...`,
      kind: isFacet ? "facet" : isStorage ? "implementation" : "implementation",
      metadata: {
        address: data.address,
        siteIds: data.siteIds,
        risk: data.risk
      }
    });
  }

  return { nodes, edges };
}

function classifySiteRisk(site: DelegatecallSite): RiskLevel {
  const type = site.classification.type;
  const pattern = site.patternMatch?.name;

  if (type === "hardcoded") {
    return pattern === "EIP-1167" ? "medium" : "low";
  }
  if (type === "storage") {
    return pattern === "Diamond" ? "medium" : pattern ? "medium" : "medium";
  }
  if (type === "calldata" || type === "dynamic") {
    return "high";
  }
  return "unknown";
}
