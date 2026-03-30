# VibeSifter

Chrome Extension (Manifest V3) that analyzes low-score Booking.com reviews and surfaces honest travel risk signals ("Red Flags") before booking.

## Vision

**Don't get fooled by photos; see the reality through aggregated truth.**

VibeSifter focuses on:
- Time efficiency (one-click scan)
- Radical honesty (blunt risk summary)
- High-trust curation (safe alternatives when needed)

## Current Big Picture

Runtime flow:
1. `content.js` injects **Sift This Vibe** button on Booking hotel pages.
2. On click, it opens reviews, forces low-score sorting, scrapes review text + key hotel context.
3. Scraped data is sent to `background.js`.
4. `background.js` forwards analysis request to Supabase Edge Function.
5. Results are rendered back in-page as a glassmorphism dashboard with risk issues, severity bars, and Safe Pivot CTA.

Core files:
- `manifest.json`: MV3 config, permissions, content script + service worker wiring
- `selectors.js`: centralized selector/text helpers
- `content.js`: UI injection, scraping, panel rendering, safe-alternative link logic
- `background.js`: device ID init + proxy call to Supabase Edge Function
- `options.html` / `options.js`: API key / affiliate ID settings in extension options

## Progress Status (as of 2026-03-30)

### Phase 1 - Data Extraction
- [x] Inject floating action button on Booking hotel pages
- [x] Open reviews modal and apply low-score sorting
- [x] Scrape hotel name, price, location hints, and review texts
- [x] Store extraction payload in `chrome.storage.local`

### Phase 2 - AI Mapping
- [x] Background worker wired
- [x] Request pipeline switched to Supabase Edge Function (`/functions/v1/analyze-reviews`)
- [x] Device ID generation/persistence for usage tracking
- [x] Limit-exceeded handling (`LIMIT_EXCEEDED`) surfaced in UI
- [~] Final taxonomy quality tuning still ongoing (prompt/backend policy iteration)

### Phase 3 - Dashboard UI
- [x] In-page analysis panel (glassmorphism style)
- [x] Severity-first issue ordering + visual severity meters
- [x] Loading skeleton + dynamic loading messages
- [x] Show more interaction, close, and re-run actions

### Phase 4 - Safe Pivot & Affiliate
- [x] Safe alternatives deep-link generation with preserved travel params
- [x] A/B ranking mode support (including Bayesian ranking)
- [x] Affiliate params wired (`aid`, `label`)
- [~] Conversion tuning and destination-filter quality still being refined

## What Works Today

- One-click hotel risk scan from Booking page
- Dynamic issue list + sarcastic verdict in-page
- Recent UX/perf optimizations:
  - caching for repeat analysis
  - reactive polling/observer-based waits (less static delay)
  - skeleton UI while analysis is in progress
- Safe Pivot CTA for safer alternatives (new tab flow)

## Configuration

Open extension options and set:
- `openai_key` (if still used by backend workflow)
- `affiliate_id` (used in Safe Pivot links)

Also ensure in `background.js`:
- `SUPABASE_FUNC_URL` points to your deployed Edge Function
- `SUPABASE_ANON_KEY` is set to your Supabase anon key (never service-role key)

## Development Notes

- Target site: `booking.com` desktop pages
- Selector volatility is expected; selector resilience + page-structure warnings are built in
- If Booking UI changes, start debugging from `selectors.js` and sort/review extraction blocks in `content.js`
