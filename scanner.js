// Bingo A+ Scanner v11
// Step 6：精準辨識「超級獎號」欄位

function taiwanDate(offsetDays = 0) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const get = (type) =>
    parts.find((p) => p.type === type)?.value;

  return `${get("year")}${get("month")}${get("day")}`;
}

function cleanText(text) {
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

function getClass(tag) {
  const m = tag.match(/class\s*=\s*["']([^"']+)["']/i);
  return m ? m[1] : "";
}

async function fetchPage(date) {
  const url =
    `https://lotto.auzo.tw/bingobingo/list_${date}.html`;

  console.log("");
  console.log("🔎 嘗試日期：" + date);
  console.log("網址：" + url);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html"
    }
  });

  console.log("HTTP：" + response.status);

  if (!response.ok) return null;

  const html = await response.text();

  console.log("HTML 長度：" + html.length);

  return {
    date,
    url,
    html
  };
}

function findBingoRows(html) {
  const rows =
    html.match(/<tr\b[^>]*class=["'][^"']*bingo_row[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi)
    || [];

  return rows;
}

function parseRow(rowHtml, index) {

  const tdRegex = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;

  const cells = [];

  let match;

  while ((match = tdRegex.exec(rowHtml)) !== null) {

    const fullTag = `<td${match[1]}>`;

    cells.push({
      index: cells.length,
      className: getClass(fullTag),
      text: cleanText(match[2]),
      raw: match[2]
    });
  }

  const periodCell =
    cells.find(c => c.className.includes("BPeriod"));

  if (!periodCell) return null;

  const periodText = periodCell.text;

  const periodMatch =
    periodText.match(/(\d{8,})\s*(\d{1,2}:\d{2})?/);

  if (!periodMatch) return null;

  const period = periodMatch[1];
  const time = periodMatch[2] || "";

  // 抓 20 顆 Bingo 號碼
  const bingoNumbers = [];

  const numberRegex =
    /<div\b[^>]*class=["'][^"']*(?:brn|brns|bbrp|brlp|bbn|bbrn|bblp)[^"']*["'][^>]*>\s*(\d{1,2})\s*<\/div>/gi;

  let nm;

  while ((nm = numberRegex.exec(rowHtml)) !== null) {
    const n = Number(nm[1]);

    if (
      n >= 1 &&
      n <= 80 &&
      !bingoNumbers.includes(n)
    ) {
      bingoNumbers.push(n);
    }
  }

  return {
    rowIndex: index,
    period,
    time,
    bingoNumbers,
    cells,
    raw: rowHtml
  };
}

async function main() {

  console.log("");
  console.log("================================");
  console.log("=== Bingo A+ Scanner v11 ===");
  console.log("================================");

  let page = null;

  // 今天沒有資料時，自動往前找
  for (let offset = 0; offset >= -7; offset--) {

    const date = taiwanDate(offset);

    const test = await fetchPage(date);

    if (!test) continue;

    const rows = findBingoRows(test.html);

    console.log("找到 bingo_row：" + rows.length);

    if (rows.length > 0) {
      page = test;
      break;
    }
  }

  if (!page) {
    console.log("❌ 最近 7 天都找不到開獎資料");
    return;
  }

  console.log("");
  console.log("✅ 使用日期：" + page.date);

  const rawRows = findBingoRows(page.html);

  const parsed = rawRows
    .map((row, i) => parseRow(row, i))
    .filter(Boolean);

  console.log("成功解析：" + parsed.length + " 期");

  console.log("");
  console.log("================================");
  console.log("🎯 最新一期完整欄位診斷");
  console.log("================================");

  if (!parsed.length) {
    console.log("❌ 無法解析開獎列");
    return;
  }

  const latest = parsed[0];

  console.log("");
  console.log("期號：" + latest.period);
  console.log("時間：" + latest.time);

  console.log(
    "20顆(" + latest.bingoNumbers.length + ")：" +
    latest.bingoNumbers
      .map(n => String(n).padStart(2, "0"))
      .join(" ")
  );

  console.log("");
  console.log("========== TD 欄位 ==========");

  latest.cells.forEach((cell) => {

    console.log("");
    console.log(
      `TD[${cell.index}] class="${cell.className}"`
    );

    console.log(
      `文字：${cell.text || "(空白)"}`
    );

    // 額外找數字
    const nums =
      cell.text.match(/\b\d{1,3}\b/g) || [];

    if (nums.length) {
      console.log(
        "數字：" + nums.join(", ")
      );
    }
  });

  console.log("");
  console.log("================================");
  console.log("🔬 特殊欄位候選");
  console.log("================================");

  latest.cells.forEach((cell) => {

    // 排除期號欄
    if (cell.className.includes("BPeriod")) {
      return;
    }

    // 排除裝 20 顆號碼的大欄
    if (cell.raw.includes("<div")) {
      return;
    }

    const value = cell.text.trim();

    if (
      value &&
      value.length <= 10
    ) {
      console.log(
        `👉 TD[${cell.index}] ` +
        `class="${cell.className}" ` +
        `值="${value}"`
      );
    }
  });

  console.log("");
  console.log("================================");
  console.log("🔥 最近 12 期簡表");
  console.log("================================");

  parsed.slice(0, 12).forEach((r, i) => {

    console.log("");
    console.log(
      `#${i + 1} ${r.time} | ${r.period}`
    );

    console.log(
      "20顆：" +
      r.bingoNumbers
        .map(n => String(n).padStart(2, "0"))
        .join(" ")
    );

    const extras = r.cells
      .filter(c =>
        !c.className.includes("BPeriod") &&
        !c.raw.includes("<div") &&
        c.text.trim()
      )
      .map(c =>
        `TD${c.index}[${c.className}]=${c.text}`
      );

    console.log(
      "其他欄位：" +
      (extras.length
        ? extras.join(" | ")
        : "無")
    );
  });

  console.log("");
  console.log("================================");
  console.log("✅ v11 診斷完成");
  console.log("================================");
}

main().catch((err) => {
  console.error("❌ Scanner Error");
  console.error(err);
  process.exitCode = 1;
});
