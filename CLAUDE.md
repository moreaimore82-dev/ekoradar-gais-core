# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup & Commands

```bash
# Install dependencies
npm install

# Run dev server (starts both Express backend + Vite frontend on port 3000)
npm run dev

# Build for production
npm run build

# TypeScript check
node_modules/.bin/tsc --noEmit
```

**Required:** Set `GEMINI_API_KEY` in `.env.local` before running.

**Note:** On Windows, standard shell utilities (`bash`, `sleep`, `cat`, etc.) may not be in PATH. Use full paths like `/c/Program Files/nodejs/node` or prepend `/c/Program Files/Git/mingw64/bin:/c/Program Files/Git/usr/bin` to PATH.

## Architecture

This is a single-process full-stack app — `npm run dev` runs `tsx server.ts` which creates both an Express API server and a Vite dev server in the same Node process (port 3000).

**Request flow:**
1. Browser → `http://localhost:3000`
2. Express (`server.ts`) handles `/api/*` routes, all other requests pass through to Vite's dev middleware
3. Frontend (`src/App.tsx`) calls `/api/scrape` to fetch URL/PDF content via the backend, then calls Gemini directly from the browser using `GEMINI_API_KEY` (injected by Vite at build time via `process.env.GEMINI_API_KEY`)

**Why split scraping to backend:** Browser CORS restrictions prevent direct URL fetching; the Express backend uses Axios + Cheerio for HTML scraping and `pdf-parse` for PDF extraction.

## Key Files

- **`server.ts`** — Express server with 3 API routes: `/api/system-info`, `/api/market-data` (live BloombergHT/doviz.com scraping), `/api/scrape` (URL/PDF content extraction with special handling for İş Bankası)
- **`src/App.tsx`** — Entire frontend (~1350 lines). All UI state, source management, archive (localStorage), market ticker, chat interface, and audio playback live here.
- **`src/lib/gemini.ts`** — All Gemini API calls: `generateEconomicSummary`, `chatWithSummary`, `textToSpeech`, `fetchSourceTitle`, `verifySourceStatus`. Uses `@google/genai` SDK with tool use (function calling + URL context). Includes retry logic with exponential backoff for rate limiting.

## Gemini Model Strategy

`generateEconomicSummary` tries `gemini-3.1-pro-preview` first (with `ThinkingLevel.HIGH`), falls back to `gemini-3-flash-preview` on 429/quota errors. `verifySourceStatus` similarly tries Flash first, then Pro. Up to 3 function call iterations per generation for deep PDF/URL scanning.

## State Persistence

- Archive of last 10 analyses stored in `localStorage` under key `ekoradar_archive` (shape: `ArchiveItem[]`)
- User-added sources also persisted in `localStorage` under `ekoradar_sources`
- `GEMINI_API_KEY` is embedded into the frontend bundle at build time by Vite — it does NOT go through the Express backend

## Destructive Action Guard

Password `1453` is hardcoded in `src/App.tsx` to protect destructive UI actions (clearing sources, resetting the app).
