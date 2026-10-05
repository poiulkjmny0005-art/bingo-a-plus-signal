// Bingo A+ Scanner v1
// 第一階段：測試 scanner.js → API → 網頁

const API_URL = "https://bingo-a-plus-signal.onrender.com/api/signal";

async function sendSignal() {
  const signal = {
    time: new Date().toISOString(),
    numbers: ["08", "27", "46", "71"],
    level: "A+"
  };

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(signal)
    });

    const data = await response.json();

    console.log("A+ 訊號送出成功：", data);
  } catch (error) {
    console.error("送出訊號失敗：", error);
  }
}

sendSignal();
