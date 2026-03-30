/* global chrome */

(function () {
  const KEY = "openai_key";
  const AFFILIATE_KEY = "affiliate_id";

  const apiKeyEl = document.getElementById("apiKey");
  const affiliateIdEl = document.getElementById("affiliateId");
  const saveEl = document.getElementById("save");
  const clearEl = document.getElementById("clear");
  const toggleEl = document.getElementById("toggle");
  const statusEl = document.getElementById("status");

  function setStatus(msg, variant) {
    statusEl.textContent = msg || "";
    statusEl.setAttribute("data-variant", variant || "");
  }

  function normalizeKey(s) {
    return String(s || "").trim();
  }

  async function loadKey() {
    const res = await chrome.storage.local.get([KEY, AFFILIATE_KEY]);
    const existing = normalizeKey(res[KEY]);
    const existingAffiliate = normalizeKey(res[AFFILIATE_KEY]);
    apiKeyEl.value = existing;
    affiliateIdEl.value = existingAffiliate;
    setStatus(existing || existingAffiliate ? "Loaded." : "No key saved yet.", existing || existingAffiliate ? "ok" : "");
  }

  async function saveKey() {
    const key = normalizeKey(apiKeyEl.value);
    const affiliateId = normalizeKey(affiliateIdEl.value);
    if (!key) {
      setStatus("Please enter an API key first.", "error");
      return;
    }
    await chrome.storage.local.set({
      [KEY]: key,
      [AFFILIATE_KEY]: affiliateId
    });
    setStatus("Saved.", "ok");
  }

  async function clearKey() {
    await chrome.storage.local.remove([KEY, AFFILIATE_KEY]);
    apiKeyEl.value = "";
    affiliateIdEl.value = "";
    setStatus("Cleared.", "ok");
  }

  function toggleVisibility() {
    const isHidden = apiKeyEl.type === "password";
    apiKeyEl.type = isHidden ? "text" : "password";
    toggleEl.textContent = isHidden ? "Hide" : "Show";
  }

  saveEl.addEventListener("click", () => {
    saveKey().catch((e) => {
      console.error("[VibeSifter] Failed to save key:", e);
      setStatus("Save failed. See console for details.", "error");
    });
  });

  clearEl.addEventListener("click", () => {
    clearKey().catch((e) => {
      console.error("[VibeSifter] Failed to clear key:", e);
      setStatus("Clear failed. See console for details.", "error");
    });
  });

  toggleEl.addEventListener("click", toggleVisibility);

  // Load on open
  loadKey().catch((e) => {
    console.error("[VibeSifter] Failed to load key:", e);
    setStatus("Load failed. See console for details.", "error");
  });
})();

