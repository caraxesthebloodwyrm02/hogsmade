# Glass Architecture Partitions

This is the working map for moving Glass from a two-dimensional bridge/render loop into
a three-dimensional agent field with durable semantic assets.

## High-Level Partitions

```mermaid
flowchart TB
  P1["1. Bridge Contract<br/>BridgeState, ThresholdState, AssetMeta"]
  P2["2. Session / MCP Control<br/>glass-server tools"]
  P3["3. Main Process Boundary<br/>IPC, bridge watcher, validation"]
  P4["4. Field State Layer<br/>renderer hydration/subscriptions"]
  P5["5. Spatial Canvas Core<br/>Field, Camera, Presence"]
  P6["6. Ceremony Layer<br/>ThresholdLine, Modulation, Voices"]
  P7["7. Block / Asset Layer<br/>CodeBlock, AssetBlock, BlockManager"]
  P8["8. Signal / Memory Semantics<br/>magnetism, routines, ledger contracts"]

  P1 --> P2
  P1 --> P3
  P3 --> P4
  P4 --> P5
  P5 --> P6
  P5 --> P7
  P8 --> P2
  P8 --> P7
  P2 --> P3
```

## Runtime Data Flow

```mermaid
sequenceDiagram
  participant Agent
  participant MCP as glass-server
  participant Bridge as field-bridge.json
  participant Main as Electron main
  participant Renderer
  participant Ledger as glass-inventory.json

  Agent->>MCP: glass_emit_block(type="asset")
  MCP->>Bridge: read current threshold_state
  MCP->>MCP: enforce rarity ceiling
  MCP->>Ledger: append semantic asset record
  MCP->>Bridge: write block with asset.ledger_id
  Main->>Bridge: watch atomic rename
  Main->>Renderer: bridge:update
  Renderer->>Renderer: FieldState -> BlockManager -> AssetBlock
```

## Persistence Boundary

```mermaid
flowchart LR
  Bridge["Bridge<br/>live field state<br/>session-scoped"]
  Blocks["blocks[]<br/>workspace continuity"]
  Assets["asset blocks<br/>visible semantic anchors"]
  Ledger["Inventory Ledger<br/>durable semantic memory"]
  Future["Future Query Tools<br/>list/filter/search"]

  Bridge --> Blocks
  Blocks --> Assets
  Assets --> Ledger
  Ledger --> Future
  Future -.-> Bridge
```

## Study Notes

- The bridge is still the visual truth for the renderer, but not the durable truth for semantic assets.
- Rarity is controlled at mint time by ceremony state, so the server must write the durable ledger only after passing the gate.
- `ledger_id` is the join key between field-visible `AssetMeta` and durable inventory records.
- The next backend step is therefore a small atomic JSON ledger, not a database migration yet.
