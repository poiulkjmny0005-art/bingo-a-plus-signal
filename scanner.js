// Bingo A+ Scanner v2
// Step 1：測試抓取奧索 Bingo 資料

const SOURCE_URL = "https://lotto.auzo.tw/RK.php";

async function main() {
  try {
    console.log("=== Bingo A+ Scanner 啟動 ===");
    console.log("抓取來源：", SOURCE_URL);

    const response = await fetch(SOURCE_URL, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    console.log("HTTP 狀態：", response.status);

    if (!response.ok) {
      throw new Error(
        `抓取失敗 HTTP ${response.status}`
      );
    }

    const html = await response.text();

    console.log("抓取成功！");
    console.log("資料長度：", html.length);

    // 先輸出前 3000 字元，
    // 用來確認網站實際回傳的資料格式
    console.log("===== DATA START =====");
    console.log(html.slice(0, 3000));
    console.log("===== DATA END =====");

  } catch (error) {
    console.error("Scanner 發生錯誤：");
    console.error(error);
    process.exit(1);
  }
}

main();
