#!/usr/bin/env node
// Bingo history fetcher
// Official Taiwan Lottery API + Auzo historical backup
// Usage: node fetch_history.js --days=14 --output=history.csv

const fs = require('node:fs');

const args = process.argv.slice(2);

function arg(name, fallback) {
  const item = args.find(x => x.startsWith(`--${name}=`));
  return item ? item.slice(name.length + 3) : fallback;
}

const days = Number(arg('days', '14'));
const output = arg('output', 'history.csv');

if (!Number.isInteger(days) || days < 1 || days > 90) {
  throw new Error('--days must be 1..90');
}

function dateTW(offset = 0) {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const date = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + offset
  ));

  return (
    date.getUTCFullYear() +
    String(date.getUTCMonth() + 1).padStart(2, '0') +
    String(date.getUTCDate()).padStart(2, '0')
  );
}

function officialDate(offset = 0) {
  const d = dateTW(offset);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function validateDraw(period, numbers) {
  if (!/^\d{8,}$/.test(String(period))) return false;
  if (!Array.isArray(numbers) || numbers.length !== 20) {
    return false;
  }

  return (
    numbers.every(n =>
      Number.isInteger(n) && n >= 1 && n <= 80
    ) &&
    new Set(numbers).size === 20
  );
}

function clean(s) {
  return s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAuzo(html) {
  const rows = html.match(
    /<tr\b[^>]*class\s*=\s*["'][^"']*\bbingo_row\b[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi
  ) || [];

  const draws = [];

  for (const row of rows) {
    const cells = [
      ...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)
    ].map(m => ({
      attrs: m[1],
      text: clean(m[2])
    }));

    const periodCell = cells.find(c =>
      /\bBPeriod\b/i.test(c.attrs)
    );

    const period = periodCell?.text.match(/\b\d{8,}\b/)?.[0];

    if (!period || cells.length < 2) continue;

    const numbers = (
      cells[1].text.match(/\b\d{1,2}\b/g) || []
    ).map(Number);

    if (!validateDraw(period, numbers)) {
      console.warn(`略過奧索 ${period}：號碼驗證失敗`);
      continue;
    }

    draws.push({ period, numbers });
  }

  return { rowCount: rows.length, draws };
}

async function fetchAuzo(day) {
  const url =
    `https://lotto.auzo.tw/bingobingo/list_${day}.html`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(18000),
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return parseAuzo(await response.text());
}

async function fetchOfficial(date, pageNum = 1) {
  const url = new URL(
    'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult'
  );

  url.searchParams.set('openDate', date);
  url.searchParams.set('pageNum', String(pageNum));
  url.searchParams.set('pageSize', '20');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(18000),
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.rtCode !== 0) {
    throw new Error(
      `API rtCode=${data.rtCode}: ${data.rtMsg || ''}`
    );
  }

  const items = data.content?.bingoQueryResult;

  if (!Array.isArray(items)) {
    throw new Error('官方 API 資料格式不正確');
  }

  const draws = [];

  for (const item of items) {
    const period = String(item.drawTerm ?? '');
    const numbers = Array.isArray(item.bigShowOrder)
      ? item.bigShowOrder.map(Number)
      : [];

    if (!validateDraw(period, numbers)) {
      console.warn(`略過官方 ${period}：號碼驗證失敗`);
      continue;
    }

    draws.push({ period, numbers });
  }

  return {
    draws,
    totalSize: Number(data.content?.totalSize || 0)
  };
}

function latestPeriod(draws) {
  if (!draws.length) return null;

  return draws.reduce(
    (max, d) =>
      BigInt(d.period) > BigInt(max) ? d.period : max,
    draws[0].period
  );
}

async function main() {
  const all = new Map();
  let successDays = 0;

  console.log('=== 奧索歷史資料 ===');

  for (let i = 0; i < days; i++) {
    const day = dateTW(-i);

    try {
      const { rowCount, draws } = await fetchAuzo(day);

      console.log(
        `${day}: HTML rows=${rowCount}, validated draws=${draws.length}`
      );

      if (draws.length) successDays++;

      for (const draw of draws) {
        all.set(draw.period, draw);
      }
    } catch (error) {
      console.warn(`${day}: 奧索失敗：${error.message}`);
    }
  }

  const auzoLatest = latestPeriod([...all.values()]);

  console.log('奧索最新期號：', auzoLatest || '無資料');

  console.log('=== 台灣彩券官方 API ===');

  let officialCount = 0;
  let officialLatest = null;

  // 取得今天與昨天的官方資料，補齊歷史網站可能延遲的期數
  for (let offset = -1; offset <= 0; offset++) {
    const date = officialDate(offset);

    try {
      const first = await fetchOfficial(date, 1);

      if (!first.draws.length) {
        console.log(`${date}: 官方沒有開獎資料`);
        continue;
      }

      const totalPages = Math.ceil(first.totalSize / 20);
      const maxPages = Math.min(
        Math.max(totalPages, 1),
        12
      );

      const pages = [first];

      for (let page = 2; page <= maxPages; page++) {
        try {
          pages.push(await fetchOfficial(date, page));
        } catch (error) {
          console.warn(
            `${date} 第 ${page} 頁失敗：${error.message}`
          );
          break;
        }
      }

      let count = 0;

      for (const result of pages) {
        for (const draw of result.draws) {
          const existing = all.get(draw.period);

          if (
            existing &&
            existing.numbers.slice().sort((a, b) => a - b).join(',') !==
            draw.numbers.slice().sort((a, b) => a - b).join(',')
          ) {
            console.warn(
              `期號 ${draw.period} 官方與奧索號碼不同，採用官方資料`
            );
          }

          all.set(draw.period, draw);
          count++;
          officialCount++;

          if (
            !officialLatest ||
            BigInt(draw.period) > BigInt(officialLatest)
          ) {
            officialLatest = draw.period;
          }
        }
      }

      console.log(`${date}: 官方取得 ${count} 期`);
    } catch (error) {
      console.warn(`${date}: 官方 API 失敗：${error.message}`);
    }
  }

  const sorted = [...all.values()].sort((a, b) =>
    BigInt(a.period) < BigInt(b.period)
      ? -1
      : BigInt(a.period) > BigInt(b.period)
        ? 1
        : 0
  );

  if (sorted.length < 202) {
    throw new Error(
      `資料不足：${sorted.length} 期（至少需要202期）`
    );
  }

  const header = [
    'period',
    ...Array.from({ length: 20 }, (_, i) => `n${i + 1}`)
  ].join(',');

  const csv = [
    header,
    ...sorted.map(d => [d.period, ...d.numbers].join(','))
  ].join('\n') + '\n';

  fs.writeFileSync(output, csv, 'utf8');

  const finalLatest = sorted[sorted.length - 1].period;

  console.log('=== 抓取結果 ===');
  console.log('奧索成功天數：', successDays);
  console.log('官方取得筆數：', officialCount);
  console.log('奧索最新期號：', auzoLatest || '無資料');
  console.log('官方最新期號：', officialLatest || '無資料');
  console.log('合併最新期號：', finalLatest);
  console.log(
    '下一期預測目標：',
    String(BigInt(finalLatest) + 1n)
  );
  console.log('歷史資料總期數：', sorted.length);
  console.log('輸出檔案：', output);

  if (!officialLatest) {
    console.warn('注意：本次未取得官方資料，使用備援資料');
  }

  console.log('抓取完成');
}

main().catch(error => {
  console.error('抓取失敗：' + error.message);
  process.exitCode = 1;
});
