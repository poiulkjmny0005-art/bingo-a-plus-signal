// Bingo A+ Scanner v12
// 目標：確認 TD[2] / TD[3] / TD[4] 的真正欄位名稱

function taiwanDate(offsetDays = 0) {
  const now = new Date();

  // 先取得台灣今天日期
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const base = formatter.format(new Date());

  const [y, m, d] = base.split("-").map(Number);

  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);

  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");

  return `${yy}${mm}${dd}`;
}

function cleanText(text = "") {
  return text
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

function getClass(attrs = "") {
  const m = attrs.match(
    /class\s*=\s*["']([^"']*)["']/i
  );

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
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
      "Accept":
        "text/html,application/xhtml+xml"
    }
  });

  console.log("HTTP：" + response.status);

  if (!response.ok) {
    return null;
  }

  const html = await response.text();

  console.log("HTML 長度：" + html.length);

  return {
    date,
    url,
    html
  };
}

function getBingoRows(html) {
  return (
    html.match(
      /<tr\b[^>]*class=["'][^"']*bingo_row[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi
    ) || []
  );
}

function getCells(rowHtml) {
  const cells = [];

  const regex =
    /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;

  let m;

  while ((m = regex.exec(rowHtml)) !== null) {
    cells.push({
      index: cells.length,
      className: getClass(m[1]),
      text: cleanText(m[2]),
      raw: m[2]
    });
  }

  return cells;
}

function parseBingoRow(rowHtml) {
  const cells = getCells(rowHtml);

  if (cells.length < 2) {
    return null;
  }

  const periodCell =
    cells.find(c =>
      c.className.includes("BPeriod")
    );

  if (!periodCell) {
    return null;
  }

  const pm = periodCell.text.match(
    /(\d{8,})\s+(\d{1,2}:\d{2})/
  );

  if (!pm) {
    return null;
  }

  const numberCell = cells[1];

  const numbers =
    (numberCell.text.match(/\b\d{1,2}\b/g) || [])
      .map(Number)
      .filter(n => n >= 1 && n <= 80)
      .slice(0, 20);

  return {
    period: pm[1],
    time: pm[2],
    numbers,
    cells
  };
}

function printRowStructure(row) {
  console.log("");
  console.log("================================");
  console.log("🎯 最新一期資料列");
  console.log("================================");

  console.log("期號：" + row.period);
  console.log("時間：" + row.time);

  console.log(
    "20顆：" +
    row.numbers
      .map(n => String(n).padStart(2, "0"))
      .join(" ")
  );

  console.log("");
  console.log("----- 資料欄位 -----");

  row.cells.forEach(cell => {
    console.log(
      `TD[${cell.index}] class="${cell.className}" = "${cell.text || "(空白)"}"`
    );
  });
}

function findHeaderCandidates(html) {
  console.log("");
  console.log("================================");
  console.log("🔎 搜尋欄位名稱");
  console.log("================================");

  const keywords = [
    "超級獎號",
    "超級",
    "獎號",
    "猜大小",
    "猜單雙",
    "大小",
    "單雙",
    "Bf21b",
    "期數",
    "開獎號碼",
    "開獎時間"
  ];

  for (const keyword of keywords) {
    console.log("");
    console.log(`===== 關鍵字：${keyword} =====`);

    let start = 0;
    let count = 0;

    while (true) {
      const pos = html.indexOf(keyword, start);

      if (pos === -1) {
        break;
      }

      count++;

      const from = Math.max(0, pos - 350);
      const to = Math.min(
        html.length,
        pos + keyword.length + 350
      );

      const rawContext =
        html.slice(from, to);

      console.log("");
      console.log(
        `找到 #${count} | HTML位置 ${pos}`
      );

      console.log(
        "文字上下文："
      );

      console.log(
        cleanText(rawContext)
      );

      console.log("");
      console.log(
        "原始HTML上下文："
      );

      console.log(rawContext);

      start = pos + keyword.length;

      // 防止輸出過多
      if (count >= 5) {
        console.log(
          "⚠️ 此關鍵字超過5筆，只顯示前5筆"
        );
        break;
      }
    }

    if (count === 0) {
      console.log("未找到");
    }
  }
}

function inspectTables(html) {
  console.log("");
  console.log("================================");
  console.log("🧪 Bingo資料附近表格診斷");
  console.log("================================");

  const firstBingo =
    html.search(
      /class=["'][^"']*bingo_row/i
    );

  if (firstBingo === -1) {
    console.log("找不到 bingo_row");
    return;
  }

  console.log(
    "第一個 bingo_row HTML位置：" +
    firstBingo
  );

  const before =
    html.slice(
      Math.max(0, firstBingo - 6000),
      firstBingo
    );

  const trMatches =
    [...before.matchAll(
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    )];

  const recentRows =
    trMatches.slice(-12);

  console.log("");
  console.log(
    `開獎資料前方找到 ${recentRows.length} 個候選 TR`
  );

  recentRows.forEach((m, i) => {
    const text = cleanText(m[0]);

    console.log("");
    console.log(
      `HEADER候選[${i}]：${text || "(空白)"}`
    );

    console.log(
      "HTML：" + m[0]
    );
  });
}

async function main() {
  console.log("");
console.log("==============================");
console.log("=== Bingo A+ 掃描儀 v12 ===");
}
main();
