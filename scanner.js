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
async function fetchRecentDays(days = 3) {
  console.log("");
  console.log("==============================");
  console.log("📚 開始抓最近 " + days + " 天資料");
  console.log("==============================");

  const pages = [];

  for (let i = 1; i <= days; i++) {
    const date = taiwanDate(-i);

    const result = await fetchPage(date);

    if (result && result.html) {
      pages.push(result);

      console.log(
        "✅ " + date +
        " 抓取成功"
      );
    } else {
      console.log(
        "⚠️ " + date +
        " 抓取失敗"
      );
    }
  }

  console.log("");
  console.log(
    "📊 成功取得 " +
    pages.length +
    " 天網頁"
  );

  return pages;
}
  async function fetchRKPage() {
  const url = "https://lotto.auzo.tw/RK.php";

  console.log("");
  console.log("🔴 測試 RK.php 自動轉址");
  console.log("網址：" + url);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    console.log("RK 最終 HTTP：" + response.status);
    console.log("RK 最終網址：" + response.url);

    const html = await response.text();

    console.log("RK 回傳長度：" + html.length);
    console.log("RK 前300字：");
    console.log(html.slice(0, 300));

    return {
      url: response.url,
      html
    };
  } catch (err) {
    console.log("⚠️ RK 抓取失敗：" + err.message);

    return {
      url,
      html: ""
    };
  }
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

  // 取得期號與時間
  const periodCell = cells.find(c =>
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

  // 取得 20 顆開獎號碼
  const numberCell = cells[1];

  const numbers =
    (numberCell.text.match(/\b\d{1,2}\b/g) || [])
      .map(Number)
      .filter(n => n >= 1 && n <= 80)
      .slice(0, 20);

  // 找超級獎號
  let superBall = null;
  let superClass = "";

  for (const cell of cells) {
    const className = String(cell.className || "").trim();

    // 奧索超級獎號 class 會以 s 結尾
    const isSuperBall = /s$/i.test(className);

    if (!isSuperBall) {
      continue;
    }

    const matches =
      String(cell.text || "").match(/\b\d{1,2}\b/g) || [];

    const candidates = matches
      .map(Number)
      .filter(n => n >= 1 && n <= 80);

    if (candidates.length > 0) {
      superBall = candidates[0];
      superClass = className;
      break;
    }
  }

  return {
    period: pm[1],
    time: pm[2],
    numbers,
    cells,
    superBall,
    superClass
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
    // 暫時檢查 23:55 的 20 顆號碼 + class
if (time === "23:55") {
  console.log("");
  console.log("🔎 23:55 完整 20 顆號碼 + class");

  numberDivs.forEach((item, i) => {
    const className = String(item[1] || "").trim();
    const number = String(item[2] || "").trim().padStart(2, "0");

    console.log(
      `[${i + 1}] 號碼=${number} | class=${className}`
    );
  });

  console.log("------------------------");
}

successCount++;

console.log("");
console.log("🎯 第 " + successCount + " 筆");
console.log("期號: " + period);
console.log("時間: " + time);
console.log("超級獎號: " + superBall);
console.log("class: " + superClass);
console.log("------------------------");
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
// ========================================
// A+ 訊號核心 v1
// 目的：從 Bingo 資料列抓出超級獎號
//      統計近期熱度並產生 A+ 候選號
// ========================================

function buildAPlusSignal(html) {
  console.log("");
  console.log("================================");
  console.log("🔥 A+ 訊號分析");
  console.log("================================");

  const rows = getBingoRows(html);

  if (!rows || rows.length === 0) {
    console.log("❌ 沒有 Bingo 資料");
    return;
  }

  const history = [];

  // 最多分析最近 600 期
const limit = Math.min(rows.length, 600);

  for (let i = 0; i < limit; i++) {
    const rowHtml = rows[i];

    const cells = getCells(rowHtml);

    if (!cells || cells.length < 2) {
      continue;
    }

    const periodCell = cells.find(c =>
      (c.className || "").includes("BPeriod")
    );

    if (!periodCell) {
      continue;
    }

    const pm = periodCell.text.match(
      /(\d{8,})\s+(\d{1,2}:\d{2})/
    );

    if (!pm) {
      continue;
    }

    // 找出該期 20 顆球
    const numberDivs = [
      ...rowHtml.matchAll(
        /<div\b([^>]*)>([\s\S]*?)<\/div>/gi
      )
    ];

    let superBall = null;

    for (const item of numberDivs) {
      const attrs = item[1] || "";
      const number = cleanText(item[2]);

      if (!/^\d{1,2}$/.test(number)) {
        continue;
      }

      const className = getClass(attrs);

      // 奧索超級獎號 class 最後會有 s
      if (/s$/i.test(className)) {
        superBall = Number(number);
        break;
      }
    }

    if (
      superBall !== null &&
      superBall >= 1 &&
      superBall <= 80
    ) {
      history.push({
        period: pm[1],
        time: pm[2],
        number: superBall
      });
    }
  }

  console.log("");
  console.log("📊 成功取得超級獎號：" + history.length + " 期");

  if (history.length === 0) {
    console.log("❌ 找不到歷史超級獎號");
    return;
  }

  // ==============================
  // 01～80 建立分數
  // ==============================

  const scores = {};

  for (let n = 1; n <= 80; n++) {
    scores[n] = {
      number: n,
      count: 0,
      recent20: 0,
      recent50: 0,
      score: 0
    };
  }

  history.forEach((item, index) => {
    const n = item.number;

    scores[n].count++;

    if (index < 20) {
      scores[n].recent20++;
      scores[n].score += 5;
    } else if (index < 50) {
      scores[n].recent50++;
      scores[n].score += 3;
    } else {
      scores[n].score += 1;
    }
  });

  const ranking = Object.values(scores)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.count - a.count;
    });

  const top12 = ranking.slice(0, 12);

  console.log("");
  console.log("================================");
  console.log("🏆 A+ 熱門號 TOP 12");
  console.log("================================");

  top12.forEach((item, index) => {
    console.log(
      String(index + 1).padStart(2, "0") +
      ". " +
      String(item.number).padStart(2, "0") +
      " | 分數=" + item.score +
      " | 出現=" + item.count
    );
  });

  // 前 4 名作為目前 A+ 候選
  const aPlus = top12
    .slice(0, 4)
    .map(item =>
      String(item.number).padStart(2, "0")
    );

  console.log("");
  console.log("================================");
  console.log("🎯 A+ 候選號");
  console.log("👉 " + aPlus.join("、"));
  console.log("================================");
  // ========================================
// 一期一顆 × 12期回測 v1
// ========================================

console.log("");
console.log("==============================");
console.log("🧪 一期一顆 × 12期回測");
console.log("==============================");

// history[0] 是最新一期
// 因此回測時：
// 用較舊資料選號，再檢查它後面的 12 期

let testCount = 0;
let hitCount = 0;
let missCount = 0;
let totalHitPeriod = 0;

const maxBackTests = Math.min(50, history.length - 32);

for (let start = 12; start < 12 + maxBackTests; start++) {

  // 只能使用當時已經知道的歷史資料
  // 避免偷看到未來資料
  const pastData = history.slice(start, start + 20);

  if (pastData.length < 20) {
    continue;
  }

  const tempScores = {};

  for (let n = 1; n <= 80; n++) {
    tempScores[n] = {
      number: n,
      score: 0,
      count: 0
    };
  }

  // 用當時之前 20 期選出最強 1 顆
  pastData.forEach((item, index) => {

    const n = item.number;

    if (!tempScores[n]) {
      return;
    }

    tempScores[n].count++;

    // 越接近當時，權重越高
    if (index < 5) {
      tempScores[n].score += 5;
    } else if (index < 10) {
      tempScores[n].score += 3;
    } else {
      tempScores[n].score += 1;
    }
  });

  const pick = Object.values(tempScores)
    .sort((a, b) => {

      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.count - a.count;

    })[0];

  if (!pick) {
    continue;
  }

  // start 前面的 12 筆就是選號之後發生的 12 期
  const future12 = history.slice(start - 12, start);

  let hitPeriod = 0;

  // history 是新 -> 舊
  // 所以要反過來才是第1期、第2期...
  const chronological = [...future12].reverse();

  for (let i = 0; i < chronological.length; i++) {

    if (chronological[i].number === pick.number) {
      hitPeriod = i + 1;
      break;
    }

  }

  testCount++;

  if (hitPeriod > 0) {

    hitCount++;
    totalHitPeriod += hitPeriod;

    console.log(
      "✅ #" +
      testCount +
      " 選 " +
      String(pick.number).padStart(2, "0") +
      " → 第 " +
      hitPeriod +
      " 期命中"
    );

  } else {

    missCount++;

    console.log(
      "❌ #" +
      testCount +
      " 選 " +
      String(pick.number).padStart(2, "0") +
      " → 12期未中"
    );

  }
}

console.log("");
console.log("==============================");
console.log("📊 12期回測結果");
console.log("==============================");

console.log("回測組數：" + testCount);
console.log("12期內命中：" + hitCount);
console.log("12期未命中：" + missCount);

if (testCount > 0) {

  const hitRate = (
    hitCount / testCount * 100
  ).toFixed(2);

  console.log("🎯 12期命中率：" + hitRate + "%");

}

if (hitCount > 0) {

  const avgHit = (
    totalHitPeriod / hitCount
  ).toFixed(2);

  console.log("⏱️ 平均第 " + avgHit + " 期命中");

}

console.log("==============================");
  runModelCompetition(history);
  runOutOfSampleTest(history);
}
// ==================================================
// A+ v2 模型競賽
// 一期一顆 → 往後驗證 12 期
// ==================================================

function runModelCompetition(history) {

  console.log("");
  console.log("================================");
  console.log("🧠 A+ v2 模型競賽");
  console.log("================================");

  if (!history || history.length < 50) {
    console.log("❌ 歷史資料不足");
    return;
  }

  // ------------------------------------------
  // 建立某個時間點以前的統計資料
  // data[0] = 當時最近一期
  // ------------------------------------------

  function buildStats(data) {
data = Array.from(data);
    const stats = {};

    for (let n = 1; n <= 80; n++) {
      stats[n] = {
        number: n,
        last5: 0,
        last10: 0,
        last20: 0,
        last40: 0,
        total: 0,
        gap: data.length
      };
    }

    data.forEach((item, index) => {

      const n = item.number;

      if (!stats[n]) return;

      stats[n].total++;

      if (index < 5) {
        stats[n].last5++;
      }

      if (index < 10) {
        stats[n].last10++;
      }

      if (index < 20) {
        stats[n].last20++;
      }

      if (index < 40) {
        stats[n].last40++;
      }

    });

    // 遺漏期數
    for (let n = 1; n <= 80; n++) {

      const pos = data.findIndex(
        item => item.number === n
      );

      // 遺漏期數
// past 內完全沒出現過的號碼，不給「最大 GAP」優勢
stats[n].gap =
  pos === -1
    ? 0
    : pos;
    }

    return stats;
  }


  // ==========================================
  // 五種模型
  // ==========================================

  const models = {

  // 1. 熱門
  HOT: s => {
    let score = 0;

    score += s.last5 * 10;
    score += s.last10 * 5;
    score += s.last20 * 2;
    score += s.last40;

    // 避免過熱
    if (s.last5 >= 2) {
      score -= 4;
    }

    return score;
  },
    // 1B. HOT 改良版
HOT_V2: s => {
  let score = 0;

  // 短中期熱度
  score += s.last5 * 8;
  score += s.last10 * 6;
  score += s.last20 * 3;
  score += s.last40 * 0.5;

  // 最近有出現，但避免追太熱
  if (s.last5 === 1) {
    score += 4;
  }

  if (s.last5 >= 2) {
    score -= 8;
  }

  // 10期有熱度、5期沒有過熱
  if (s.last10 >= 2 && s.last5 <= 1) {
    score += 5;
  }

  return score;
},


  // 2. 短線動能
  MOMENTUM: s => {
    let score = 0;

    score += s.last5 * 12;
    score += s.last10 * 6;
    score += s.last20 * 2;

    // 最近有出現，但不是連續過熱
    if (s.last5 === 1) {
      score += 5;
    }

    if (s.last5 >= 2) {
      score -= 5;
    }

    return score;
  },


  // 3. 遺漏回補
  GAP: s => {
    let score = Math.min(s.gap, 40);

    // 主要觀察區
    if (s.gap >= 6 && s.gap <= 20) {
      score += 8;
    }

    // 遺漏太久稍微降權
    if (s.gap > 30) {
      score -= 5;
    }

    return score;
  },


  // 4. 短期 GAP
  GAP_SHORT: s => {
    let score = Math.min(s.gap, 15) * 2;

    if (s.gap >= 4 && s.gap <= 10) {
      score += 10;
    }

    score += s.last10 * 2;

    return score;
  },


  // 5. 冷轉熱
  TURN: s => {
    let score = 0;

    score += s.last5 * 10;
    score += s.last10 * 4;

    // 中期太熱扣分
    score -= s.last40 * 1.5;

    // 適度遺漏後重新出現
    if (s.gap >= 3 && s.gap <= 15) {
      score += 6;
    }

    return score;
  },


  // 6. A+ 多因子
  APLUS: s => {
    let score = 0;

    score += s.last5 * 8;
    score += s.last10 * 5;
    score += s.last20 * 3;
    score += s.last40;

    // 適度遺漏
    if (s.gap >= 4 && s.gap <= 12) {
      score += 8;
    }

    // 最近剛好出現一次
    if (s.last5 === 1) {
      score += 5;
    }

    // 過熱降權
    if (s.last5 >= 2) {
      score -= 5;
    }

    return score;
  }

};


  const results = {};

  Object.keys(models).forEach(name => {

    results[name] = {
      tests: 0,
      hits: 0,
      misses: 0,
      totalHitPeriod: 0
    };

  });


  // ==========================================
  // Walk-forward 回測
  //
  // history[0] = 最新
  // start以前的12期 = 未來驗證區
  // start以後 = 當時真正能看到的資料
  // ==========================================

  console.log("📊 history總筆數：" + history.length);
console.log("🧪 可用回測數：" + Math.min(500, history.length - 30 - 12));
  const minimumPast = 30;

  const maxTests = Math.min(
    500,
    history.length - minimumPast - 12
);

  for (
    let start = 12;
    start < 12 + maxTests;
    start++
  ) {

    const past = history.slice(
      start,
      Math.min(history.length, start + 50)
    );

    if (past.length < minimumPast) {
      continue;
    }

    const future12 = Array.from(
  history.slice(start - 12, start)
).reverse();

    const stats = buildStats(past);


    Object.keys(models).forEach(name => {

      const model = models[name];

      const ranked =
        Object.values(stats)
          .map(s => ({
            number: s.number,
            score: model(s)
          }))
          .sort((a, b) => {

            if (b.score !== a.score) {
              return b.score - a.score;
            }

            return a.number - b.number;
          });


      // 一期只選一顆
      const pick = ranked[0].number;
      // 🔍 DEBUG：記錄每次回測各模型實際選號
if (
  name === "GAP" ||
  name === "GAP_MID" ||
  name === "GAP_HOT" ||
  name === "GAP_MOMENTUM"
) {
  console.log(
    `🔍 回測${start - 11} | ${name} → ${String(pick).padStart(2, "0")}`
  );
}

      let hitPeriod = 0;

      for (
        let i = 0;
        i < future12.length;
        i++
      ) {

        if (
          future12[i].number === pick
        ) {

          hitPeriod = i + 1;
          break;
        }
      }


      results[name].tests++;

      if (hitPeriod > 0) {

        results[name].hits++;
        results[name].totalHitPeriod +=
          hitPeriod;

      } else {

        results[name].misses++;

      }

    });
  }


  // ==========================================
  // 顯示結果
  // ==========================================

  console.log("");
  console.log("🏆 模型比較");
  console.log("--------------------------------");


  const summary =
    Object.entries(results)
      .map(([name, r]) => {

        const rate =
          r.tests > 0
            ? r.hits / r.tests * 100
            : 0;

        const avg =
          r.hits > 0
            ? r.totalHitPeriod / r.hits
            : 0;

        return {
          name,
          ...r,
          rate,
          avg
        };
      })
      .sort((a, b) => {

  // ① 先比較 12 期命中率：越高越好
  if (b.rate !== a.rate) {
    return b.rate - a.rate;
  }

  // ② 命中率相同：有命中的模型優先
  if (a.hits === 0 && b.hits > 0) return 1;
  if (b.hits === 0 && a.hits > 0) return -1;

  // ③ 命中率相同：平均越早命中越好
  return a.avg - b.avg;

});


  summary.forEach((r, index) => {

    console.log(
      String(index + 1).padStart(2, "0") +
      ". " +
      r.name +
      " | 命中=" +
      r.hits +
      "/" +
      r.tests +
      " | 命中率=" +
      r.rate.toFixed(2) +
      "%" +
      " | 平均第" +
      r.avg.toFixed(2) +
      "期"
    );

  });


  console.log("");
  console.log("--------------------------------");

  // 80號選1顆，12期至少出現一次的理論基準
  const randomRate =
    (
      1 -
      Math.pow(79 / 80, 12)
    ) * 100;

  console.log(
    "🎲 隨機理論基準：約 " +
    randomRate.toFixed(2) +
    "%"
  );


  if (summary.length > 0) {

    const winner = summary[0];

    console.log("");
    console.log("🥇目前回測最佳：" + winner.name);
    console.log(
      "🎯 12期命中率：" +
      winner.rate.toFixed(2) +
      "%"
    );
    const edge = winner.rate - randomRate;

console.log(
    "📈 超越隨機基準：" +
    (edge >= 0 ? "+" : "") +
    edge.toFixed(2) +
    "%"
);

if (edge >= 3) {
    console.log("🟢 優勢：強");
} else if (edge >= 1.5) {
    console.log("🟡 優勢：普通");
} else if (edge > 0) {
    console.log("🟠 優勢：微弱");
} else {
    console.log("🔴 無統計優勢");
}

    // ========================================
    // 用全部目前歷史資料產生現在的一顆
    // ========================================

    // ==========================================
// 🔥 A+ v3 一期一顆
// 近期 + GAP + 熱度 + 回測最佳模型
// ==========================================

const v3Stats = buildStats(
  history.slice(0, 50)
);

const v3Ranking = Object.values(v3Stats)
  .map(s => {

    // 回測最佳模型分數
    const modelScore =
      models[winner.name](s);

    // 近期出現次數
    const recent20 = history
      .slice(0, 20)
      .filter(x => Number(x) === Number(s.number))
      .length;

    const recent50 = history
      .slice(0, 50)
      .filter(x => Number(x) === Number(s.number))
      .length;

    // GAP
    const gap =
      Number(s.gap ?? 0);

    // A+ v3 綜合分數
    const v3Score =
      modelScore +
      recent20 * 2 +
      recent50 * 0.5 +
      Math.min(gap, 12) * 0.25;

    return {
      number: s.number,
      modelScore,
      recent20,
      recent50,
      gap,
      v3Score
    };
  })
  .sort((a, b) => {

    if (b.v3Score !== a.v3Score) {
      return b.v3Score - a.v3Score;
    }

    return a.number - b.number;
  });

const v3Pick = v3Ranking[0];

console.log("");
console.log("============================");
console.log("🔥 A+ v3 一期一顆");
console.log(
  "👉 " +
  String(v3Pick.number).padStart(2, "0")
);
console.log("模型：" + winner.name);
console.log(
  "V3分數：" +
  v3Pick.v3Score.toFixed(2)
);
console.log(
  "近期20期出現：" +
  v3Pick.recent20
);
console.log(
  "GAP：" +
  v3Pick.gap
);
console.log("============================");
}
}
// ==================================================
// A+ v4 樣本外驗證
// 舊資料選模型 → 新資料只負責驗證
// ==================================================

function runOutOfSampleTest(history) {
  console.log("");
  console.log("================================");
  console.log("🧪 A+ v4 樣本外驗證");
  console.log("================================");

  if (!history || history.length < 300) {
    console.log("❌ 歷史資料不足 300 期");
    return;
  }

  // history[0] = 最新
  // 前 200 期作為完全獨立的驗證區
  // 更舊的資料作為模型運作所需的歷史資料
  const validationSize = Math.min(
    200,
    history.length - 60
  );

  const modelNames = [
    "HOT",
    "HOT_V2",
    "HYBRID",
    "GAP",
    "MOMENTUM",
    "APLUS",
    "TURN",
    "GAP_SHORT"
  ];

  const results = {};

  modelNames.forEach(name => {
    results[name] = {
      tests: 0,
      hits: 0,
      totalHitPeriod: 0
    };
  });

  function buildStats(data) {
    const stats = {};

    for (let n = 1; n <= 80; n++) {
      stats[n] = {
        number: n,
        last5: 0,
        last10: 0,
        last20: 0,
        last40: 0,
        total: 0,
        gap: 0
      };
    }

    data.forEach((item, index) => {
      const n = item.number;

      if (!stats[n]) return;

      stats[n].total++;

      if (index < 5) stats[n].last5++;
      if (index < 10) stats[n].last10++;
      if (index < 20) stats[n].last20++;
      if (index < 40) stats[n].last40++;
    });

    for (let n = 1; n <= 80; n++) {
      const pos = data.findIndex(
        item => item.number === n
      );

      stats[n].gap =
        pos === -1 ? 0 : pos;
    }

    return stats;
  }

  const models = {
    HOT: s => {
      let score = 0;
      score += s.last5 * 10;
      score += s.last10 * 5;
      score += s.last20 * 2;
      score += s.last40;

      if (s.last5 >= 2) score -= 4;

      return score;
    },
      HOT_V2: s => {
    let score = 0;

    score += s.last5 * 8;
    score += s.last10 * 6;
    score += s.last20 * 3;
    score += s.last40 * 0.5;

    if (s.last5 === 1) {
      score += 4;
    }

    if (s.last5 >= 2) {
      score -= 8;
    }

    if (s.last10 >= 2 && s.last5 <= 1) {
      score += 5;
    }

    return score;
  },

    MOMENTUM: s => {
      let score = 0;
      score += s.last5 * 12;
      score += s.last10 * 6;
      score += s.last20 * 2;

      if (s.last5 === 1) score += 5;
      if (s.last5 >= 2) score -= 5;

      return score;
    },

    GAP: s => {
      let score = Math.min(s.gap, 40);

      if (s.gap >= 6 && s.gap <= 20) {
        score += 8;
      }

      if (s.gap > 30) {
        score -= 5;
      }

      return score;
    },

    GAP_SHORT: s => {
      let score = Math.min(s.gap, 15) * 2;

      if (s.gap >= 4 && s.gap <= 10) {
        score += 10;
      }

      score += s.last10 * 2;

      return score;
    },

    TURN: s => {
      let score = 0;

      score += s.last5 * 10;
      score += s.last10 * 4;
      score -= s.last40 * 1.5;

      if (s.gap >= 3 && s.gap <= 15) {
        score += 6;
      }

      return score;
    },
  HYBRID: s => {
    const hotScore = models.HOT(s);
    const turnScore = models.TURN(s);

    return hotScore * 0.5 + turnScore * 0.5;
  },
    APLUS: s => {
      let score = 0;

      score += s.last5 * 8;
      score += s.last10 * 5;
      score += s.last20 * 3;
      score += s.last40;

      if (s.gap >= 4 && s.gap <= 12) {
        score += 8;
      }

      if (s.last5 === 1) {
        score += 5;
      }

      if (s.last5 >= 2) {
        score -= 5;
      }

      return score;
    }
  };

  for (
    let start = validationSize;
    start >= 12;
    start--
  ) {
    const past = history.slice(
      start,
      Math.min(history.length, start + 50)
    );

    if (past.length < 30) {
      continue;
    }

    const future12 = Array.from(
      history.slice(start - 12, start)
    ).reverse();

    const stats = buildStats(past);

    modelNames.forEach(name => {
      const ranked = Object.values(stats)
        .map(s => ({
          number: s.number,
          score: models[name](s)
        }))
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }

          return a.number - b.number;
        });

      const pick = ranked[0].number;

      let hitPeriod = 0;

      for (let i = 0; i < future12.length; i++) {
        if (future12[i].number === pick) {
          hitPeriod = i + 1;
          break;
        }
      }

      results[name].tests++;

      if (hitPeriod > 0) {
        results[name].hits++;
        results[name].totalHitPeriod += hitPeriod;
      }
    });
  }

  const randomRate =
    (1 - Math.pow(79 / 80, 12)) * 100;

  console.log("");
  console.log("📊 獨立驗證結果");
  console.log("--------------------------------");

  const summary = Object.entries(results)
    .map(([name, r]) => {
      const rate =
        r.tests > 0
          ? r.hits / r.tests * 100
          : 0;

      const avg =
        r.hits > 0
          ? r.totalHitPeriod / r.hits
          : 0;

      return {
        name,
        ...r,
        rate,
        avg
      };
    })
    .sort((a, b) => b.rate - a.rate);

  summary.forEach((r, index) => {
    console.log(
      String(index + 1).padStart(2, "0") +
      ". " +
      r.name +
      " | 命中=" +
      r.hits +
      "/" +
      r.tests +
      " | 命中率=" +
      r.rate.toFixed(2) +
      "%" +
      " | 平均第" +
      r.avg.toFixed(2) +
      "期"
    );
  });

  console.log("");
  console.log(
    "🎲 隨機理論基準：約 " +
    randomRate.toFixed(2) +
    "%"
  );

  if (summary.length > 0) {
    const winner = summary[0];
    const edge = winner.rate - randomRate;

    console.log(
      "🥇 樣本外最佳：" +
      winner.name
    );

    console.log(
      "📈 相對隨機：" +
      (edge >= 0 ? "+" : "") +
      edge.toFixed(2) +
      "%"
    );
  }

  console.log("================================");
}
function inspectSuperBallMarkers(html) {
  console.log("");
  console.log("==============================");
  console.log("🎯 超級獎號定位分析");
  console.log("==============================");

  // 找出「超級獎號」圖示
  const markerRegex =
    /<img\b[^>]*src=["'][^"']*icon_bingo_superball\.gif[^"']*["'][^>]*>/gi;

  let match;
  let count = 0;

  while ((match = markerRegex.exec(html)) !== null) {
    count++;

    const markerPos = match.index;

    console.log("");
    console.log("----- 超級獎號標記 #" + count + " -----");
    console.log("HTML位置：" + markerPos);
    console.log("標記：" + match[0]);

    // 往前找最近的 Bingo 資料列
    const before = html.slice(
      Math.max(0, markerPos - 3000),
      markerPos
    );

    const rows =
      before.match(
        /<tr\b[^>]*class=["'][^"']*bingo_row[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi
      ) || [];

    if (rows.length > 0) {
      const row = rows[rows.length - 1];
      const cells = getCells(row);

      console.log("前方最近資料列：");

      cells.forEach((cell, i) => {
        console.log(
          "[" + i + "] " +
          (cell.text || "(空白)") +
          " | class=" +
          (cell.className || "(無)")
        );
      });
    } else {
      console.log("⚠️ 前方沒有找到 bingo_row");
    }

    // 同時檢查超級獎號圖示後面的 HTML
    const after = html.slice(
      markerPos,
      Math.min(html.length, markerPos + 1500)
    );

    console.log("圖示後方 HTML：");
    console.log(after.slice(0, 800));
  }

  console.log("");
  console.log("🎯 找到超級獎號圖示數量：" + count);
}
async function main() {
  console.log("");
  console.log("==============================");
  console.log("=== Bingo A+ 掃描儀 v13 ===");
  console.log("==============================");

  const date = taiwanDate(-1);

  console.log("");
  console.log("📅 台灣日期：" + date);

  // ========================================
// 抓最近 3 天資料
// 合併 Bingo 資料列
// 去除重複期號
// 最多保留 600 期
// ========================================

const pages = await fetchRecentDays(3);

if (!pages || pages.length === 0) {
  console.log("❌ 抓不到最近 3 天資料");
  return;
}

const rowMap = new Map();

for (const page of pages) {
  const pageRows = getBingoRows(page.html);

  console.log(
    "📅 " +
    page.date +
    " → " +
    pageRows.length +
    " 期"
  );

  for (const rowHtml of pageRows) {
    const parsed = parseBingoRow(rowHtml);

    if (!parsed || !parsed.period) {
      continue;
    }

    if (!rowMap.has(parsed.period)) {
      rowMap.set(parsed.period, rowHtml);
    }
  }
}

const rows = Array.from(rowMap.values())
  .sort((a, b) => {
    const pa = parseBingoRow(a);
    const pb = parseBingoRow(b);

    return Number(pb.period) - Number(pa.period);
  })
  .slice(0, 600);

// 重新組成 HTML，讓後面的舊程式可以繼續使用
const html = rows.join("\n");

console.log("");
console.log("✅ 最近 3 天資料合併成功");
console.log("🎯 去重後 Bingo 資料列：" + rows.length);

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
  inspectSuperBallMarkers(html);
  buildAPlusSignal(html);
}

main().catch(err => {
  console.error("❌ 執行錯誤：", err);
  process.exit(1);
});
