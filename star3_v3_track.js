
// Bingo 3-Star V3.1
// Forward-only cloud tracking + missed-period detection
// Usage: node star3_v3_track.js history.csv
// Requires Node.js 22+

const fs = require("node:fs");

const INPUT = process.argv[2] || "history.csv";
const OUTPUT = "star3_v3_tracking.json";
const REPORT = "star3_v3_report.csv";
const STRATEGY = "V3_HOT_DIVERSIFIED";
const TICKET_COUNT = 10;

function readHistory(path) {
  if (!fs.existsSync(path)) {
    throw new Error("找不到歷史資料：" + path);
  }

  const lines = fs.readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);

  const header = lines.shift().split(",").map(s => s.trim());
  const periodIndex = header.indexOf("period");

  const numberIndices = Array.from(
    { length: 20 },
    (_, i) => header.indexOf("n" + (i + 1))
  );

  if (periodIndex < 0 || numberIndices.some(i => i < 0)) {
    throw new Error("CSV 必須包含 period、n1 至 n20");
  }

  const byPeriod = new Map();

  for (const line of lines) {
    const cells = line.split(",");
    const period = cells[periodIndex]?.trim();
    const numbers = numberIndices.map(i => Number(cells[i]));

    if (!/^\d+$/.test(period || "")) continue;

    if (numbers.some(
      n => !Number.isInteger(n) || n < 1 || n > 80
    )) continue;

    if (new Set(numbers).size !== 20) continue;

    byPeriod.set(period, {
      period,
      numbers: numbers.sort((a, b) => a - b)
    });
  }

  return [...byPeriod.values()].sort(
    (a, b) => Number(a.period) - Number(b.period)
  );
}

function generateTickets(history) {
  const recent40 = history.slice(-40);
  const recent200 = history.slice(-200);

  const count40 = Array(81).fill(0);
  const count200 = Array(81).fill(0);

  for (const draw of recent40) {
    for (const n of draw.numbers) count40[n]++;
  }

  for (const draw of recent200) {
    for (const n of draw.numbers) count200[n]++;
  }

  const score = Array(81).fill(0);

  for (let n = 1; n <= 80; n++) {
    score[n] =
      0.55 * count40[n] / recent40.length +
      0.45 * count200[n] / recent200.length;
  }

  const candidates = Array.from(
    { length: 80 },
    (_, i) => i + 1
  ).sort(
    (a, b) => score[b] - score[a] || a - b
  ).slice(0, 45);

  const tickets = [];
  const usage = Array(81).fill(0);
  const usedPairs = new Set();
  const usedTickets = new Set();

  for (let k = 0; k < TICKET_COUNT; k++) {
    let best = null;
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        for (let m = j + 1; m < candidates.length; m++) {

          const ticket = [
            candidates[i],
            candidates[j],
            candidates[m]
          ].sort((a, b) => a - b);

          const key = ticket.join("-");
          if (usedTickets.has(key)) continue;

          const pairs = [
            ticket[0] + "-" + ticket[1],
            ticket[0] + "-" + ticket[2],
            ticket[1] + "-" + ticket[2]
          ];

          const value =
            ticket.reduce(
              (sum, n) => sum + score[n], 0
            ) -
            0.11 * ticket.reduce(
              (sum, n) => sum + usage[n], 0
            ) -
            0.08 * pairs.filter(
              p => usedPairs.has(p)
            ).length;

          if (value > bestScore) {
            bestScore = value;
            best = { ticket, key, pairs };
          }
        }
      }
    }

    if (!best) break;

    tickets.push(best.ticket);
    usedTickets.add(best.key);

    for (const n of best.ticket) usage[n]++;
    for (const p of best.pairs) usedPairs.add(p);
  }

  return tickets;
}

function loadTracking() {
  if (!fs.existsSync(OUTPUT)) {
    return {
      version: "3.1",
      strategy: STRATEGY,
      batches: [],
      missedPeriods: []
    };
  }

  const data = JSON.parse(
    fs.readFileSync(OUTPUT, "utf8")
  );

  if (!Array.isArray(data.batches)) {
    throw new Error("V3 追蹤資料格式錯誤");
  }

  if (!Array.isArray(data.missedPeriods)) {
    data.missedPeriods = [];
  }

  data.version = "3.1";
  return data;
}

// 核對所有之前已建立、尚未核獎的預測。
function settlePending(data, drawMap) {
  let settledNow = 0;

  for (const batch of data.batches) {
    if (batch.status !== "pending") continue;

    const draw = drawMap.get(
      String(batch.targetPeriod)
    );

    if (!draw) continue;

    const actual = new Set(draw.numbers);

    batch.results = batch.tickets.map(ticket => {
      const hits = ticket.filter(
        n => actual.has(n)
      );

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
    batch.actualNumbers = draw.numbers;
    batch.status = "settled";
    batch.settledAt = new Date().toISOString();

    settledNow++;
  }

  return settledNow;
}

// 偵測已經開獎、但從未提前建立預測的期數。
// 只使用歷史資料中確實存在的開獎期號。
// 不會事後補造預測，也不會將漏期算成失敗。
function detectMissedPeriods(data, history) {
  if (!data.batches.length) return 0;

  const firstTarget = data.batches.reduce(
    (min, b) =>
      BigInt(b.targetPeriod) < min
        ? BigInt(b.targetPeriod)
        : min,
    BigInt(data.batches[0].targetPeriod)
  );

  const predicted = new Set(
    data.batches.map(
      b => String(b.targetPeriod)
    )
  );

  const missed = new Set(
    data.missedPeriods.map(String)
  );

  let added = 0;

  for (const draw of history) {
    if (BigInt(draw.period) < firstTarget) continue;
    if (predicted.has(draw.period)) continue;

    if (!missed.has(draw.period)) {
      missed.add(draw.period);
      added++;
    }
  }

  data.missedPeriods = [...missed].sort(
    (a, b) => Number(a) - Number(b)
  );

  return added;
}

// 只為目前最新開獎期號的下一期建立預測。
function createPrediction(data, history) {
  const latest = history[history.length - 1];
  const basePeriod = latest.period;

  const targetPeriod = String(
    BigInt(basePeriod) + 1n
  );

  const exists = data.batches.some(
    b => String(b.targetPeriod) === targetPeriod
  );

  if (exists) return null;

  const batch = {
    basePeriod,
    targetPeriod,
    status: "pending",
    createdAt: new Date().toISOString(),
    strategy: STRATEGY,
    tickets: generateTickets(history)
  };

  data.batches.push(batch);
  return batch;
}

function updateSummary(data, history) {
  const settled = data.batches.filter(
    b => b.status === "settled"
  );

  const pending = data.batches.filter(
    b => b.status === "pending"
  );

  const wins = settled.filter(
    b => b.anyFullHit
  ).length;

  const latest = history[history.length - 1];

  data.latestHistoryPeriod = latest.period;
  data.nextTargetPeriod = String(
    BigInt(latest.period) + 1n
  );

  data.lastRunAt = new Date().toISOString();

  data.summary = {
    totalPredictions: data.batches.length,
    pendingPeriods: pending.length,
    settledPeriods: settled.length,
    winningPeriods: wins,
    fullHitTickets: settled.reduce(
      (sum, b) => sum + (b.fullHitTickets || 0),
      0
    ),
    missedPeriods: data.missedPeriods.length,
    hitRate: settled.length
      ? Number(
          (wins / settled.length * 100).toFixed(2)
        )
      : 0
  };
}

function writeReport(data) {
  const rows = [
    "basePeriod,targetPeriod,status,fullHitTickets,anyFullHit,createdAt,settledAt"
  ];

  for (const b of data.batches) {
    rows.push([
      b.basePeriod,
      b.targetPeriod,
      b.status,
      b.fullHitTickets ?? "",
      b.anyFullHit ?? "",
      b.createdAt || "",
      b.settledAt || ""
    ].join(","));
  }

  // 漏期獨立標記，不能當作失敗或中獎。
  for (const period of data.missedPeriods) {
    rows.push([
      "",
      period,
      "missed",
      "",
      "",
      "",
      ""
    ].join(","));
  }

  fs.writeFileSync(
    REPORT,
    rows.join("\n") + "\n"
  );
}

function main() {
  const history = readHistory(INPUT);

  if (history.length < 200) {
    throw new Error(
      "至少需要200期有效歷史資料"
    );
  }

  const data = loadTracking();

  const drawMap = new Map(
    history.map(d => [d.period, d])
  );

  // 先核獎。
  const settledNow = settlePending(
    data, drawMap
  );

  // 再找出沒有預測的漏期。
  const missedNow = detectMissedPeriods(
    data, history
  );

  // 最後才產生新一期預測。
  const newBatch = createPrediction(
    data, history
  );

  updateSummary(data, history);

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(data, null, 2) + "\n"
  );

  writeReport(data);

  console.log("===== Bingo 3-Star V3.1 =====");
  console.log(
    "最新官方資料期號：",
    data.latestHistoryPeriod
  );
  console.log(
    "下一期目標：",
    data.nextTargetPeriod
  );
  console.log(
    "本次補核獎：",
    settledNow,
    "期"
  );
  console.log(
    "累計已核獎：",
    data.summary.settledPeriods
  );
  console.log(
    "本次新增漏期：",
    missedNow
  );
  console.log(
    "累計漏期：",
    data.summary.missedPeriods
  );
  console.log(
    "至少一組三星全中：",
    data.summary.winningPeriods
  );
  console.log(
    "前瞻命中率：",
    data.summary.hitRate + "%"
  );

  if (newBatch) {
    console.log(
      "已建立新一期預測：",
      newBatch.targetPeriod
    );

    newBatch.tickets.forEach(
      (ticket, i) => {
        console.log(
          String(i + 1).padStart(2, "0") + ".",
          ticket.map(
            n => String(n).padStart(2, "0")
          ).join(" ")
        );
      }
    );
  } else {
    console.log(
      "最新目標已存在，不重複建立預測"
    );
  }

  console.log("追蹤資料：", OUTPUT);
  console.log("核獎報表：", REPORT);
}

main();
