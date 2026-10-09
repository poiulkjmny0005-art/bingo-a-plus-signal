// Bingo 3-Star V2.2
// Forward-only tracking, 10 tickets per draw
// Usage: node star3_v22_track.js history.csv

const fs = require('node:fs');

const INPUT = process.argv[2] || 'history.csv';
const OUTPUT = 'star3_v22_tracking.json';
const REPORT = 'star3_v22_report.csv';

const TICKETS = 10;
const WINDOW_SHORT = 40;
const WINDOW_LONG = 200;

function readHistory(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  const lines = text.split(/\r?\n/);
  const result = [];
  const seen = new Set();

  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    const period = String(parts[0] || '').trim();
    const numbers = parts.slice(1, 21).map(Number);

    if (!/^\d{8,}$/.test(period)) continue;
    if (numbers.length !== 20) continue;
    if (numbers.some(n => !Number.isInteger(n) || n < 1 || n > 80)) continue;
    if (new Set(numbers).size !== 20) continue;
    if (seen.has(period)) continue;

    seen.add(period);
    result.push({ period, numbers });
  }

  result.sort((a, b) =>
    BigInt(a.period) < BigInt(b.period) ? -1 :
    BigInt(a.period) > BigInt(b.period) ? 1 : 0
  );

  if (result.length < WINDOW_LONG) {
    throw new Error('至少需要200期有效歷史資料');
  }

  return result;
}

function countFrequency(draws) {
  const count = Array(81).fill(0);

  for (const draw of draws) {
    for (const n of draw.numbers) count[n]++;
  }

  return count;
}

function buildScores(history) {
  const shortDraws = history.slice(-WINDOW_SHORT);
  const longDraws = history.slice(-WINDOW_LONG);

  const shortFreq = countFrequency(shortDraws);
  const longFreq = countFrequency(longDraws);

  const scores = [];

  for (let n = 1; n <= 80; n++) {
    const shortRate = shortFreq[n] / WINDOW_SHORT;
    const longRate = longFreq[n] / WINDOW_LONG;

    // 探索性分數：近期頻率與長期頻率
    // 不代表未來開出機率真的較高
    const score = 0.55 * shortRate + 0.45 * longRate;

    scores.push({
      number: n,
      score,
      shortCount: shortFreq[n],
      longCount: longFreq[n]
    });
  }

  return scores.sort((a, b) =>
    b.score - a.score || a.number - b.number
  );
}

function makeTickets(history) {
  const ranked = buildScores(history);
  const pool = ranked.slice(0, 45);
  const scoreMap = new Map(ranked.map(x => [x.number, x.score]));

  const tickets = [];
  const usage = Array(81).fill(0);
  const pairUsage = new Map();

  function pairKey(a, b) {
    return [a, b].sort((x, y) => x - y).join('-');
  }

  function ticketValue(nums) {
    let value = nums.reduce(
      (sum, n) => sum + scoreMap.get(n),
      0
    );

    // 減少同一號碼在10組內過度重複
    for (const n of nums) {
      value -= usage[n] * 0.11;
    }

    // 減少兩顆號碼重複配對
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        value -= (
          pairUsage.get(pairKey(nums[i], nums[j])) || 0
        ) * 0.08;
      }
    }

    return value;
  }

  for (let t = 0; t < TICKETS; t++) {
    let best = null;
    let bestValue = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        for (let k = j + 1; k < pool.length; k++) {
          const nums = [
            pool[i].number,
            pool[j].number,
            pool[k].number
          ].sort((a, b) => a - b);

          if (tickets.some(old =>
            old.join(',') === nums.join(',')
          )) continue;

          const value = ticketValue(nums);

          if (value > bestValue) {
            bestValue = value;
            best = nums;
          }
        }
      }
    }

    if (!best) throw new Error('無法產生10組不同三星票');

    tickets.push(best);

    for (const n of best) usage[n]++;

    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const key = pairKey(best[i], best[j]);
        pairUsage.set(key, (pairUsage.get(key) || 0) + 1);
      }
    }
  }

  return tickets;
}

function loadTracking() {
  if (!fs.existsSync(OUTPUT)) {
    return {
      version: '2.2',
      strategy: 'HOT_DIVERSIFIED',
      batches: []
    };
  }

  const data = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));

  if (!Array.isArray(data.batches)) {
    throw new Error('追蹤檔案格式錯誤');
  }

  return data;
}

function settleBatch(batch, draw) {
  const actual = new Set(draw.numbers);

  batch.results = batch.tickets.map(ticket => {
    const hits = ticket.filter(n => actual.has(n));

    return {
      ticket,
      hits,
      hitCount: hits.length,
      fullHit: hits.length === 3
    };
  });

  batch.fullHitTickets = batch.results.filter(
    r => r.fullHit
  ).length;

  batch.anyFullHit = batch.fullHitTickets > 0;
  batch.status = 'settled';
  batch.actualNumbers = draw.numbers;
}

function writeReport(data) {
  const rows = [
    'basePeriod,targetPeriod,status,fullHitTickets,anyFullHit'
  ];

  for (const batch of data.batches) {
    rows.push([
      batch.basePeriod,
      batch.targetPeriod,
      batch.status,
      batch.fullHitTickets ?? '',
      batch.anyFullHit === undefined
        ? ''
        : Number(batch.anyFullHit)
    ].join(','));
  }

  fs.writeFileSync(REPORT, rows.join('\n') + '\n');
}

function main() {
  const history = readHistory(INPUT);
  const data = loadTracking();

  const byPeriod = new Map(
    history.map(draw => [draw.period, draw])
  );

  // 只核對已存在的預測，不事後補造預測
  for (const batch of data.batches) {
    if (batch.status === 'settled') continue;

    const actual = byPeriod.get(batch.targetPeriod);

    if (actual) {
      settleBatch(batch, actual);
      console.log(
        `核對 ${batch.targetPeriod}：全中 ${batch.fullHitTickets} 組`
      );
    }
  }

  const latest = history[history.length - 1];
  const nextPeriod = String(BigInt(latest.period) + 1n);

  const exists = data.batches.some(
    b => b.targetPeriod === nextPeriod
  );

  if (!exists) {
    const tickets = makeTickets(history);

    data.batches.push({
      basePeriod: latest.period,
      targetPeriod: nextPeriod,
      status: 'pending',
      createdAt: new Date().toISOString(),
      tickets
    });

    console.log(
      `建立 V2.2 預測：${latest.period} → ${nextPeriod}`
    );

    tickets.forEach((ticket, i) => {
      console.log(
        `${String(i + 1).padStart(2, '0')}. ` +
        ticket.map(n => String(n).padStart(2, '0')).join(' ')
      );
    });
  } else {
    console.log(`目標 ${nextPeriod} 已有預測，不重複建立`);
  }

  const settled = data.batches.filter(
    b => b.status === 'settled'
  );

  const wins = settled.filter(b => b.anyFullHit).length;

  data.latestHistoryPeriod = latest.period;
  data.nextTargetPeriod = nextPeriod;
  data.lastRunAt = new Date().toISOString();

  data.summary = {
    settledPeriods: settled.length,
    winningPeriods: wins,
    hitRate: settled.length
      ? Number((wins / settled.length * 100).toFixed(2))
      : 0
  };

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(data, null, 2) + '\n'
  );

  writeReport(data);

  console.log('=== V2.2 追蹤結果 ===');
  console.log('最新歷史期號：', latest.period);
  console.log('下一期預測目標：', nextPeriod);
  console.log('已核對期數：', settled.length);
  console.log('至少1組全中期數：', wins);
  console.log('實際追蹤命中率：', data.summary.hitRate + '%');
  console.log('輸出：', OUTPUT, REPORT);
}

try {
  main();
} catch (error) {
  console.error('V2.2 執行失敗：', error.message);
  process.exitCode = 1;
}
