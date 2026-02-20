# Delegatecall Surface Scanner

Professional-grade EVM bytecode analysis tool for detecting and analyzing `DELEGATECALL` execution surfaces, proxy patterns, and risk assessment.

## 🎯 What This Tool Does

This tool performs **static bytecode analysis** to:

- **Detect all `DELEGATECALL` opcodes** in EVM bytecode
- **Trace stack backwards** to determine how delegatecall targets are derived
- **Classify targets** as:
  - Hardcoded addresses
  - Storage-driven (proxy patterns)
  - Calldata-driven (user-controlled)
  - Dynamic/computed
- **Recognize proxy patterns**:
  - EIP-1167 (Minimal Proxy)
  - EIP-1967 (Transparent Proxy)
  - UUPS (Universal Upgradeable Proxy Standard)
  - EIP-2535 (Diamond Pattern)
- **Generate execution surface reports** with risk levels
- **Visualize delegatecall flows** as graphs

## 🏗 Architecture

- **Backend**: TypeScript analysis engine with CFG-based stack tracing, HTTP API, and CLI
- **Frontend**: Next.js web UI for interactive analysis
- **Monorepo**: Workspace-based structure for shared types and tooling

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Build backend
npm run backend:build

# Build frontend
npm run frontend:build
```

### Running Locally

**Backend API** (port 4000):
```bash
npm run backend:dev
# or
npm run backend:start
```

**Frontend UI** (port 3000):
```bash
npm run frontend:dev
```

Then open `http://localhost:3000` in your browser.

### Using the CLI

```bash
# Analyze a contract by address
npm --workspace backend run delegate-scan -- --address 0x... --network mainnet --rpc-url https://...

# Analyze raw bytecode
npm --workspace backend run delegate-scan -- --bytecode 0x600035...

# Output JSON
npm --workspace backend run delegate-scan -- --address 0x... --json
```

### Docker

```bash
# Build and run with docker-compose
docker-compose up --build

# Or build Docker image
docker build -t delegatecall-scanner .
docker run -p 4000:4000 -p 3000:3000 delegatecall-scanner
```

## 📊 API Usage

### POST /analyze

Analyze bytecode or fetch and analyze a contract.

**Request body (address)**:
```json
{
  "address": "0x...",
  "network": "mainnet",
  "rpcUrl": "https://..." // optional, overrides env
}
```

**Request body (bytecode)**:
```json
{
  "bytecode": "0x600035..."
}
```

**Response**:
```json
{
  "contractAddress": "0x...",
  "network": "mainnet",
  "bytecodeHash": "...",
  "delegatecallCount": 2,
  "sites": [
    {
      "id": "site-66",
      "pc": 66,
      "classification": {
        "type": "storage",
        "storageSlotLiteral": "0x3608...",
        "details": "EIP-1967 implementation slot"
      },
      "pattern": {
        "name": "EIP-1967",
        "description": "Transparent/UUPS proxy implementation slot"
      },
      "risk": "medium"
    }
  ],
  "proxiesDetected": [
    { "name": "EIP-1967", "count": 1 }
  ],
  "graph": {
    "nodes": [...],
    "edges": [...]
  }
}
```

## 🔧 Configuration

Set environment variables for RPC URLs:

```bash
export RPC_URL_DEFAULT=https://eth.llamarpc.com
export RPC_URL_MAINNET=https://eth.llamarpc.com
export RPC_URL_SEPOLIA=https://sepolia.infura.io/v3/YOUR_KEY
```

Or use `.env` file (see `.env.example`).

## 🧠 How It Works

### Bytecode Disassembly

The tool disassembles EVM bytecode into opcodes, tracking:
- Program counter (PC) for each instruction
- Stack inputs/outputs
- Push data for `PUSHx` instructions

### Control Flow Graph (CFG)

For accurate analysis across branches:
- Identifies **basic blocks** (contiguous instructions with single entry/exit)
- Builds **control flow graph** connecting blocks
- Uses **worklist algorithm** for fixed-point iteration

### Stack Tracing

For each `DELEGATECALL`:
- Traces stack backwards through CFG
- Maintains **symbolic expressions** for stack values:
  - Literals (PUSH20 addresses)
  - Storage reads (SLOAD)
  - Calldata (CALLDATALOAD)
  - Environment (CALLER, ADDRESS)
  - Computed operations (ADD, SUB, etc.)

### Pattern Detection

Recognizes common proxy patterns by:
- **EIP-1167**: Bytecode pattern matching
- **EIP-1967**: Storage slot `0x3608...`
- **UUPS**: EIP-1967 slot + UUPS slot presence
- **Diamond**: Multiple storage-driven delegatecalls with different slots

### Risk Classification

- **Low**: Hardcoded addresses (unless minimal proxy)
- **Medium**: Storage-driven proxies (upgradeable)
- **High**: Calldata-driven or dynamic targets
- **Unknown**: Incomplete analysis

## 📁 Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── analysis/
│   │   │   ├── cfg.ts              # Control flow graph builder
│   │   │   ├── delegateScanner.ts   # Main analysis engine
│   │   │   ├── graphGenerator.ts    # Graph visualization data
│   │   │   ├── opcodes.ts          # Opcode table & disassembler
│   │   │   ├── proxyPatterns.ts    # Pattern detection
│   │   │   ├── stackTracer.ts      # CFG-based stack tracing
│   │   │   └── targetClassifier.ts # Target classification
│   │   ├── cli/
│   │   │   └── main.ts             # CLI entrypoint
│   │   ├── server/
│   │   │   └── server.ts           # HTTP API server
│   │   ├── services/
│   │   │   └── bytecodeLoader.ts   # RPC bytecode fetching
│   │   └── types/
│   │       └── analysis.ts         # Type definitions
│   └── package.json
├── frontend/
│   ├── pages/
│   │   └── index.tsx               # Main UI
│   └── package.json
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## 🧪 Development

```bash
# Run tests (when implemented)
npm test

# Lint
npm run lint

# Type check
npm --workspace backend run build
npm --workspace frontend run build
```

## 🚢 Deployment

### Docker

```bash
docker build -t delegatecall-scanner .
docker run -p 4000:4000 -p 3000:3000 \
  -e RPC_URL_DEFAULT=https://... \
  delegatecall-scanner
```

### CI/CD

GitHub Actions workflow included (`.github/workflows/ci.yml`) for:
- Linting
- Building
- Docker image building

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! This tool is designed to be extensible:
- Add new proxy pattern detectors
- Improve CFG analysis
- Enhance stack expression simplification
- Add more risk heuristics

## ⚠️ Limitations

- **Static analysis only**: Cannot reason about runtime values
- **Optimized bytecode**: May obscure some logic
- **Complex control flow**: Some dynamic jumps may be missed
- **Pattern detection**: Heuristic-based, may have false positives/negatives

For production security audits, combine with dynamic analysis and manual review.
