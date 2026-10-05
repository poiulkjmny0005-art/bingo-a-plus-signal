// Bingo A+ Scanner v9
// 目標：直接掃描所有 <tr>
// 抓出：期號 / 時間 / 20顆號碼 / 後方欄位

function taiwanDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = (type) =>
    parts.find(p => p.type === type)?.value;

  return `${get("year")}${get("month")}${get("day")}`;
}

function cleanText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {

  const date = taiwanDate();

  const url =
    `https://lotto.auzo.tw/bingobingo/list_${date}.html`;

  console.log("=== Bingo A+ Scanner v9 ===");
  console.log("台灣日期：", date);
  console.log("抓取網址：", url);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html,application/xhtml+xml"
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

  // =====================================
  // 找全部 TR
  // =====================================

  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  const rows = [...html.matchAll(rowRegex)];

  console.log("找到全部 TR：", rows.length);
  console.log("");

  const results = [];

  // =====================================
  // 分析每一列
  // =====================================

  for (let i = 0; i < rows.length; i++) {

    const rowHtml = rows[i][0];
    const text = cleanText(rowHtml);

    // 找期號：
    // 例如 115056434
    const periodMatch =
      text.match(/\b(115\d{6})\b/);

    // 找時間：
    // 例如 23:55
    const timeMatch =
      text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

    if (!periodMatch || !timeMatch) {
      continue;
    }

    const period = periodMatch[1];

    const time =
      `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;

    // =====================================
    // 從 HTML 中抓球號
    // =====================================

    const numbers = [];

    const ballRegex =
      /<div[^>]*class\s*=\s*["'][^"']*(?:brn|brns|bbrp|brlp|bbn|bblp)[^"']*["'][^>]*>\s*(\d{1,2})\s*<\/div>/gi;

    let ball;

    while ((ball = ballRegex.exec(rowHtml)) !== null) {

      const n = Number(ball[1]);

      if (n >= 1 && n <= 80) {
        numbers.push(
          String(n).padStart(2, "0")
        );
      }
    }

    // =====================================
    // 抓所有 TD，看看 20 顆後面還有什麼
    // =====================================

    const tdValues = [];

    const tdRegex =
      /<td\b[^>]*>([\s\S]*?)<\/td>/gi;

    let td;

    while ((td = tdRegex.exec(rowHtml)) !== null) {

      const value = cleanText(td[1]);

      if (value !== "") {
        tdValues.push(value);
      }
    }

    // =====================================
    // Bf21b 如果存在就另外抓
    // =====================================

    const bfMatch =
      rowHtml.match(
        /<td[^>]*class\s*=\s*["'][^"']*Bf21b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i
      );

    const bf21b =
      bfMatch
        ? cleanText(bfMatch[1])
        : "";

    results.push({
      row: i + 1,
      period,
      time,
      numbers: numbers.slice(0, 20),
      bf21b,
      tdValues
    });
  }

  // =====================================
  // 顯示結果
  // =====================================

  console.log(
    "=================================="
  );

  console.log("🎯 找到疑似開獎資料");

  console.log(
    "=================================="
  );

  console.log(
    `共找到：${results.length} 期`
  );

  console.log("");

  // 只先印最近 20 期
  const latest = results.slice(0, 20);

  latest.forEach((item, index) => {

    console.log(
      `===== 第 ${index + 1} 筆 / ROW ${item.row} =====`
    );

    console.log(
      `期號：${item.period}`
    );

    console.log(
      `時間：${item.time}`
    );

    console.log(
      `球數：${item.numbers.length}`
    );

    console.log(
      `20顆：${item.numbers.join(" ")}`
    );

    console.log(
      `Bf21b：${item.bf21b || "-"}`
    );

    console.log(
      `TD欄位：${JSON.stringify(item.tdValues)}`
    );

    console.log("");
  });

  // =====================================
  // 最近12期簡表
  // =====================================

  console.log("");
  console.log("🔥 最近 12 期簡表");
  console.log(
    "----------------------------------"
  );

  results.slice(0, 12).forEach(item => {

    console.log(
      `${item.time} | ${item.period} | 球=${item.numbers.length} | Bf21b=${item.bf21b || "-"}`
    );

  });

  console.log(
    "----------------------------------"
  );

  // =====================================
  // 如果仍然 0 筆，印出診斷資訊
  // =====================================

  if (results.length === 0) {

    console.log("");
    console.log("⚠️ 沒找到開獎列");
    console.log("開始輸出 TR 診斷資料");

    rows.slice(0, 30).forEach((row, i) => {

      const text =
        cleanText(row[0]).slice(0, 300);

      console.log(
        `TR ${i + 1}: ${text}`
      );

    });
  }
}

main().catch(error => {

  console.error(
    "❌ Scanner 發生錯誤"
  );

  console.error(error);

  process.exit(1);
});
