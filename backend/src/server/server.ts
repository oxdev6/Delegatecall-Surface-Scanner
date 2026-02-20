import express from "express";
import { z } from "zod";
import { analyzeBytecode } from "../analysis/delegateScanner";
import { loadBytecodeFromAddress } from "../services/bytecodeLoader";

const app = express();
app.use(express.json({ limit: "1mb" }));

const AnalyzeBodySchema = z.union([
  z.object({
    address: z.string(),
    network: z.string().optional(),
    rpcUrl: z.string().optional()
  }),
  z.object({
    bytecode: z.string()
  })
]);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/analyze", async (req, res) => {
  const parsed = AnalyzeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  try {
    if ("bytecode" in parsed.data) {
      const report = analyzeBytecode(parsed.data.bytecode);
      res.json(report);
    } else {
      const { address, network, rpcUrl } = parsed.data;
      const bytecode = await loadBytecodeFromAddress(address, { network, rpcUrl });
      const report = analyzeBytecode(bytecode, { contractAddress: address, network });
      res.json(report);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "Analysis failed" });
  }
});

const port = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Delegatecall Surface Scanner API listening on port ${port}`);
  });
}

export default app;

