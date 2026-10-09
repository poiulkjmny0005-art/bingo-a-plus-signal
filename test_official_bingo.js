// 台灣彩券官方賓果 API 測試
// 執行：node test_official_bingo.js

async function main() {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  const url = new URL(
    'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult'
  );
  url.searchParams.set('openDate', date);
  url.searchParams.set('pageNum', '1');
  url.searchParams.set('pageSize', '20');

  console.log('查詢日期：', date);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  const data = await response.json();

  if (data.rtCode !== 0) {
    throw new Error('API 回傳錯誤：' + JSON.stringify(data));
  }

  const draws = data.content?.bingoQueryResult ?? [];
  if (!draws.length) {
    throw new Error('官方 API 沒有回傳開獎資料');
  }

  const latest = draws.reduce((a, b) =>
    Number(a.drawTerm) > Number(b.drawTerm) ? a : b
  );

  const numbers = latest.bigShowOrder?.map(Number) ?? [];

  if (
    numbers.length !== 20 ||
    numbers.some(n => !Number.isInteger(n) || n < 1 || n > 80) ||
    new Set(numbers).size !== 20
  ) {
    throw new Error('20 顆開獎號碼驗證失敗');
  }

  console.log('官方最新期號：', latest.drawTerm);
  console.log('20 顆號碼：', numbers.join(', '));
  console.log('超級獎號：', latest.bullEyeTop);
  console.log('官方 API 測試成功');
}

main().catch(error => {
  console.error('測試失敗：', error.message);
  process.exitCode = 1;
});
