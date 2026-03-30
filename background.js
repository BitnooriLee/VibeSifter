/* global chrome */

const SUPABASE_FUNC_URL = "https://qgkfnxqbavitpmtnutdp.supabase.co/functions/v1/analyze-reviews";
const SUPABASE_ANON_KEY = [YOUR_ANON_KEY];

// 1. 디바이스 고유 ID 생성 및 관리
async function getOrCreateDeviceId() {
  const result = await chrome.storage.local.get("vibeSifter_deviceId");
  if (result.vibeSifter_deviceId) {
    return result.vibeSifter_deviceId;
  }

  // UUID 생성 (간단한 방식)
  const newId = crypto.randomUUID();
  await chrome.storage.local.set({ vibeSifter_deviceId: newId });
  return newId;
}

// 확장 프로그램 설치 시 ID 미리 생성
chrome.runtime.onInstalled.addListener(async () => {
  await getOrCreateDeviceId();
  console.log("[VibeSifter] Device ID initialized.");
});

// 2. 메시지 핸들러: 분석 요청 처리
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ANALYZE_REVIEWS") {
    handleAnalysis(request.data)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // 비동기 응답을 위해 true 반환
  }
});

async function handleAnalysis(extractedData) {
  try {
    const deviceId = await getOrCreateDeviceId();

    const response = await fetch(SUPABASE_FUNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}` // <--- 이 'Bearer' 한 줄이 핵심입니다!
      },
      body: JSON.stringify({
        hotelName: extractedData.hotelName,
        reviewTexts: extractedData.reviewTexts,
        userId: deviceId // Supabase에서 사용량 체크를 위해 사용됨
      })
    });

    // 3. 에러 핸들링 (일일 제한 초과 등)
    if (response.status === 429) {
      console.warn("[VibeSifter] Daily limit reached for this device.");
      return { error: "LIMIT_EXCEEDED" };
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Server error occurred");
    }

    const result = await response.json();
    return result; // OpenAI로부터 온 분석 결과 JSON
  } catch (err) {
    console.error("[VibeSifter] Proxy Fetch Error:", err);
    return { error: err.message };
  }
}

