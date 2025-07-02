# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands
- Install dependencies: `npm install`
- Start dev mode (watch for changes): `npm run dev`
- Build all components: `npm run build`
- Build specific parts: `npm run build:backend` or `npm run build:frontend`
- Test compiled CLI: `node --no-deprecation dist/cli.js`
- Test TypeScript source directly: `npx tsx --no-deprecation src/cli.ts`
- Generate HTML report: `claude-trace --generate-html logs.jsonl report.html`
- Generate conversation index: `claude-trace --index`

## Architecture Overview
Two-part system with shared core logic:

1. **Backend** (src/)
   - CLI (cli.ts): Command-line interface and argument parsing
   - Interceptor (interceptor.ts): Captures API traffic and logs to JSONL
   - HTML Generator (html-generator.ts): Embeds frontend into self-contained reports
   - Index Generator (index-generator.ts): Creates AI-powered conversation summaries
   - Shared Conversation Processor: Core logic for handling Claude interactions

2. **Frontend** (frontend/src/)
   - App component (app.ts): Main controller for data processing and view management
   - Conversation views: Simple (main display), raw pairs (HTTP traffic), and JSON debug
   - Utilities: Data processing (utils/data.ts) and markdown rendering (utils/markdown.ts)

Logs stored in `.claude-trace/` directory with auto-generated filenames.
