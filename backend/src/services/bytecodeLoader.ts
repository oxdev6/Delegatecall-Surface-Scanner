import { ethers } from "ethers";

interface LoadOptions {
  network?: string;
  rpcUrl?: string;
}

export async function loadBytecodeFromAddress(address: string, opts: LoadOptions = {}): Promise<string> {
  const { network, rpcUrl } = opts;

  const provider = createProvider({ network, rpcUrl });
  const code = await provider.getCode(address);

  if (!code || code === "0x") {
    throw new Error(`No bytecode found at address ${address}`);
  }

  return code;
}

function createProvider(opts: { network?: string; rpcUrl?: string }): ethers.JsonRpcProvider {
  if (opts.rpcUrl) {
    return new ethers.JsonRpcProvider(opts.rpcUrl);
  }

  // For a real production app, you would allow configuration of RPC URLs per network.
  // Here we require explicit RPC URL if not provided via environment.
  const envKey = (opts.network ?? "default").toUpperCase().replace(/-/g, "_");
  const envVar = `RPC_URL_${envKey}`;
  const url = process.env[envVar] || process.env.RPC_URL_DEFAULT;

  if (!url) {
    throw new Error(
      `No RPC URL configured. Set ${envVar} or RPC_URL_DEFAULT in environment variables.`
    );
  }

  return new ethers.JsonRpcProvider(url);
}

