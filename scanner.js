// Bingo A+ Scanner v3
// 診斷 lotto.auzo.tw 的重新導向

const START_URL = "https://lotto.auzo.tw/RK.php";

async function main() {
  try {
    console.log("=== Bingo A+ Scanner v3 ===");

    let url = START_URL;

    // 手動追蹤，最多 10 次，避免無限 redirect
    for (let i = 1; i <= 10; i++) {

      console.log(`第 ${i} 次請求：${url}`);

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

      // 重新導向
      if (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308
      ) {
        const location = response.headers.get("location");

        console.log("重新導向到：", location);

        if (!location) {
          throw new Error("有 redirect，但沒有 Location");
        }

        const nextUrl = new URL(location, url).href;

        // 如果導回同一網址，直接停止
        if (nextUrl === url) {
          console.log("⚠️ 發現重新導向循環");
          console.log("循環網址：", nextUrl);
          return;
        }

        url = nextUrl;
        continue;
      }

      // 成功取得內容
      const text = await response.text();

      console.log("✅ 已取得回應");
      console.log("最終網址：", url);
      console.log("資料長度：", text.length);

      console.log("===== DATA START =====");
      console.log(text.slice(0, 3000));
      console.log("===== DATA END =====");

      return;
    }

    console.log("⚠️ 超過 10 次重新導向，停止測試");

  } catch (error) {
    console.error("❌ Scanner 錯誤");
    console.error(error);
    process.exit(1);
  }
}

main();
