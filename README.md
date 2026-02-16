# ClawPal MVP (Tauri)

ClawPal is a local helper for OpenClaw configuration:
- install scenarios via Recipes
- one-click rollback for every config change
- local doctor checks with basic auto-fixes

## Quick start

```bash
npm install
npm run dev
```

### Override folders outside `~/.openclaw`

You can place ClawPal-managed files outside `~/.openclaw` with env vars:

```bash
export CLAWPAL_OPENCLAW_DIR="$HOME/.openclaw"   # OpenClaw 配置来源目录（默认）
export CLAWPAL_DATA_DIR="$HOME/.clawpal"        # ClawPal 元数据目录（默认: $CLAWPAL_OPENCLAW_DIR/.clawpal）
```

## Build

```bash
npm run build
cd src-tauri && cargo build
```

## Release

```bash
npm run release:dry-run
npm run release
```

## Project layout

- `src/` React + TypeScript UI
- `src-tauri/` Rust + Tauri host and command APIs
- `docs/plans/` design and implementation plan
