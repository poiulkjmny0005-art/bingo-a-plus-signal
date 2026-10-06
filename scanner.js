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
async function fetchRKPage() {
  const targetUrl = "https://lotto.auzo.tw/RK.php";
  const url =
    "https://getip.auzo.tw/get_real_ip.php?url=" +
    encodeURIComponent(targetUrl);

  console.log("");
  console.log("🔴 開始抓 RK.php");
  console.log("轉接網址：" + url);

  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      "Accept":
        "text/html,application/xhtml+xml"
    }
  });

  console.log("RK HTTP：" + response.status);
  console.log(
    "RK Location：" + (response.headers.get("location") || "(沒有)")
  );

  const html = await response.text();

  console.log("RK 回傳長度：" + html.length);
  console.log("RK 前300字：");
  console.log(html.slice(0, 300));

  return {
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
function inspectSuperBall(html) {
  console.log("");
  console.log("============================");
  console.log("🎯 自動辨識超級獎號 + 期號 + 時間");
  console.log("============================");

  // 找出每一期完整 bingo_row
  const rowMatches = [
    ...html.matchAll(
      /<tr[^>]*class=["'][^"']*\bbingo_row\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi
    )
  ];

  console.log("找到 bingo_row 數量：" + rowMatches.length);

  if (rowMatches.length === 0) {
    console.log("⚠️ 找不到 bingo_row");
    return;
  }

  let successCount = 0;

  // 最新 12 期
  rowMatches.slice(0, 12).forEach((m) => {
    const rowHtml = m[1];

    // 抓期號 + 時間
    const periodMatch = rowHtml.match(
      /class=["'][^"']*\bBPeriod\b[^"']*["'][^>]*>\s*(?:<b>)?\s*(\d+)\s*(?:<\/b>)?\s*<br\s*\/?>\s*(\d{1,2}:\d{2})/i
    );

    if (!periodMatch) {
      return;
    }

    const period = periodMatch[1];
    const time = periodMatch[2];

    // 抓所有開獎號碼 DIV + class
    const numberDivs = [
      ...rowHtml.matchAll(
        /<div[^>]*class=["']([^"']+)["'][^>]*>\s*(\d{1,2})\s*<\/div>/gi
      )
    ];

    let superBall = null;
    let superClass = null;

    for (const item of numberDivs) {
    const className = String(item[1] || "").trim().toLowerCase();
    const number = String(item[2] || "").trim().padStart(2, "0");

    // 奧索超級獎號的 class 會以 s 結尾
    const isSuperBall = /s$/i.test(className);

    console.log(
        `DEBUG 號碼=${number} class=[${className}] super=${isSuperBall}`
    );

    if (isSuperBall) {
        superBall = number;
        superClass = className;

        console.log(
            `✅ 找到超級獎號：${superBall} | class=${superClass}`
        );

        break;
    }
}
    
    // 暫時檢查 23:55的 20 顆號碼 + class
if (time === "23:55") {
  console.log("");
  console.log("🔎 23:55 完整 20 顆號碼 + class");

  numberDivs.forEach((item, i) => {
    const className = item[1].trim();
    const number = String(item[2]).padStart(2, "0");

    console.log(
      `[${i + 1}] 號碼=${number} | class=${className}`
    );
  });

  console.log("----------------------------");
}

    successCount++;

    console.log("");
    console.log(`🎯 第 ${successCount} 筆`);
    console.log(`期號：${period}`);
    console.log(`時間：${time}`);
    console.log(`超級獎號：${superBall}`);
    console.log(`class：${superClass}`);
    console.log("----------------------------");
  }
  console.log("");
  console.log("============================");
  console.log("成功抓到超級獎號：" + successCount + " 筆");
  console.log("============================");
});
  }
function deepSearchSuperBall(html) {
  console.log("");
  console.log("==============================");
  console.log("🔎 深度搜尋超級獎號");
  console.log("==============================");

  const keywords = [
    "超級獎號",
    "超級獎",
    "超級號",
    "Super",
    "super"
  ];

  let found = false;

  for (const keyword of keywords) {
    let start = 0;

    while (true) {
      const index = html.indexOf(keyword, start);

      if (index === -1) break;

      found = true;

      const from = Math.max(0, index - 500);
      const to = Math.min(html.length, index + 1000);

      console.log("");
      console.log("🎯 找到關鍵字：" + keyword);
      console.log("HTML位置：" + index);
      console.log("----- 前後 HTML -----");
      console.log(html.slice(from, to));
      console.log("---------------------");

      start = index + keyword.length;
    }
  }

  // 再找可能與獎號有關的 class
  const classRegex =
    /class=["'][^"']*(?:super|special|award|ball|Bf21b)[^"']*["']/gi;

  const classes = html.match(classRegex) || [];

  console.log("");
  console.log("🎯 可疑 class 數量：" + classes.length);

  const uniqueClasses = [...new Set(classes)];

  uniqueClasses.slice(0, 50).forEach((item, i) => {
    console.log("class[" + i + "] = " + item);
  });

  if (!found) {
    console.log("");
    console.log("⚠️ HTML 裡沒有直接找到「超級獎號」文字");
  }

  console.log("");
  console.log("🔎 深度搜尋完成");
}
function inspectLatestBallHtml(html) {
  console.log("");
  console.log("==============================");
  console.log("🔬 最新一期 20 顆原始 HTML");
  console.log("==============================");

  const rows = getBingoRows(html);

  if (rows.length === 0) {
    console.log("❌ 找不到 Bingo 資料列");
    return;
  }

  const rowHtml = rows[0];

  const divRegex =
    /<div\b([^>]*)>([\s\S]*?)<\/div>/gi;

  let m;
  let count = 0;

  while ((m = divRegex.exec(rowHtml)) !== null) {
    const attrs = m[1] || "";
    const value = cleanText(m[2]);

    if (!/^\d{1,2}$/.test(value)) {
      continue;
    }

    count++;

    console.log("");
    console.log(
      "[" + count + "] 號碼 = " + value
    );
    console.log(
      "    DIV屬性 = " + (attrs.trim() || "(無)")
    );
    console.log(
      "    原始HTML = " + m[0]
    );
  }

  console.log("");
  console.log("共找到 " + count + " 個號碼 DIV");
  console.log("==============================");
}
async function main() {
  console.log("");
  console.log("==============================");
  console.log("=== Bingo A+ 掃描儀 v13 ===");
  console.log("==============================");

  const date = taiwanDate(-1);

  console.log("");
  console.log("📅 台灣日期：" + date);

  const result = await fetchPage(date);

  if (!result || !result.html) {
    console.log("❌ 抓不到網頁資料");
    return;
  }

  const html = result.html;

  console.log("");
  console.log("✅ 網頁取得成功");
  console.log("HTML 長度：" + html.length);

  const rows = getBingoRows(html);

  console.log("");
  console.log("🎯 找到 Bingo 資料列：" + rows.length);

  if (rows.length > 0) {
  const latest = parseBingoRow(rows[0]);

  if (latest) {
    printRowStructure(latest);

    console.log("");
    console.log("==============================");
    console.log("🔬 最新一期號碼 CLASS");
    console.log("==============================");

    const cells = getCells(rows[0]);

    cells.forEach((cell, i) => {
      console.log(
        "[" + i + "] " +
        (cell.text || "(空白)") +
        " → class = " +
        (cell.className || "(無)")
      );
    });
  }
}

  findHeaderCandidates(html);
  inspectTables(html);
  inspectSuperBall(html);
  deepSearchSuperBall(html);
  inspectLatestBallHtml(html);
}

main().catch(err => {
  console.error("❌ 執行錯誤：", err);
  process.exit(1);
});
