// Bingo A+ Scanner v6
// Step 3：分析 Bingo 開獎頁面的 HTML 結構

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

  console.log("=== Bingo A+ Scanner v6 ===");
  console.log("台灣日期：", date);
  console.log("抓取網址：", url);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "zh-TW,zh;q=0.9,en;q=0.8"
      }
    });

    console.log("HTTP 狀態：", response.status);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    console.log("HTML 長度：", html.length);
    console.log("✅ 網頁取得成功");

    // -------------------------
    // 1. 找所有 table
    // -------------------------

    const tables =
      html.match(/<table\b[\s\S]*?<\/table>/gi) || [];

    console.log("");
    console.log("===== TABLE 分析 =====");
    console.log("找到 table 數量：", tables.length);

    tables.slice(0, 15).forEach((table, index) => {

      const text = stripTags(table);

      console.log("");
      console.log(
        `===== TABLE ${index + 1} =====`
      );

      console.log(
        text.slice(0, 1200)
      );

      console.log(
        `===== TABLE ${index + 1} END =====`
      );
    });

    // -------------------------
    // 2. 找所有 TR
    // -------------------------

    const rows =
      html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];

    console.log("");
    console.log("===== ROW 分析 =====");
    console.log("找到 tr 數量：", rows.length);

    let shown = 0;

    for (let i = 0; i < rows.length; i++) {

      const text = stripTags(rows[i]);

      // 我們只顯示「看起來像開獎資料」的 row
      // 有時間、期數或很多數字就顯示
      const hasTime =
        /\b\d{1,2}:\d{2}\b/.test(text);

      const numbers =
        text.match(/\b\d{1,2}\b/g) || [];

      if (hasTime || numbers.length >= 10) {

        shown++;

        console.log("");
        console.log(
          `===== 候選 ROW ${i + 1} =====`
        );

        console.log("文字內容：");
        console.log(text.slice(0, 1500));

        console.log("");
        console.log("原始 HTML：");
        console.log(
          rows[i].slice(0, 2500)
        );

        console.log(
          `===== ROW ${i + 1} END =====`
        );

        // 先看前 12 筆即可
        if (shown >= 12) {
          break;
        }
      }
    }

    console.log("");
    console.log("候選開獎 ROW 顯示數量：", shown);

    // -------------------------
    // 3. 尋找 01~80 號碼密集區
    // -------------------------

    console.log("");
    console.log("===== 號碼密集區分析 =====");

    const plainText = stripTags(html);

    const chunks =
      plainText.split(/(?=\d{1,2}:\d{2})/);

    let chunkCount = 0;

    for (const chunk of chunks) {

      const nums =
        chunk.match(/\b(?:[1-9]|[1-7]\d|80)\b/g) || [];

      if (nums.length >= 15) {

        chunkCount++;

        console.log("");
        console.log(
          `===== 號碼區 ${chunkCount} =====`
        );

        console.log(
          chunk.slice(0, 1800)
        );

        if (chunkCount >= 10) {
          break;
        }
      }
    }

    console.log("");
    console.log("===== v6 分析完成 =====");
    console.log(
      "找到候選 ROW：",
      shown
    );

  } catch (error) {

    console.error(
      "❌ Scanner v6 發生錯誤"
    );

    console.error(error);

    process.exitCode = 1;
  }
}

main();
