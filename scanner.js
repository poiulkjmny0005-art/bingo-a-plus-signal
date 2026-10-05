// Bingo A+ Scanner v7
// Step 4：抓取每一期資料 + Bf21b 欄位

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

function stripTags(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {

  const date = taiwanDate();

  const url =
    `https://lotto.auzo.tw/bingobingo/list_${date}.html`;

  console.log("=== Bingo A+ Scanner v7 ===");
  console.log("台灣日期：", date);
  console.log("抓取網址：", url);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html"
    }
  });

  console.log("HTTP 狀態：", response.status);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  console.log("HTML 長度：", html.length);
  console.log("✅ 網頁取得成功");

  // 找出每一個開獎資料列
  const rowRegex =
    /<tr[^>]*class=["']bingo_row["'][^>]*>([\s\S]*?)<\/tr>/gi;

  const rows = [...html.matchAll(rowRegex)];

  console.log("");
  console.log("找到開獎資料列：", rows.length);
  console.log("");

  const results = [];

  for (const match of rows) {

    const rowHtml = match[1];

    // -------------------------
    // 期號 + 時間
    // -------------------------

    const periodMatch =
      rowHtml.match(
        /class=["']BPeriod["'][^>]*>\s*<b>(\d+)<\/b>\s*<br\s*\/?>(\d{2}:\d{2})/i
      );

    if (!periodMatch) {
      continue;
    }

    const period = periodMatch[1];
    const time = periodMatch[2];

    // -------------------------
    // 抓 20 顆號碼
    // -------------------------

    const numbers = [];

    const numberRegex =
      /<div[^>]*class=["'][^"']*(?:brn|brns|bbrp|brlp|bbn|bblp)[^"']*["'][^>]*>\s*(\d{1,2})\s*<\/div>/gi;

    let numberMatch;

    while (
      (numberMatch = numberRegex.exec(rowHtml)) !== null
    ) {
      numbers.push(
        numberMatch[1].padStart(2, "0")
      );
    }

    // -------------------------
    // 抓 Bf21b
    // -------------------------

    const bfMatch =
      rowHtml.match(
        /<td[^>]*class=["']Bf21b["'][^>]*>\s*([^<]*)\s*<\/td>/i
      );

    const bf21b = bfMatch
      ? stripTags(bfMatch[1])
      : "";

    results.push({
      period,
      time,
      numbers,
      bf21b
    });
  }

  console.log("================================");
  console.log("🎯 解析結果");
  console.log("================================");

  for (const item of results) {

    console.log("");
    console.log(
      `期號：${item.period} ｜ 時間：${item.time}`
    );

    console.log(
      `20顆：${item.numbers.join(" ")}`
    );

    console.log(
      `Bf21b：${item.bf21b || "無資料"}`
    );
  }

  console.log("");
  console.log("================================");
  console.log(`總共解析：${results.length} 期`);
  console.log("================================");

  // 額外顯示最近 12 期
  const latest12 = results.slice(0, 12);

  console.log("");
  console.log("🔥 最近 12 期 Bf21b");
  console.log("--------------------------------");

  for (const item of latest12) {
    console.log(
      `${item.time} ｜ ${item.period} ｜ ${item.bf21b || "-"}`
    );
  }

  console.log("--------------------------------");
}

main().catch((error) => {
  console.error("❌ Scanner 發生錯誤");
  console.error(error);
  process.exit(1);
});
