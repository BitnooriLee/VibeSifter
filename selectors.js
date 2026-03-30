// Centralized selectors/labels for Booking.com scraping.
// Keep this file as the single source of truth when Booking UI changes.

(function () {
  const TEXT = {
    readAllReviews: [
      "read all reviews",
      "see all reviews",
      "all reviews",
      "guest reviews"
    ],
    sortBy: ["sort by", "sort"],
    lowestScore: ["lowest score", "lowest first", "lowest", "low score"]
  };

  const SELECTORS = {
    modalRoots: [
      '[role="dialog"][aria-modal="true"]',
      '[role="dialog"]',
      '[aria-modal="true"]'
    ],
    hotelName: [
      '[data-testid="title"]',
      '[data-testid="property-title"]',
      'h1'
    ],
    neighborhoodOrAddress: [
      '[data-testid="address"]',
      '[data-testid="property-address"]',
      '[data-testid="location"]'
    ],
    priceCandidates: [
      '[data-testid="price-and-discounted-price"]',
      '[data-testid="price-and-discounted-price"] *',
      '[data-testid="price-summary"]',
      '[data-testid="price-summary"] *'
    ],
    reviewCardCandidatesInModal: [
      '[data-testid="review-card"]',
      '[data-testid^="review-card"]',
      '[data-testid="review"]'
    ],
    REVIEW_CARD: '[data-testid="review-card"]',
    NEGATIVE_TEXT: "",
    POSITIVE_TEXT: "",
    reviewTextCandidatesInCard: [
      '[data-testid="review-text"]',
      '[data-testid="review-text"] span',
      '[data-testid="review-positive-text"]',
      '[data-testid="review-negative-text"]',
      '[data-testid="review-body"]',
      'span',
      'div'
    ],
    // High-signal proof from DevTools (2024 Booking layout): primary review text nodes.
    primaryReviewText: [".f6e3a11b0d.ae5dbab14d.e95943ce9b"],
    fallbackReviewText: ['[data-testid="review-body"]'],
    sortTriggerCandidates: [
      // Common listbox trigger patterns (Booking 2024+ often uses listbox popovers).
      'button[aria-haspopup="listbox"]',
      'button[aria-controls][aria-expanded]',
      '[aria-label*="Sort" i]',
      '[data-testid*="sort" i]',
      '[data-testid*="review-sort" i]',
      '[data-testid*="sorters" i]'
    ]
  };

  function normalizeText(s) {
    return (s || "")
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function textIncludes(haystack, needle) {
    return normalizeText(haystack).toLowerCase().includes(needle.toLowerCase());
  }

  function elementText(el) {
    if (!el) return "";
    return normalizeText(el.innerText || el.textContent || "");
  }

  function findClickableByText(root, phrases) {
    const scope = root || document;
    const clickable = scope.querySelectorAll(
      'button, a, [role="button"], [role="link"]'
    );
    const want = (phrases || []).map((p) => p.toLowerCase());

    for (const el of clickable) {
      const t = elementText(el).toLowerCase();
      if (!t) continue;
      if (want.some((p) => t.includes(p))) return el;
    }
    return null;
  }

  function findButtonByText(root, phrases) {
    const scope = root || document;
    const buttons = scope.querySelectorAll("button");
    const want = (phrases || []).map((p) => p.toLowerCase());

    for (const el of buttons) {
      const t = elementText(el).toLowerCase();
      if (!t) continue;
      if (want.some((p) => t.includes(p))) return el;
    }
    return null;
  }

  function findSortTrigger(root) {
    const scope = root || document;

    // 1) Fast path: attribute-driven candidates
    for (const sel of SELECTORS.sortTriggerCandidates) {
      const el = scope.querySelector(sel);
      if (el) return el;
    }

    // 2) Text-driven: "Sort by" is often on/near the trigger
    const byText =
      findClickableByText(scope, TEXT.sortBy) || findButtonByText(scope, TEXT.sortBy);
    if (byText) return byText;

    // 3) Last resort: if we can already see "Lowest score", click the nearest button containing it
    const lowest =
      findClickableByText(scope, TEXT.lowestScore) ||
      findButtonByText(scope, TEXT.lowestScore);
    if (lowest) return lowest;

    return null;
  }

  window.VS_SELECTORS = {
    TEXT,
    SELECTORS,
    normalizeText,
    textIncludes,
    elementText,
    findClickableByText,
    findButtonByText,
    findSortTrigger
  };
})();

