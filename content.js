/* global chrome, VS_SELECTORS */

(function () {
  const STORAGE_KEY = "vibeSifter.latestExtraction";
  const BTN_ID = "vibesifter-sift-btn";
  const TOAST_ID = "vibesifter-toast";
  const PANEL_ID = "vibesifter-analysis-panel";
  const SHIELD_ID = "vibesifter-shield";
  const ALT_ORDER_KEY = "vibeSifter.altOrderMode";
  const ANALYSIS_CACHE_TTL_MS = 60 * 60 * 1000;
  let loadingMessageInterval = null;
  let streamVerdictBuffer = "";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const delayWithSetTimeout = (ms) => new Promise((r) => setTimeout(r, ms));
  const fastPoll = (conditionFn, timeoutMs = 3000, intervalMs = 50) =>
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        let v = null;
        try {
          v = conditionFn();
        } catch {
          v = null;
        }
        if (v) return resolve(v);
        if (Date.now() - started >= timeoutMs) return resolve(null);
        setTimeout(tick, intervalMs);
      };
      tick();
    });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "ANALYSIS_STREAM_DELTA") return;
    if (typeof message.delta !== "string" || !message.delta) return;
    streamVerdictBuffer += message.delta;
    updateLoadingVerdictText(extractVerdictFromStream(streamVerdictBuffer));
  });

  function isLikelyHotelDetailPage() {
    // Best-effort heuristic: Booking changes often; we prefer not to miss.
    const hasPropertyTitle =
      document.querySelector('[data-testid="title"]') ||
      document.querySelector('[data-testid="property-title"]') ||
      document.querySelector("h1");

    const hasReviewSignals =
      VS_SELECTORS.findClickableByText(document, VS_SELECTORS.TEXT.readAllReviews) ||
      document.querySelector('[data-testid*="review" i]') ||
      document.querySelector('[id*="review" i]');

    const urlLooksLikeHotel = /\/hotel\//i.test(location.pathname);
    return Boolean((hasPropertyTitle && hasReviewSignals) || urlLooksLikeHotel);
  }

  function ensureStyles() {
    if (document.getElementById("vibesifter-styles")) return;
    const style = document.createElement("style");
    style.id = "vibesifter-styles";
    style.textContent = `
      #${BTN_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        font: 600 14px/1.1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        letter-spacing: .2px;
        padding: 12px 14px;
        border-radius: 999px;
        border: 1px solid rgba(220, 38, 38, 0.35);
        background: #ffffff;
        color: #b91c1c;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
        cursor: pointer;
        user-select: none;
      }
      #${BTN_ID}:hover {
        border-color: rgba(220, 38, 38, 0.6);
        box-shadow: 0 12px 34px rgba(15, 23, 42, 0.16);
        transform: translateY(-1px);
      }
      #${BTN_ID}:active {
        transform: translateY(0px);
      }
      #${BTN_ID}[data-busy="true"] {
        opacity: 0.75;
        cursor: progress;
      }
      #${TOAST_ID} {
        position: fixed;
        right: 20px;
        bottom: 78px;
        z-index: 2147483647;
        max-width: 340px;
        font: 500 13px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(15, 23, 42, 0.10);
        background: rgba(255, 255, 255, 0.98);
        color: #0f172a;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
      }
      #${TOAST_ID}[data-variant="error"] {
        border-color: rgba(220, 38, 38, 0.30);
        color: #7f1d1d;
      }
      #${TOAST_ID} .vs-title {
        font-weight: 700;
        margin-bottom: 4px;
      }
      #${TOAST_ID} .vs-body {
        opacity: 0.95;
      }
      #${SHIELD_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background: rgba(255, 255, 255, 0.52);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      #${SHIELD_ID}.is-active {
        display: flex;
      }
      #${SHIELD_ID} .vs-shield-pill {
        border-radius: 999px;
        padding: 9px 14px;
        font: 700 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        color: #991b1b;
        border: 1px solid rgba(220, 38, 38, 0.25);
        background: rgba(255,255,255,0.86);
      }
      #${PANEL_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: min(440px, calc(100vw - 24px));
        max-height: min(78vh, 760px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        z-index: 2147483647;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        background: rgba(255, 255, 255, 0.62);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 24px 48px rgba(15, 23, 42, 0.24);
        color: #0f172a;
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 280ms ease, transform 320ms ease;
      }
      #${PANEL_ID}.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      #${PANEL_ID}.is-loading-state .vs-panel-body {
        overflow: hidden;
      }
      #${PANEL_ID} .vs-panel-head {
        padding: 14px 14px 10px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.10);
      }
      #${PANEL_ID} .vs-topline {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #${PANEL_ID} .vs-brand {
        font-weight: 800;
        font-size: 12px;
        color: #b91c1c;
        letter-spacing: 0.4px;
      }
      #${PANEL_ID} .vs-close {
        margin-left: auto;
        border: 0;
        background: rgba(15, 23, 42, 0.08);
        color: #0f172a;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        font-size: 15px;
        cursor: pointer;
      }
      #${PANEL_ID} .vs-hotel {
        margin-top: 8px;
        font-size: 16px;
        font-weight: 800;
      }
      #${PANEL_ID} .vs-verdict {
        margin-top: 6px;
        color: #f87171;
        font-weight: 650;
        font-size: 13px;
        font-style: italic;
        background: rgba(127, 29, 29, 0.18);
        border: 1px solid rgba(239, 68, 68, 0.20);
        border-radius: 10px;
        padding: 8px 10px;
      }
      #${PANEL_ID} .vs-note {
        margin-top: 6px;
        color: #334155;
        font-size: 12px;
      }
      #${PANEL_ID} .vs-panel-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding: 10px 12px;
      }
      #${PANEL_ID} .vs-item {
        border: 1px solid rgba(15, 23, 42, 0.10);
        background: rgba(255, 255, 255, 0.52);
        border-radius: 14px;
        padding: 10px;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .vs-item-top {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      #${PANEL_ID} .vs-icon {
        width: 18px;
        height: 18px;
        color: #991b1b;
        flex: 0 0 auto;
      }
      #${PANEL_ID} .vs-category {
        font-size: 12px;
        font-weight: 800;
        color: #334155;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      #${PANEL_ID} .vs-issue {
        margin-top: 4px;
        font-size: 13px;
        color: #0f172a;
      }
      #${PANEL_ID} .vs-meter {
        margin-top: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.12);
        overflow: hidden;
      }
      #${PANEL_ID} .vs-meter > span {
        display: block;
        height: 100%;
      }
      #${PANEL_ID} .vs-meter > span.vs-sev-critical {
        background: #dc2626;
      }
      #${PANEL_ID} .vs-meter > span.vs-sev-warning {
        background: #f97316;
      }
      #${PANEL_ID} .vs-meter > span.vs-sev-caution {
        background: #facc15;
      }
      #${PANEL_ID} .vs-meta {
        margin-top: 5px;
        font-size: 11px;
        color: #475569;
      }
      #${PANEL_ID} .vs-actions {
        flex: 0 0 auto;
        position: sticky;
        bottom: 0;
        border-top: 1px solid rgba(15, 23, 42, 0.10);
        display: grid;
        gap: 8px;
        padding: 10px 12px 12px;
        background: rgba(255, 255, 255, 0.82);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      #${PANEL_ID} .vs-ab {
        display: grid;
        gap: 6px;
        padding: 8px 10px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.05);
      }
      #${PANEL_ID} .vs-ab label {
        font-size: 11px;
        font-weight: 700;
        color: #334155;
      }
      #${PANEL_ID} .vs-ab select {
        width: 100%;
        border: 1px solid rgba(15, 23, 42, 0.15);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.75);
        color: #0f172a;
        padding: 8px 10px;
        font-size: 12px;
      }
      #${PANEL_ID} .vs-btn {
        border: 0;
        border-radius: 12px;
        padding: 10px 12px;
        font-weight: 700;
        cursor: pointer;
      }
      #${PANEL_ID} .vs-btn-light {
        background: rgba(15, 23, 42, 0.08);
        color: #0f172a;
      }
      #${PANEL_ID} .vs-btn-danger {
        background: linear-gradient(180deg, #ef4444, #b91c1c);
        color: #fff;
      }
      #${PANEL_ID} .vs-btn-danger.vs-pulse {
        animation: vsCtaPulse 2.4s ease-in-out infinite;
      }
      #${PANEL_ID} .vs-btn-danger.is-loading {
        opacity: 0.9;
        animation: vsPulse 1s ease-in-out infinite;
      }
      #${PANEL_ID} .vs-pivot-caption {
        margin-top: -2px;
        text-align: center;
        font-size: 11px;
        color: #475569;
      }
      #${PANEL_ID} .vs-affiliate-disclosure {
        margin-top: -2px;
        text-align: center;
        font-size: 10px;
        color: #334155;
        opacity: 0.4;
      }
      #${PANEL_ID} .vs-show-more {
        width: 100%;
        margin-top: 6px;
      }
      #${PANEL_ID} .vs-more-wrap {
        max-height: 0;
        overflow: hidden;
        transition: max-height 320ms ease;
      }
      #${PANEL_ID} .vs-more-wrap.is-expanded {
        max-height: 500px;
      }
      #${PANEL_ID} .vs-skeleton {
        position: relative;
        overflow: hidden;
        background: rgba(148, 163, 184, 0.22);
        border-radius: 8px;
      }
      #${PANEL_ID} .vs-skeleton::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
        animation: vsShimmer 1.4s infinite;
      }
      #${PANEL_ID} .vs-skel-line {
        height: 12px;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .vs-skel-line.lg {
        height: 14px;
      }
      #${PANEL_ID} .vs-skel-line.w80 { width: 80%; }
      #${PANEL_ID} .vs-skel-line.w60 { width: 60%; }
      #${PANEL_ID} .vs-skel-line.w95 { width: 95%; }
      @keyframes vsPulse {
        0% { transform: scale(1); filter: brightness(1); }
        50% { transform: scale(1.01); filter: brightness(1.08); }
        100% { transform: scale(1); filter: brightness(1); }
      }
      @keyframes vsCtaPulse {
        0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.24); }
        70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
        100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
      }
      @keyframes vsShimmer {
        100% { transform: translateX(100%); }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function showToast(title, body, variant = "info", ttlMs = 3200) {
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = TOAST_ID;
    el.setAttribute("data-variant", variant);
    el.innerHTML = `
      <div class="vs-title">${escapeHtml(title)}</div>
      <div class="vs-body">${escapeHtml(body)}</div>
    `;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), ttlMs);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureButton() {
    ensureStyles();
    ensureShield();
    if (document.getElementById(BTN_ID)) return;
    if (!isLikelyHotelDetailPage()) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "Sift This Vibe";
    btn.addEventListener("click", onSiftClicked);
    document.body.appendChild(btn);
  }

  async function onSiftClicked() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    if (btn.getAttribute("data-busy") === "true") return;

    btn.setAttribute("data-busy", "true");
    btn.textContent = "Sifting Vibe... 🔍";
    streamVerdictBuffer = "";

    try {
      const cached = await loadCachedAnalysisForCurrentHotel();
      if (cached) {
        renderAnalysisPanel(cached.analysis, cached.extractedData);
        showToast("VibeSifter", "Loaded cached analysis (under 1 hour).");
        return;
      }

      showToast("VibeSifter", "Opening reviews…");
      const modal = await openReviewsModalWithFallback();
      checkPageStructure(modal);

      showToast("VibeSifter", "Sorting by lowest score…");
      setShieldActive(true, "Applying low-score filter...");
      await setSortToLowest(modal);

      showToast("VibeSifter", "Extracting the truth…");
      const reviewNodes = await waitForReviewsWithRetry(modal, btn, 10, 1000);
      const data = await extractData(modal, reviewNodes);
      setShieldActive(false);

      await chrome.storage.local.set({ [STORAGE_KEY]: data });
      console.log("[VibeSifter] Extracted data:", data);

      if (Array.isArray(data.reviewTexts) && data.reviewTexts.length > 0) {
        renderAnalysisLoadingPanel(data);
        // Send to background for AI analysis immediately (Phase 2 bridge).
        console.log(
          `[VibeSifter] Successfully extracted ${data.reviewTexts.length} reviews. Sending to AI Brain...`
        );
        showToast("VibeSifter", "Analyzing reviews…");

        const analysisResponse = await sendToBackgroundForAnalysis(data);
        console.log("VibeSifter Final Analysis:", analysisResponse);

        if (analysisResponse?.error === "LIMIT_EXCEEDED") {
          showToast("VibeSifter", "오늘 사용량을 다 썼습니다", "error", 5200);
          return;
        }

        renderAnalysisPanel(analysisResponse, data);
        await saveCachedAnalysisForCurrentHotel(analysisResponse, data);

        showToast("VibeSifter", "Saved + analyzed. Check console for results.");
      } else {
        console.warn("[VibeSifter] Extracted 0 reviews. Skipping AI analysis.");
        showToast("VibeSifter", "No reviews extracted. Analysis skipped.", "error", 4200);
      }
    } catch (err) {
      setShieldActive(false);
      console.error("[VibeSifter] Extraction failed:", err);
      showToast(
        "VibeSifter",
        err && err.message ? err.message : "Extraction failed. Try again.",
        "error",
        5200
      );
    } finally {
      btn.removeAttribute("data-busy");
      btn.textContent = "Sift This Vibe";
    }
  }

  async function openReviewsModalWithFallback() {
    // Attempt 1: click obvious “Read all reviews/See all reviews”.
    const clicked = clickReadAllReviewsTrigger(document);
    if (clicked) {
      const modal = await waitForModal(6000);
      if (modal) {
        await waitForModalInteractive(modal, 2000);
        // Diagnostics: confirm legacy modal content root (may be false on newer layouts).
        console.log(
          "Modal opened? ",
          !!document.querySelector(".bui-modal__content")
        );
        return modal;
      }
    }

    // Fallback: scroll to likely review area then retry.
    const anchor =
      document.querySelector('[id*="review" i]') ||
      document.querySelector('[data-testid*="review" i]');
    if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
    await delayWithSetTimeout(200);

    const clicked2 = clickReadAllReviewsTrigger(document);
    if (clicked2) {
      const modal2 = await waitForModal(6000);
      if (modal2) {
        await waitForModalInteractive(modal2, 2000);
        console.log(
          "Modal opened? ",
          !!document.querySelector(".bui-modal__content")
        );
        return modal2;
      }
    }

    throw new Error(
      'Could not open reviews modal. "Read all reviews" trigger not found or modal did not appear.'
    );
  }

  function clickReadAllReviewsTrigger(root) {
    const primary = VS_SELECTORS.findClickableByText(
      root,
      VS_SELECTORS.TEXT.readAllReviews
    );
    if (primary) {
      primary.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      primary.click();
      return true;
    }

    // Additional best-effort: anything that contains “reviews” and looks like a link/button.
    const fallback = VS_SELECTORS.findClickableByText(root, ["reviews"]);
    if (fallback) {
      fallback.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      fallback.click();
      return true;
    }
    return false;
  }

  function waitForModal(timeoutMs = 6000) {
    const started = Date.now();
    const existing = getTopmostModal();
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const obs = new MutationObserver(() => {
        const modal = getTopmostModal();
        if (modal) {
          obs.disconnect();
          resolve(modal);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          obs.disconnect();
          resolve(null);
        }
      });

      obs.observe(document.documentElement, { childList: true, subtree: true });
      window.setTimeout(() => {
        obs.disconnect();
        resolve(getTopmostModal());
      }, timeoutMs);
    });
  }

  function getTopmostModal() {
    for (const sel of VS_SELECTORS.SELECTORS.modalRoots) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function sendToBackgroundForAnalysis(extractedData) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          { type: "ANALYZE_REVIEWS", data: extractedData },
          (response) => {
            const err = chrome.runtime.lastError;
            if (err) return reject(new Error(err.message));
            resolve(response);
          }
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  async function setSortToLowest(modalRoot) {
    // Primary path: standard select sorter from verified DOM.
    const selectEl =
      document.querySelector("select#reviewListSorters") ||
      document.querySelector('[data-testid="reviews-sorter-component"]');
    if (selectEl) {
      selectEl.value = "SCORE_ASC";
      selectEl.dispatchEvent(new Event("input", { bubbles: true }));
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      console.log("[VibeSifter] Select value changed to SCORE_ASC. Waiting for reload...");
      await waitForReviewsToReload(modalRoot);
      return;
    }

    // Fallback: previous button-clicking logic for alternate UIs.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const sortTrigger = findSortTriggerBulletproof(modalRoot);
      if (!sortTrigger) {
        if (attempt === 3) {
          console.warn("[VibeSifter] Sort trigger not found after retries. Proceeding without sorting.");
          return;
        }
        await delayWithSetTimeout(1000);
        continue;
      }

      console.log("[VibeSifter] Attempting to click sort trigger...");
      sortTrigger.click();
      await fastPoll(() => findLowestScoresOptionBulletproof(modalRoot), 1800, 50);

      console.log("[VibeSifter] Searching for 'Lowest scores' option...");
      const option = findLowestScoresOptionBulletproof(modalRoot);
      if (!option) {
        if (attempt === 3) {
          console.warn("[VibeSifter] Lowest-score option not found after retries. Proceeding without sorting.");
          return;
        }
        await delayWithSetTimeout(1000);
        continue;
      }

      option.click();
      await waitForReviewsToReload(modalRoot);
      return;
    }
  }

  function isLowestScoreAlreadySelected(root) {
    const scope = root || document;
    const textHit = VS_SELECTORS.findClickableByText(scope, VS_SELECTORS.TEXT.lowestScore);
    if (textHit && /(selected|active|checked)/i.test(textHit.className || "")) return true;

    const selectedNodes = scope.querySelectorAll(
      '[aria-selected="true"], [aria-current="true"], [aria-checked="true"]'
    );
    for (const el of selectedNodes) {
      const t = VS_SELECTORS.elementText(el).toLowerCase();
      if (VS_SELECTORS.TEXT.lowestScore.some((p) => t.includes(p))) return true;
    }

    return false;
  }

  function findExactLowestScoresOption(modalRoot) {
    const all = Array.from(document.querySelectorAll("span, button")).filter(
      (el) => (el.textContent || "").trim() === "Lowest scores"
    );
    if (all.length === 0) return null;

    const activeModal = getTopmostModal() || modalRoot;
    const visible = all.filter(isElementVisible);
    const inVisibleModal = visible.filter((el) => activeModal && activeModal.contains(el));
    if (inVisibleModal.length > 0) return inVisibleModal[0];

    const inGivenModal = visible.filter((el) => modalRoot && modalRoot.contains(el));
    if (inGivenModal.length > 0) return inGivenModal[0];

    if (visible.length > 0) return visible[0];
    return all[0];
  }

  function findSortTriggerBulletproof(modalRoot) {
    const byTestId =
      modalRoot.querySelector('button[data-testid="sorters-dropdown-trigger"]') ||
      document.querySelector('button[data-testid="sorters-dropdown-trigger"]');
    if (byTestId) return byTestId;

    const allButtons = Array.from(document.querySelectorAll("button"));
    const textMatch = allButtons.find((el) => {
      const t = (el.textContent || "").trim();
      return t.includes("Sort by") || t.includes("Sort");
    });
    if (textMatch) return textMatch;

    return null;
  }

  function findLowestScoresOptionBulletproof(modalRoot) {
    const byTestId =
      document.querySelector('[data-testid="sorter-option-score_asc"]') ||
      modalRoot.querySelector('[data-testid="sorter-option-score_asc"]');
    if (byTestId) return byTestId;

    const candidates = Array.from(document.querySelectorAll("span, button, li"));
    const allMatches = candidates.filter((el) => {
      const t = (el.textContent || "").trim();
      return t === "Lowest scores" || t === "Lowest first";
    });
    if (allMatches.length === 0) return null;

    const activeModal = getTopmostModal() || modalRoot;
    const visibleInModal = allMatches.filter(
      (el) => isElementVisible(el) && activeModal && activeModal.contains(el)
    );
    if (visibleInModal.length > 0) return visibleInModal[0];

    const visible = allMatches.filter(isElementVisible);
    if (visible.length > 0) return visible[0];

    return allMatches[0];
  }

  function waitForModalInteractive(modalEl, timeoutMs) {
    const started = Date.now();
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const style = window.getComputedStyle(modalEl);
        const interactive =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          modalEl.querySelector("button, select, [data-testid*='review' i]");
        if (interactive) {
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(modalEl, { childList: true, subtree: true, attributes: true });
      const tick = () => {
        if (!modalEl || !document.contains(modalEl)) return resolve(false);
        const style = window.getComputedStyle(modalEl);
        const interactive =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          modalEl.querySelector("button, select, [data-testid*='review' i]");
        if (interactive) {
          observer.disconnect();
          return resolve(true);
        }
        if (Date.now() - started >= timeoutMs) {
          observer.disconnect();
          return resolve(false);
        }
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findButtonByAnyText(phrases) {
    const want = (phrases || []).map((p) => String(p).toLowerCase());
    const buttons = Array.from(document.querySelectorAll("button"));
    return (
      buttons.find((b) => {
        const t = VS_SELECTORS.elementText(b).toLowerCase();
        return t && want.some((p) => t.includes(p));
      }) || null
    );
  }

  function selectNativeOption(selectEl, phraseList) {
    const phrases = (phraseList || []).map((p) => p.toLowerCase());
    const options = Array.from(selectEl.options || []);
    const match = options.find((o) =>
      phrases.some((p) => (o.textContent || "").toLowerCase().includes(p))
    );
    if (!match) throw new Error('Could not find "Lowest score" option.');
    selectEl.value = match.value;
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findOptionByText(root, phraseList) {
    const phrases = (phraseList || []).map((p) => p.toLowerCase());
    const candidates = root.querySelectorAll(
      '[role="option"], [role="menuitemradio"], [role="menuitem"], li, button, a, div'
    );
    for (const el of candidates) {
      const t = VS_SELECTORS.elementText(el).toLowerCase();
      if (!t) continue;
      if (phrases.some((p) => t.includes(p))) return el;
    }
    return null;
  }

  async function waitForReviewsToReload(modalRoot) {
    // Prefer spinner disappearance (Booking loading overlay), then childList mutation.
    const container = modalRoot;
    const spinnerSelectors = [
      '[data-testid*="spinner" i]',
      '[data-testid*="loading" i]',
      '[class*="spinner" i]',
      '[class*="loading" i]',
      '[aria-busy="true"]'
    ];
    const hasSpinner = () =>
      spinnerSelectors.some((sel) => document.querySelector(sel) || container.querySelector(sel));

    const sawSpinner = await fastPoll(() => hasSpinner(), 900, 50);
    if (sawSpinner) {
      await fastPoll(() => !hasSpinner(), 3500, 50);
      return;
    }

    await new Promise((resolve) => {
      const obs = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.type === "childList")) {
          obs.disconnect();
          resolve(true);
        }
      });
      obs.observe(container, { childList: true, subtree: true });
      setTimeout(() => {
        obs.disconnect();
        resolve(false);
      }, 2500);
    });
  }

  function ensureShield() {
    if (document.getElementById(SHIELD_ID)) return;
    const shield = document.createElement("div");
    shield.id = SHIELD_ID;
    shield.innerHTML = `<div class="vs-shield-pill">Sifter Shield Active</div>`;
    document.body.appendChild(shield);
  }

  function setShieldActive(active, message) {
    ensureShield();
    const shield = document.getElementById(SHIELD_ID);
    if (!shield) return;
    if (active) {
      shield.classList.add("is-active");
      const textEl = shield.querySelector(".vs-shield-pill");
      if (textEl && message) textEl.textContent = message;
    } else {
      shield.classList.remove("is-active");
    }
  }

  function countReviewCards(root) {
    for (const sel of VS_SELECTORS.SELECTORS.reviewCardCandidatesInModal) {
      const n = root.querySelectorAll(sel).length;
      if (n) return n;
    }
    return 0;
  }

  async function extractData(modalRoot, prefoundReviewNodes) {
    const hotelName = extractHotelName();
    const neighborhood = extractNeighborhoodOrAddress();
    const currentPrice = extractCurrentPrice();

    // Auto-scroll: trigger lazy-loaded reviews inside modal (best-effort).
    await autoScrollModal(modalRoot);

    const reviewsDetailed = extractReviewTexts(modalRoot, 30, prefoundReviewNodes);
    const reviewTexts = reviewsDetailed.map((r) => r.text);

    return {
      extractedAt: new Date().toISOString(),
      source: {
        href: location.href,
        host: location.host,
        pathname: location.pathname
      },
      hotelName,
      neighborhood,
      currentPrice,
      reviewsDetailed,
      reviewTexts,
      counts: {
        reviewTexts: reviewTexts.length
      }
    };
  }

  async function waitForReviewsWithRetry(modalRoot, btnEl, maxRetries, intervalMs) {
    const totalTimeout = Math.max(1200, maxRetries * intervalMs);
    const started = Date.now();
    let attempt = 0;

    // Immediate fast path.
    const immediate = findReviews(modalRoot);
    if (immediate.length > 0) {
      if (btnEl) btnEl.textContent = "Sifting through Vibe... 🔍";
      return immediate;
    }

    return new Promise((resolve) => {
      let resolved = false;
      let scrollerTick = null;

      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        if (observer) observer.disconnect();
        if (scrollerTick) window.clearInterval(scrollerTick);
        resolve(result);
      };

      const maybeResolve = () => {
        const found = findReviews(modalRoot);
        if (found.length > 0) {
          if (btnEl) btnEl.textContent = "Sifting through Vibe... 🔍";
          finish(found);
          return true;
        }
        return false;
      };

      const observer = new MutationObserver(() => {
        maybeResolve();
      });
      observer.observe(modalRoot, { childList: true, subtree: true });

      // Light nudge loop while observer listens, replacing fixed 1s sleeps.
      scrollerTick = window.setInterval(() => {
        if (resolved) return;
        attempt += 1;
        console.log(`[VibeSifter] Retry #${attempt}: Found 0 reviews. Waiting...`);
        if (btnEl) btnEl.textContent = `Waiting for Reviews... (retry ${Math.min(attempt, maxRetries)}/${maxRetries})`;
        autoScrollModal(modalRoot).catch(() => {});
        maybeResolve();
      }, 220);

      // Fast poll backstop (50ms) so we don't wait for mutation callback timing.
      fastPoll(() => {
        const found = findReviews(modalRoot);
        return found.length > 0 ? found : null;
      }, totalTimeout, 50).then((found) => {
        if (found && found.length > 0) {
          if (btnEl) btnEl.textContent = "Sifting through Vibe... 🔍";
          finish(found);
          return;
        }

        // Fallback after timeout: any modal element whose class contains "review"
        // and has meaningful text length.
        const fallback = Array.from(modalRoot.querySelectorAll('[class*="review" i]')).filter(
          (el) => {
            const t = VS_SELECTORS.elementText(el);
            return t && t.length > 30;
          }
        );
        const elapsed = Date.now() - started;
        console.log(`[VibeSifter] Review wait timeout (${elapsed}ms). Using fallback nodes: ${fallback.length}`);
        finish(fallback);
      });
    });
  }

  async function autoScrollModal(modalRoot) {
    const scroller = findScrollableContainer(modalRoot) || modalRoot;
    try {
      scroller.scrollBy({ top: 700, left: 0, behavior: "instant" });
    } catch {
      scroller.scrollTop = Math.min(scroller.scrollTop + 700, scroller.scrollHeight);
    }
    await sleep(650);
  }

  function findScrollableContainer(root) {
    const els = root.querySelectorAll("div, section");
    for (const el of els) {
      const style = window.getComputedStyle(el);
      const canScroll =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight + 20;
      if (canScroll) return el;
    }
    return null;
  }

  function extractHotelName() {
    const fallbackSelectors = [
      ".pp-header__title",
      "h2.hp__hotel-name",
      '[data-capla-component*="HotelHeader"]',
      '[data-testid="title"]',
      '[data-testid="property-title"]',
      "h1"
    ];
    return getFirstTextBySelectors(fallbackSelectors, 2);
  }

  function extractNeighborhoodOrAddress() {
    for (const sel of VS_SELECTORS.SELECTORS.neighborhoodOrAddress) {
      const el = document.querySelector(sel);
      const t = VS_SELECTORS.elementText(el);
      if (t && t.length >= 2) return t;
    }
    return null;
  }

  function extractCurrentPrice() {
    const seen = new Set();
    const candidates = [];

    const priceSelectors = [
      '[data-testid="price-and-discounted-price"]',
      '[data-testid="price-and-discounted-price"] *',
      '[data-testid="price-summary"]',
      '[data-testid="price-summary"] *',
      ".prco-valign-middle-helper",
      ".bui-price-display__value",
      '[class*="price"]'
    ];

    for (const sel of priceSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const t = VS_SELECTORS.elementText(el);
        if (!t || t.length < 2) return;
        if (seen.has(t)) return;
        seen.add(t);
        candidates.push(t);
      });
    }

    // Prefer strings that contain a currency sign or typical currency codes.
    const scored = candidates
      .map((t) => ({ t, s: scorePriceText(t) }))
      .sort((a, b) => b.s - a.s);

    return scored.length && scored[0].s > 0 ? scored[0].t : candidates[0] || null;
  }

  function scorePriceText(t) {
    const s = t.toLowerCase();
    let score = 0;
    if (/[€$£¥₩]/.test(t)) score += 3;
    if (/\b(usd|eur|gbp|jpy|krw|cad|aud)\b/i.test(t)) score += 2;
    if (/\d/.test(t)) score += 1;
    if (s.includes("tax") || s.includes("fees")) score += 1;
    if (t.length > 120) score -= 2;
    return score;
  }

  function findReviews(modalRoot) {
    const reviewSelectors = [
      VS_SELECTORS.SELECTORS.REVIEW_CARD || '[data-testid="review-card"]',
      '[data-testid^="review-card"]',
      '[data-testid="review-card"]',
      '[data-testid*="review-list"] article',
      '[class*="review_list"] article',
      '[class*="review"] article'
    ];
    const inModal = getFirstElementsBySelectors(modalRoot, reviewSelectors);
    if (inModal.length > 0) return inModal;
    return getFirstElementsBySelectors(document, reviewSelectors);
  }

  function extractReviewTexts(modalRoot, limit, prefoundReviewNodes) {
    const reviews = [];
    const seen = new Set();
    const cards = Array.isArray(prefoundReviewNodes)
      ? [...prefoundReviewNodes]
      : findReviews(modalRoot);

    const preferredSelectors = [
      VS_SELECTORS.SELECTORS.NEGATIVE_TEXT,
      VS_SELECTORS.SELECTORS.POSITIVE_TEXT
    ].filter(Boolean);

    for (const card of cards) {
      let raw = "";

      // 1) Requested per-card specific text selector(s), if provided.
      for (const sel of preferredSelectors) {
        const node = card.querySelector(sel);
        const t = VS_SELECTORS.elementText(node);
        if (t) {
          raw = t;
          break;
        }
      }

      // 2) Fallback: review body testid in the card.
      if (!raw) {
        const bodyNode = card.querySelector('[data-testid="review-body"]');
        raw = VS_SELECTORS.elementText(bodyNode);
      }

      // 3) Final fallback: entire card text.
      if (!raw) raw = VS_SELECTORS.elementText(card);

      const t = optimizeReviewText(String(raw || "").trim());
      if (t.length <= 20) continue;

      const norm = t.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      const dateText = extractReviewDateText(card);
      reviews.push({
        text: t,
        dateText
      });

      if (reviews.length >= limit) break;
    }

    return capReviewsByWordCount(prioritizeReviewsByRedFlags(reviews), 1500);
  }

  function optimizeReviewText(text) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    const sentence = pickRedFlagSentence(cleaned) || cleaned;
    if (sentence.length <= 200) return sentence;
    return `${sentence.slice(0, 200).trim()}...`;
  }

  function pickRedFlagSentence(text) {
    const keywords = [
      "noise", "noisy", "loud", "thin walls", "mold", "mould", "smell", "stink",
      "rude", "racist", "bedbug", "roach", "dirty", "unsafe", "theft", "stolen",
      "hidden fee", "overcharged", "construction", "queue", "broken", "no hot water"
    ];
    const sentences = String(text || "").split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      const low = s.toLowerCase();
      if (keywords.some((k) => low.includes(k))) return s.trim();
    }
    return "";
  }

  function prioritizeReviewsByRedFlags(reviews) {
    const keywords = [
      "noise", "mold", "mould", "smell", "rude", "bedbug", "roach", "dirty", "unsafe",
      "theft", "stolen", "hidden", "construction", "broken", "queue"
    ];
    return [...reviews].sort((a, b) => {
      const aHit = keywords.some((k) => String(a.text || "").toLowerCase().includes(k));
      const bHit = keywords.some((k) => String(b.text || "").toLowerCase().includes(k));
      if (aHit && !bHit) return -1;
      if (!aHit && bHit) return 1;
      return 0;
    });
  }

  function capReviewsByWordCount(reviews, maxWords) {
    const out = [];
    let words = 0;
    for (const r of reviews) {
      const wc = String(r.text || "").split(/\s+/).filter(Boolean).length;
      if (words + wc > maxWords) break;
      out.push(r);
      words += wc;
    }
    return out;
  }

  function extractReviewDateText(cardEl) {
    const dateSignals = ["stayed in", "reviewed", "reviewed:"];
    const nodes = cardEl.querySelectorAll("div, span, p, time");
    for (const el of nodes) {
      const t = VS_SELECTORS.elementText(el);
      const low = t.toLowerCase();
      if (dateSignals.some((s) => low.includes(s))) return t;
    }
    return "";
  }

  function renderAnalysisPanel(analysis, extractedData) {
    clearLoadingMessages();
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.classList.remove("is-visible");
      window.setTimeout(() => {
        if (existing && existing.parentNode) existing.remove();
      }, 180);
    }

    const panel = document.createElement("aside");
    panel.id = PANEL_ID;

    const issues = sortIssuesForDisplay(normalizeIssues(analysis));
    const pivotCopy = getSafePivotCopy(issues);
    const showLimit = 8;
    const initialIssues = issues.slice(0, showLimit);
    const remainingIssues = issues.slice(showLimit);
    const hasMore = issues.length > showLimit;

    panel.innerHTML = `
      <div class="vs-panel-head">
        <div class="vs-topline">
          <div class="vs-brand">VIBESIFTER INTEL</div>
          <button class="vs-close" type="button" aria-label="Close">X</button>
        </div>
        <div class="vs-hotel">${escapeHtml(extractedData.hotelName || "Hotel")}</div>
        <div class="vs-verdict">${escapeHtml(analysis?.final_verdict || "This stay screams compromise.")}</div>
        <div class="vs-note">${escapeHtml(analysis?.notes || "")}</div>
      </div>
      <div class="vs-panel-body">
        <div class="vs-list">${initialIssues.map((x) => issueRowHtml(x)).join("")}</div>
        ${
          hasMore
            ? `<div class="vs-more-wrap">${remainingIssues.map((x) => issueRowHtml(x)).join("")}</div>
               <button class="vs-btn vs-btn-light vs-show-more" type="button">Show more issues</button>`
            : ""
        }
      </div>
      <div class="vs-actions">
        <div class="vs-ab">
          <label for="vs-order-mode">Alternative ranking (A/B test)</label>
          <select id="vs-order-mode">
            <option value="class_and_price">A - class_and_price</option>
            <option value="bayesian_review_score">B - bayesian_review_score</option>
            <option value="auto_ab">Auto A/B (alternating)</option>
          </select>
        </div>
        <button class="vs-btn vs-btn-light" type="button" data-role="sift-again">Sift Again</button>
        <button class="vs-btn vs-btn-danger vs-pulse" type="button" data-role="alternatives">${escapeHtml(pivotCopy.buttonText)}</button>
        <div class="vs-pivot-caption">${escapeHtml(pivotCopy.caption)}</div>
        <div class="vs-affiliate-disclosure">May contain affiliate links.</div>
      </div>
    `;
    const orderModeEl = panel.querySelector("#vs-order-mode");
    if (orderModeEl) {
      orderModeEl.value = getAlternativeOrderMode();
      orderModeEl.addEventListener("change", () => {
        setAlternativeOrderMode(orderModeEl.value);
      });
    }


    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("is-visible"));

    panel.querySelector(".vs-close")?.addEventListener("click", () => {
      clearLoadingMessages();
      panel.remove();
    });

    panel.querySelector('[data-role="sift-again"]')?.addEventListener("click", async () => {
      clearLoadingMessages();
      panel.remove();
      const btn = document.getElementById(BTN_ID);
      if (btn) {
        btn.removeAttribute("data-busy");
        btn.textContent = "Sift This Vibe";
      }
      await onSiftClicked();
    });

    panel.querySelector('[data-role="alternatives"]')?.addEventListener("click", async (evt) => {
      const btn = evt.currentTarget;
      if (!(btn instanceof HTMLElement)) return;
      const originalText = btn.textContent || "Find Safer Alternatives";
      btn.classList.add("is-loading");
      btn.textContent = "Curating the best options...";
      await delayWithSetTimeout(700);
      await handleAlternativeSearch(extractedData, issues, getAlternativeOrderMode());
      await delayWithSetTimeout(300);
      btn.classList.remove("is-loading");
      btn.textContent = originalText;
    });

    if (hasMore) {
      const showMoreBtn = panel.querySelector(".vs-show-more");
      showMoreBtn?.addEventListener("click", () => {
        const moreWrap = panel.querySelector(".vs-more-wrap");
        if (!moreWrap) return;
        moreWrap.classList.add("is-expanded");
        showMoreBtn.remove();
      });
    }
  }

  function renderAnalysisLoadingPanel(extractedData) {
    clearLoadingMessages();
    const existing = document.getElementById(PANEL_ID);
    if (existing) existing.remove();

    const panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.classList.add("is-loading-state");
    panel.innerHTML = `
      <div class="vs-panel-head">
        <div class="vs-topline">
          <div class="vs-brand">VIBESIFTER INTEL</div>
        </div>
        <div class="vs-hotel">${escapeHtml(extractedData.hotelName || "Hotel")}</div>
        <div class="vs-note">Current price: ${escapeHtml(extractedData.currentPrice || "N/A")}</div>
        <div class="vs-verdict" data-role="loading-message">🔍 Sniffing out hidden bedbugs...</div>
      </div>
      <div class="vs-panel-body">
        <div class="vs-skeleton vs-skel-line lg w80"></div>
        <div class="vs-skeleton vs-skel-line w60"></div>
        <div class="vs-skeleton vs-skel-line w95"></div>
        <div class="vs-skeleton vs-skel-line w80"></div>
        <div class="vs-skeleton vs-skel-line w60"></div>
      </div>
    `;
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("is-visible"));

    const loadingMessages = [
      "🔍 Sniffing out hidden bedbugs...",
      "🤫 Measuring wall-thinness from reviews...",
      "💸 Calculating the 'Regret-to-Price' ratio...",
      "🕵️‍♂️ Filtering out suspicious 5-star bots..."
    ];
    let idx = 0;
    const msgEl = panel.querySelector('[data-role="loading-message"]');
    loadingMessageInterval = window.setInterval(() => {
      if (!msgEl) return;
      idx = (idx + 1) % loadingMessages.length;
      msgEl.textContent = loadingMessages[idx];
    }, 1500);
  }

  function clearLoadingMessages() {
    if (loadingMessageInterval) {
      window.clearInterval(loadingMessageInterval);
      loadingMessageInterval = null;
    }
  }

  function updateLoadingVerdictText(text) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || !panel.classList.contains("is-loading-state")) return;
    const el = panel.querySelector('[data-role="loading-message"]');
    if (!el) return;
    if (text && text.trim()) el.textContent = text.trim();
  }

  function extractVerdictFromStream(raw) {
    const s = String(raw || "");
    const m = s.match(/"final_verdict"\s*:\s*"([^"]{8,240})/);
    if (m && m[1]) return m[1].replace(/\\"/g, '"');
    return "";
  }

  function buildAnalysisCacheKey() {
    const u = new URL(window.location.href);
    const checkin = u.searchParams.get("checkin") || "";
    const checkout = u.searchParams.get("checkout") || "";
    const adults = u.searchParams.get("group_adults") || "";
    return `vibeSifter.cache:${u.pathname}:${checkin}:${checkout}:${adults}`;
  }

  async function loadCachedAnalysisForCurrentHotel() {
    const key = buildAnalysisCacheKey();
    const res = await chrome.storage.local.get(key);
    const payload = res[key];
    if (!payload || !payload.ts) return null;
    if (Date.now() - Number(payload.ts) > ANALYSIS_CACHE_TTL_MS) return null;
    if (!payload.analysis || !payload.extractedData) return null;
    return payload;
  }

  async function saveCachedAnalysisForCurrentHotel(analysis, extractedData) {
    const key = buildAnalysisCacheKey();
    await chrome.storage.local.set({
      [key]: {
        ts: Date.now(),
        analysis,
        extractedData
      }
    });
  }

  function normalizeIssues(analysis) {
    const raw = Array.isArray(analysis?.issues) ? analysis.issues : [];
    if (raw.length > 0) {
      return raw.map((i) => ({
        category: i?.category || "General",
        specific_issue: i?.specific_issue || "Issue detail unavailable",
        count: Number(i?.count || 0),
        severity: Math.max(1, Math.min(10, Number(i?.severity || 5)))
      }));
    }
    const rf = Array.isArray(analysis?.redFlags) ? analysis.redFlags : [];
    return rf.map((r) => ({
      category: r?.flag || "General",
      specific_issue: `${r?.flag || "Issue"} repeatedly mentioned`,
      count: Number(r?.mentions || 0),
      severity: Math.max(1, Math.min(10, Number(r?.mentions || 1)))
    }));
  }

  function issueRowHtml(issue) {
    const width = Math.max(10, Math.min(100, (issue.severity / 10) * 100));
    const sevClass = getSeverityClass(issue.severity);
    return `
      <article class="vs-item">
        <div class="vs-item-top">
          <span class="vs-icon">${iconForCategory(issue.category)}</span>
          <span class="vs-category">${escapeHtml(issue.category)}</span>
        </div>
        <div class="vs-issue">${escapeHtml(issue.specific_issue)}</div>
        <div class="vs-meter"><span class="${sevClass}" style="width:${width}%"></span></div>
        <div class="vs-meta">Severity ${escapeHtml(String(issue.severity))}/10 · Mentioned by ${escapeHtml(String(issue.count))}</div>
      </article>
    `;
  }

  function getSeverityClass(severity) {
    const s = Number(severity || 0);
    if (s >= 8) return "vs-sev-critical";
    if (s >= 5) return "vs-sev-warning";
    return "vs-sev-caution";
  }

  function sortIssuesForDisplay(issues) {
    const criticalKeywords = ["bedbug", "bedbugs", "safety", "theft"];
    const withMeta = (issues || []).map((i) => {
      const hay = `${i.category} ${i.specific_issue}`.toLowerCase();
      const stickyCritical = criticalKeywords.some((k) => hay.includes(k));
      return { ...i, stickyCritical };
    });

    return withMeta.sort((a, b) => {
      if (a.stickyCritical && !b.stickyCritical) return -1;
      if (!a.stickyCritical && b.stickyCritical) return 1;
      if (b.severity !== a.severity) return b.severity - a.severity;
      return (b.count || 0) - (a.count || 0);
    });
  }

  async function handleAlternativeSearch(extractedData, issues, orderMode) {
    const current = new URL(window.location.href);
    const params = current.searchParams;
    const keep = ["checkin", "checkout", "group_adults", "group_children", "dest_id", "dest_type"];
    const search = new URL("https://www.booking.com/searchresults.html");

    for (const k of keep) {
      const v = params.get(k);
      if (v) search.searchParams.set(k, v);
    }

    const topCategory = String(issues?.[0]?.category || "").toLowerCase();
    const geoHint = String(extractedData?.neighborhood || "").trim();
    let biasKeywords = "safe quiet clean";
    if (topCategory.includes("sleep") || topCategory.includes("noise")) biasKeywords = "quiet soundproof";
    if (topCategory.includes("hygiene")) biasKeywords = "clean hygiene";
    if (topCategory.includes("safety") || topCategory.includes("theft")) biasKeywords = "safe secure";
    if (topCategory.includes("facility")) biasKeywords = "new renovated";
    if (topCategory.includes("service")) biasKeywords = "friendly staff";
    if (topCategory.includes("location")) biasKeywords = "safe area";
    if (topCategory.includes("digital")) biasKeywords = "fast wifi desk";

    // Do NOT reuse URL "ss" (it can be stale from previous searches, e.g., Amsterdam).
    // Prefer current page location hints so destination doesn't drift.
    const baseSearchTerm = extractCityLikeTerm(geoHint) || "destination";
    search.searchParams.set("ss", `${baseSearchTerm} ${biasKeywords}`.trim());
    search.searchParams.set("nflt", `review_score=85;${getPositiveCategoryFilter(topCategory)}`);
    const resolvedOrder = resolveOrderMode(orderMode);
    search.searchParams.set("order", resolvedOrder);
    const storageRes = await chrome.storage.local.get("affiliate_id");
    const affiliateId = String(storageRes?.affiliate_id || "YOUR_AFFILIATE_ID").trim();
    search.searchParams.set("aid", affiliateId || "YOUR_AFFILIATE_ID");
    search.searchParams.set("label", "vibesifter_extension_v1");

    const priceMax = derivePriceMax(extractedData?.currentPrice);
    if (priceMax) search.searchParams.set("price_max", String(priceMax));
    console.log(`[VibeSifter] Safe Pivot order mode: ${orderMode} -> ${resolvedOrder}`);

    window.open(search.toString(), "_blank", "noopener,noreferrer");
  }

  function extractCityLikeTerm(locationText) {
    const raw = String(locationText || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    // Booking addresses commonly include comma-separated segments; city is usually near the end.
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 2];
      if (candidate && candidate.length >= 2) return candidate;
    }
    return parts[0] || "";
  }

  function getSafePivotCopy(issues) {
    const topCategory = String(issues?.[0]?.category || "").toLowerCase();
    if (topCategory.includes("noise") || topCategory.includes("sleep")) {
      return {
        buttonText: "🤫 See 'Quiet Certified' Alternatives (Score 9.0+)",
        caption: "Filter: Score 8.5+ & Real Guest Verified"
      };
    }
    if (topCategory.includes("hygiene") || topCategory.includes("mould") || topCategory.includes("mold")) {
      return {
        buttonText: "🧼 See 'Sparkling Clean' Alternatives (Score 9.0+)",
        caption: "Filter: Score 8.5+ & Real Guest Verified"
      };
    }
    return {
      buttonText: "🌟 See Safer, High-Rated Gems Nearby",
      caption: "Filter: Score 8.5+ & Real Guest Verified"
    };
  }

  function getPositiveCategoryFilter(category) {
    const c = String(category || "").toLowerCase();
    if (c.includes("noise") || c.includes("sleep")) return "jq=quiet;";
    if (c.includes("hygiene")) return "jq=clean;";
    if (c.includes("safety") || c.includes("theft") || c.includes("location")) return "jq=safe;";
    if (c.includes("service")) return "jq=friendly staff;";
    if (c.includes("digital")) return "jq=wifi;";
    return "";
  }

  function derivePriceMax(currentPriceText) {
    const raw = String(currentPriceText || "");
    if (!raw) return null;
    const match = raw.match(/(\d[\d.,]*)/);
    if (!match) return null;
    const numeric = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.round(numeric * 1.15);
  }

  function resolveOrderMode(mode) {
    if (mode === "bayesian_review_score") return "bayesian_review_score";
    if (mode === "auto_ab") {
      const key = "vibeSifter.altOrderAutoAB.flip";
      const prev = localStorage.getItem(key) === "1";
      const next = !prev;
      localStorage.setItem(key, next ? "1" : "0");
      return next ? "bayesian_review_score" : "class_and_price";
    }
    return "bayesian_review_score";
  }

  function getAlternativeOrderMode() {
    const v = localStorage.getItem(ALT_ORDER_KEY);
    if (v === "bayesian_review_score" || v === "auto_ab" || v === "class_and_price") return v;
    return "bayesian_review_score";
  }

  function setAlternativeOrderMode(mode) {
    const safe =
      mode === "bayesian_review_score" || mode === "auto_ab" || mode === "class_and_price"
        ? mode
        : "class_and_price";
    localStorage.setItem(ALT_ORDER_KEY, safe);
  }

  function getFirstTextBySelectors(selectors, minLen) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const t = VS_SELECTORS.elementText(el);
      if (t && t.length >= (minLen || 1)) return t;
    }
    return null;
  }

  function getFirstElementsBySelectors(root, selectors) {
    const scope = root || document;
    for (const sel of selectors) {
      const items = Array.from(scope.querySelectorAll(sel));
      if (items.length > 0) return items;
    }
    return [];
  }

  function checkPageStructure(modalRoot) {
    const missing = [];
    if (!extractHotelName()) missing.push("hotelName");
    if (!extractCurrentPrice()) missing.push("currentPrice");
    if (findReviews(modalRoot).length === 0) missing.push("reviewCards");
    if (missing.length === 0) return;

    chrome.runtime.sendMessage(
      {
        type: "PAGE_STRUCTURE_WARNING",
        data: {
          href: window.location.href,
          missing,
          ts: new Date().toISOString()
        }
      },
      () => {
        // Best-effort telemetry only.
        void chrome.runtime?.lastError;
      }
    );
  }

  function iconForCategory(category) {
    const c = String(category || "").toLowerCase();
    if (c.includes("hygiene")) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/><path d="M8 12a4 4 0 118 0"/><path d="M6 16h12"/></svg>';
    }
    if (c.includes("sleep")) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18v6H3z"/><path d="M7 12V9a2 2 0 012-2h4"/></svg>';
    }
    if (c.includes("facility")) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/></svg>';
    }
    if (c.includes("service")) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0114 0"/></svg>';
    }
    if (c.includes("location")) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>';
    }
    if (c.includes("digital")) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/></svg>';
    }
    if (c.includes("security") || c.includes("safety") || c.includes("theft")) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 4v6c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V7l7-4z"/></svg>';
    }
    if (c.includes("noise")) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15 9a4 4 0 010 6"/><path d="M18 7a7 7 0 010 10"/></svg>';
    }
    if (c.includes("hygiene") || c.includes("mould") || c.includes("mold")) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
    }
    if (c.includes("service")) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 7h8"/><path d="M6 11h12"/><path d="M4 15h16"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>';
  }

  // Inject button on initial load and on SPA navigations.
  ensureButton();

  const navObserver = new MutationObserver(() => {
    // Booking often navigates via client-side routing; re-check.
    if (!document.getElementById(BTN_ID) && isLikelyHotelDetailPage()) {
      ensureButton();
    }
  });
  navObserver.observe(document.documentElement, { childList: true, subtree: true });
})();

