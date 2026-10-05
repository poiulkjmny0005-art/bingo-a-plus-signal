// Bingo A+ Scanner v5
// Step 2：抓取開獎頁面並尋找「超級獎號」資料

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

async function main() {
  const date = taiwanDate();

  const url =
    `https://lotto.auzo.tw/bingobingo/list_${date}.html`;

  console.log("=== Bingo A+ Scanner v5 ===");
  console.log("台灣日期：", date);
  console.log("抓取網址：", url);

  try {
    const response = await fetch(url, {
      method: "GET",
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

    // 移除換行，方便搜尋附近 HTML
    const cleanHtml = html
      .replace(/\r/g, "")
      .replace(/\n/g, " ")
      .replace(/\t/g, " ");

    // 尋找「超級獎號」
    const keywords = [
      "超級獎號",
      "超級獎",
      "超級",
      "猜大小",
      "猜單雙"
    ];

    console.log("");
    console.log("===== 開始搜尋關鍵字 =====");

    let foundAnything = false;

    for (const keyword of keywords) {
      let start = 0;
      let count = 0;

      while (true) {
        const index = cleanHtml.indexOf(keyword, start);

        if (index === -1) break;

        foundAnything = true;
        count++;

        const from = Math.max(0, index - 500);
        const to = Math.min(
          cleanHtml.length,
          index + keyword.length + 800
        );

        console.log("");
        console.log(
          `===== ${keyword} 第 ${count} 個位置 =====`
        );

        console.log(cleanHtml.slice(from, to));

        console.log(
          `===== ${keyword} 第 ${count} 個位置結束 =====`
        );

        start = index + keyword.length;

        // 每個關鍵字最多顯示前 5 個，
        // 避免 GitHub log 太長
        if (count >= 5) {
          console.log(
            `⚠️ ${keyword} 超過 5 個結果，暫停輸出`
          );
          break;
        }
      }

      console.log(
        `搜尋「${keyword}」：找到 ${count} 個位置`
      );
    }

    console.log("");
    console.log("===== 搜尋完成 =====");

    if (!foundAnything) {
      console.log("⚠️ 暫時沒有找到超級獎號文字");
      console.log("下一步將改用 HTML 結構解析");
    } else {
      console.log("✅ 找到相關資料");
    }

  } catch (error) {
    console.error("❌ Scanner 發生錯誤");
    console.error(error);
    process.exitCode = 1;
  }
}

main();
