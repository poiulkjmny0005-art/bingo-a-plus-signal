// Bingo A+ Scanner v4
// 測試：直接抓 Bingo 日期型開獎頁面
// 不再使用 RK.php

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

  console.log("=== Bingo A+ Scanner v4 ===");
  console.log("台灣日期：", date);
  console.log("抓取網址：", url);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
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

    const location = response.headers.get("location");

    if (location) {
      console.log("重新導向：", location);
    }

    const html = await response.text();

    console.log("HTML 長度：", html.length);

    if (html.length > 0) {
      console.log("✅ 成功取得網頁內容");
      console.log("===== 前 1500 字 =====");
      console.log(html.slice(0, 1500));
      console.log("======================");
    } else {
      console.log("❌ 網頁內容是空的");
    }

  } catch (error) {
    console.error("❌ 抓取失敗");
    console.error(error);

    process.exitCode = 1;
  }
}

main();
