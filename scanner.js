// Bingo A+ Scanner v8
// 直接解析 BPeriod + 開獎號碼 + Bf21b

function taiwanDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = (type) =>
    parts.find((p) => p.type === type)?.value;

  return `${get("year")}${get("month")}${get("day")}`;
}

function cleanText(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    )
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const date = taiwanDate();

  const url =
    `https://lotto.auzo.tw/bingobingo/list_${date}.html`;

  console.log("=== Bingo A+ Scanner v8 ===");
  console.log("台灣日期：", date);
  console.log("抓取網址：", url);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      "Accept":
        "text/html,application/xhtml+xml"
    }
  });

  console.log("HTTP 狀態：", response.status);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  console.log("HTML 長度：", html.length);
  console.log("✅ 網頁取得成功");
  console.log("");

  // ==========================================
  // 1. 找每一個 BPeriod 的位置
  // ==========================================

  const periodRegex =
    /<td[^>]*class\s*=\s*["']BPeriod["'][^>]*>/gi;

  const periodMatches =
    [...html.matchAll(periodRegex)];

  console.log(
    "找到 BPeriod：",
    periodMatches.length
  );

  const results = [];

  // ==========================================
  // 2. 每個 BPeriod 到下一個 BPeriod
  //    視為一筆開獎資料
  // ==========================================

  for (
    let i = 0;
    i < periodMatches.length;
    i++
  ) {
    const start =
      periodMatches[i].index;

    const end =
      i + 1 < periodMatches.length
        ? periodMatches[i + 1].index
        : html.length;

    const block =
      html.slice(start, end);

    // --------------------------
    // 期號
    // --------------------------

    const periodMatch =
      block.match(
        /<b>\s*(\d{6,})\s*<\/b>/i
      );

    if (!periodMatch) {
      continue;
    }

    const period =
      periodMatch[1];

    // --------------------------
    // 時間
    // --------------------------

    const timeMatch =
      block.match(
        /<br\s*\/?>\s*(\d{1,2}:\d{2})/i
      );

    const time =
      timeMatch
        ? timeMatch[1]
        : "--:--";

    // --------------------------
    // 20 顆開獎號碼
    //
    // 你前一張圖已確認號碼
    // 是放在 brn / brns / bbrp
    // brlp / bbn / bblp 等 class
    // --------------------------

    const numbers = [];

    const divRegex =
      /<div[^>]*class\s*=\s*["']([^"']+)["'][^>]*>\s*(\d{1,2})\s*<\/div>/gi;

    let divMatch;

    while (
      (divMatch =
        divRegex.exec(block)) !== null
    ) {
      const className =
        divMatch[1];

      const value =
        divMatch[2];

      if (
        /^(brn|brns|bbrp|brlp|bbn|bblp)$/i.test(
          className
        )
      ) {
        numbers.push(
          value.padStart(2, "0")
        );
      }
    }

    // --------------------------
    // Bf21b
    // --------------------------

    const bfMatch =
      block.match(
        /<td[^>]*class\s*=\s*["']Bf21b["'][^>]*>([\s\S]*?)<\/td>/i
      );

    const bf21b =
      bfMatch
        ? cleanText(bfMatch[1])
        : "";

    results.push({
      period,
      time,
      numbers: numbers.slice(0, 20),
      bf21b
    });
  }

  // ==========================================
  // 顯示結果
  // ==========================================

  console.log("");
  console.log(
    "================================"
  );

  console.log("🎯 解析結果");

  console.log(
    "================================"
  );

  results.forEach(
    (item, index) => {

      console.log("");
      console.log(
        `#${index + 1}`
      );

      console.log(
        `期號：${item.period}`
      );

      console.log(
        `時間：${item.time}`
      );

      console.log(
        `號碼(${item.numbers.length})：${item.numbers.join(" ")}`
      );

      console.log(
        `Bf21b：${item.bf21b || "無資料"}`
      );
    }
  );

  console.log("");
  console.log(
    "================================"
  );

  console.log(
    `總共解析：${results.length} 期`
  );

  console.log(
    "================================"
  );

  // ==========================================
  // 最近 12 期
  // ==========================================

  console.log("");
  console.log(
    "🔥 最近 12 期"
  );

  console.log(
    "--------------------------------"
  );

  const latest12 =
    results.slice(0, 12);

  latest12.forEach(
    (item) => {

      console.log(
        `${item.time} ｜ ${item.period} ｜ Bf21b=${item.bf21b || "-"} ｜ ${item.numbers.join(" ")}`
      );

    }
  );

  console.log(
    "--------------------------------"
  );
}

main().catch((error) => {
  console.error(
    "❌ Scanner 發生錯誤"
  );

  console.error(error);

  process.exit(1);
});
