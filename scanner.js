// Bingo A+ Scanner v10
// 今天沒資料 → 自動往前找最近有開獎資料的日期
// 解析：期號 / 時間 / 20顆號碼 / 後方欄位

function taiwanDateOffset(daysAgo = 0) {
  const now = new Date();

  // 用毫秒往前推日期
  const target = new Date(
    now.getTime() - daysAgo * 24 * 60 * 60 * 1000
  );

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(target);

  const get = (type) =>
    parts.find((p) => p.type === type)?.value;

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

async function fetchDate(date) {
  const url =
    `https://lotto.auzo.tw/bingobingo/list_${date}.html`;

  console.log("");
  console.log(`🔎 嘗試日期：${date}`);
  console.log(`網址：${url}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html,application/xhtml+xml"
    }
  });

  console.log(`HTTP：${response.status}`);

  if (!response.ok) {
    return null;
  }

  const html = await response.text();

  console.log(`HTML 長度：${html.length}`);

  return {
    date,
    url,
    html
  };
}

async function main() {
  console.log("=== Bingo A+ Scanner v10 ===");
  console.log("尋找最近有開獎資料的日期...");

  let page = null;

  // =====================================
  // 最多往前找 7 天
  // =====================================

  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    const date = taiwanDateOffset(daysAgo);

    const test = await fetchDate(date);

    if (!test) {
      continue;
    }

    const text = cleanText(test.html);

    // 網頁直接說今天沒有任何球號
    if (
      text.includes("您查詢的日期未開出任何球號")
    ) {
      console.log("⚠️ 此日期目前沒有開獎資料");
      continue;
    }

    // 根據之前成功抓到的資料格式：
    // 期號 + HH:MM
    const hasDraw =
      /\b\d{8,10}\s+\d{1,2}:\d{2}\b/.test(text);

    if (hasDraw) {
      page = test;

      console.log("");
      console.log("✅ 找到有開獎資料的日期！");
      console.log(`使用日期：${date}`);

      break;
    }

    console.log("⚠️ 沒偵測到開獎資料");
  }

  if (!page) {
    console.log("");
    console.log("❌ 最近 7 天都沒有找到可解析資料");
    return;
  }

  const html = page.html;

  // =====================================
  // 找所有 TR
  // =====================================

  const rowRegex =
    /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  const rows =
    [...html.matchAll(rowRegex)];

  console.log("");
  console.log(`找到全部 TR：${rows.length}`);

  const results = [];

  // =====================================
  // 分析 TR
  // =====================================

  for (let i = 0; i < rows.length; i++) {
    const rowHtml = rows[i][0];

    const text =
      cleanText(rowHtml);

    // 找期號 + 時間
    const headerMatch =
      text.match(
        /\b(\d{8,10})\s+([01]?\d|2[0-3]):([0-5]\d)\b/
      );

    if (!headerMatch) {
      continue;
    }

    const period =
      headerMatch[1];

    const time =
      `${headerMatch[2].padStart(2, "0")}:${headerMatch[3]}`;

    // =====================================
    // 抓 20 顆球
    // =====================================

    const numbers = [];

    const ballRegex =
      /<div[^>]*class\s*=\s*["'][^"']*(?:brn|brns|bbrp|brlp|bbn|bblp)[^"']*["'][^>]*>\s*(\d{1,2})\s*<\/div>/gi;

    let ballMatch;

    while (
      (ballMatch = ballRegex.exec(rowHtml)) !== null
    ) {
      const n =
        Number(ballMatch[1]);

      if (
        n >= 1 &&
        n <= 80
      ) {
        numbers.push(
          String(n).padStart(2, "0")
        );
      }
    }

    // =====================================
    // 抓 TD 欄位
    // =====================================

    const tdValues = [];

    const tdRegex =
      /<td\b[^>]*>([\s\S]*?)<\/td>/gi;

    let tdMatch;

    while (
      (tdMatch = tdRegex.exec(rowHtml)) !== null
    ) {
      const value =
        cleanText(tdMatch[1]);

      if (value !== "") {
        tdValues.push(value);
      }
    }

    // =====================================
    // 抓 Bf21b
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

  console.log("");
  console.log("================================");
  console.log("🎯 Bingo 開獎解析結果");
  console.log("================================");

  console.log(`資料日期：${page.date}`);
  console.log(`解析期數：${results.length}`);

  // 最近 12 期
  const latest12 =
    results.slice(0, 12);

  console.log("");
  console.log("🔥 最近 12 期");
  console.log("--------------------------------");

  latest12.forEach((item, index) => {
    console.log("");
    console.log(`#${index + 1}`);

    console.log(
      `${item.time} ｜ ${item.period}`
    );

    console.log(
      `20顆(${item.numbers.length})：${item.numbers.join(" ")}`
    );

    console.log(
      `Bf21b：${item.bf21b || "-"}`
    );

    console.log(
      `TD：${JSON.stringify(item.tdValues)}`
    );
  });

  console.log("");
  console.log("--------------------------------");

  // =====================================
  // 如果仍然沒有解析到
  // 自動輸出診斷資料
  // =====================================

  if (results.length === 0) {
    console.log("");
    console.log("⚠️ 有找到開獎頁，但解析為 0");
    console.log("輸出前 30 個 TR 供診斷：");

    rows.slice(0, 30).forEach(
      (row, i) => {
        console.log(
          `TR ${i + 1}: ${cleanText(row[0]).slice(0, 500)}`
        );
      }
    );
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ Scanner 發生錯誤");
  console.error(error);
  process.exit(1);
});
