# 🚩 VibeSifter— The Honest Travel Guardian

## 1. Project Context & Philosophy
- **Vision:** "Don't get fooled by photos; see the reality through aggregated truth."
- **Core Purpose:** A Chrome Extension that identifies 30 specific "Red Flags" from Booking.com reviews to prevent travelers from booking "trap" hotels.
- **Philosophy:** Time Efficiency · Radical Honesty · High-Trust Curation.
- **Tone:** Sharp Analyst × Reliable Travel Expert. Highly critical and transparent.

---

## 2. Technical Stack (Chrome Extension V3)


| Layer | Technology |
|---|---|
| AI Engine | OpenAI API (`gpt-4o-mini`) — Fast summarization & Semantic mapping |
| Runtime | Chrome Extension Manifest V3 |
| Frontend | Vanilla JS · Tailwind CSS (CDN) · Lucide-react (Icons) |
| Target | Booking.com (Desktop Web / Global) |
| Architecture | Content Script (Scraping) ↔ Background Worker (AI) ↔ Popup UI |

---

## 3. Core Algorithms & Magic Logic

### 3-A. High-Signal Data Extraction
- **Target Selection:** Programmatically sort reviews by "Lowest Score" first.
- **Sample Size:** Extract the top 20-50 low-score reviews to identify "structural" flaws.
- **Pre-processing:** Extract sentences containing negative keywords before sending to API to save tokens/costs.

### 3-B. The 30 RedFlag Taxonomy
1. **Sleep Quality**: Floor/Wall Noise, Street Noise, AC/Machine Noise, Light Pollution.
2. **Hygiene**: Bedbugs (CRITICAL), Roaches/Pests, Mold, Stained Linen, Sewage Smell.
3. **Facility**: Low Water Pressure, No Hot Water, Bad WiFi, Broken Elevator, Tiny Room, Lack of Outlets.
4. **Service**: Rudeness/Racism, Overbooking, Security/Theft, Hidden Fees/Resort Fees.
5. **Location/Vibe**: Steep Hills/Uphill, Dangerous Area, Active Construction, Windowless Rooms.
6. **Digital/Lifestyle**: No Desk/Chair, No Smart TV, Paid Water/Amenities, Fake Breakfast, Long Check-in Queues, Paid Luggage Storage, Elevator Proximity Noise.

### 3-C. Scoring Algorithm
- **Frequency Rule**: Flags are only displayed if mentioned by >10% of the sample or confirmed as "Critical" (e.g., Bedbugs, Safety).

---

## 4. Monetization: The "Safe Pivot"
- **Logic**: When a high-severity Red Flag is detected, suggest 1-2 "Alternative Hotels" nearby.
- **Data Match**: Suggested hotels must have high scores in the specific category failed by the current hotel (e.g., if "Noise" is the Red Flag, suggest a "Quiet" certified hotel).
- **Revenue**: Use Booking.com Affiliate links for all "Check Alternative" buttons.

---

## 5. Strict Development Rules
- **UI/UX**: Critical flags (Bugs/Safety) must be pinned at the top.
- **Language**: Global English for all UI, Prompts, and Analysis.
- **Selector Management**: Keep all CSS selectors in a centralized `selectors.js` for easy updates when Booking.com changes their UI.
- **Privacy**: Never log API keys to the console; use `chrome.storage.local` for key management.

---

## 6. 10-Hour Intensive Sprint Roadmap

### Phase 1: Data Extraction (Hour 1-3) 
- [ ] Implement `content.js` to target `://booking.com*`.
- [ ] Auto-click "Lowest score" sort in the review section.
- [ ] Scrape: Hotel Name, Current Price, Neighborhood, and Review Texts.
- [ ] Log data to console for verification.

### Phase 2: The Brain & AI Mapping (Hour 4-6)
- [ ] Integrate OpenAI `gpt-4o-mini` via `background.js`.
- [ ] Map raw text to the 30 RedFlag categories using semantic analysis.
- [ ] Implement token-saving sentence extraction.

### Phase 3: Dashboard UI (Hour 7-8)
- [ ] Build minimalist Popup/Overlay with Red/Orange/Yellow visual cues.
- [ ] Add "Scanning..." loading state with witty travel tips.

### Phase 4: Pivot & Affiliate (Hour 9-10) [CURRENT]
- [ ] Add "Safe Pivot" recommendation card.
- [ ] Generate affiliate-ready links for alternative suggestions.
- [ ] End-to-end testing and bug fixing.

---

## [Core Protocol: The Interview First]
- Claude MUST interview the user before implementing complex logic or major UI changes.
- **Stop Point**: Do not proceed with coding until the user says: "Interview finished, start implementation."
