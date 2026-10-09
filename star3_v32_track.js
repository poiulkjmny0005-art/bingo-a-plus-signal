
"use strict";

// Bingo 3-Star V3.2
// Forward-only selection and settlement.
// Usage: node star3_v32_track.js history.csv
// Node.js 22+

const fs = require("node:fs");

const HISTORY_FILE = process.argv[2] || "history.csv";
const SOURCE_FILE = "star3_v3_tracking.json";
const OUTPUT_FILE = "star3_v32_tracking.json";
const REPORT_FILE = "star3_v32_report.csv";

function readHistory(file) {
  if (!fs.existsSync(file)) {
    throw new Error("找不到歷史資料：" + file);
  }

  const lines = fs.readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);

  const header = lines.shift().split(",").map(s => s.trim());
  const periodIndex = header.indexOf("period");
  const indices = Array.from(
    { length: 20 },
    (_, i) => header.indexOf("n" + (i + 1))
  );

  if (periodIndex < 0 || indices.some(i => i < 0)) {
    throw new Error("history.csv 欄位不完整");
  }

  const map = new Map();

  for (const line of lines) {
    const cells = line.split(",");
    const period = String(cells[periodIndex] || "").trim();
    const numbers = indices.map(i => Number(cells[i]));

    if (!/^\d+$/.test(period)) continue;
    if (numbers.some(n =>
      !Number.isInteger(n) || n < 1 || n > 80
    )) continue;
    if (new Set(numbers).size !== 20) continue;

    map.set(period, {
      period,
      numbers: numbers.sort((a, b) => a - b)
    });
  }

  return [...map.values()].sort(
    (a, b) => Number(a.period) - Number(b.period)
  );
}

function validTickets(tickets) {
  return Array.isArray(tickets) &&
    tickets.length === 10 &&
    tickets.every(t =>
      Array.isArray(t) &&
      t.length === 3 &&
      t.every(n =>
        Number.isInteger(n) && n >= 1 && n <= 80
      ) &&
      new Set(t).size === 3
    );
}

function scoreNumbers(history) {
  const recent40 = history.slice(-40);
  const recent200 = history.slice(-200);

  if (recent200.length < 200) {
    throw new Error("至少需要200期歷史資料");
  }

  const count40 = Array(81).fill(0);
  const count200 = Array(81).fill(0);

  for (const draw of recent40) {
    for (const n of draw.numbers) count40[n]++;
  }

  for (const draw of recent200) {
    for (const n of draw.numbers) count200[n]++;
  }

  return Array.from({ length: 81 }, (_, n) =>
    n === 0 ? 0 :
    0.55 * count40[n] / recent40.length +
    0.45 * count200[n] / recent200.length
  );
}



function chooseSelections(tickets, history) {
  const score = scoreNumbers(history);

  // 原本10組，共30個號碼位置
  const pool = [...new Set(tickets.flat())];

  // 記錄原始10組，避免直接複製原組合
  const originalGroups = new Set(
    tickets.map(t =>
      [...t].sort((a, b) => a - b).join("-")
    )
  );

  // 記錄每顆號碼來自哪些組
  const sources = new Map();

  tickets.forEach((ticket, groupIndex) => {
    ticket.forEach(n => {
      if (!sources.has(n)) {
        sources.set(n, new Set());
      }
      sources.get(n).add(groupIndex);
    });
  });

  // 確認每組3顆可以來自至少2個不同原始組合
  function isCrossGroup(ticket) {
    const [a, b, c] = ticket;

    for (const x of sources.get(a)) {
      for (const y of sources.get(b)) {
        for (const z of sources.get(c)) {
          if (new Set([x, y, z]).size >= 2) {
            return true;
          }
        }
      }
    }

    return false;
  }

  const candidates = [];

  // 將全部號碼重新組合成3星候選
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const ticket = [
          pool[i],
          pool[j],
          pool[k]
        ].sort((a, b) => a - b);

        const key = ticket.join("-");

        // 不採用原本10組的完整組合
        if (originalGroups.has(key)) continue;

        // 每組必須跨組搭配
        if (!isCrossGroup(ticket)) continue;

        // 依近期歷史熱度評分
        const value = ticket.reduce(
          (sum, n) => sum + score[n],
          0
        );

        candidates.push({
          ticket,
          value
        });
      }
    }
  }

  // 分數高的優先
  candidates.sort((a, b) =>
    b.value - a.value ||
    a.ticket.join("-").localeCompare(
      b.ticket.join("-")
    )
  );

  // 第一組：取評分最高的跨組三星
  const first = candidates[0]?.ticket;

  if (!first) {
    throw new Error("無法建立第一組跨組精選");
  }

  // 第二組：另外選3顆，不能與第一組重複
  const second = candidates.find(c =>
    c.ticket.every(n => !first.includes(n))
  )?.ticket;

  if (!second) {
    throw new Error("無法建立第二組不重複精選");
  }

  // 最後再次確認兩組共6顆不同號碼
  const allSix = [...first, ...second];

  if (new Set(allSix).size !== 6) {
    throw new Error("精選6顆號碼發生重複");
  }

  return {
    // 單組方案：只測試第一組
    selectedOne: [first],

    // 雙組方案：第一組 + 第二組，共6顆不重複
    selectedTwo: [first, second]
  };
}


function loadData() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return {
      version: "3.2",
      strategy: "V32_COMBINED_SELECTION",
      batches: [],
      missedPeriods: 0
    };
  }

  const data = JSON.parse(
    fs.readFileSync(OUTPUT_FILE, "utf8")
  );

  if (!Array.isArray(data.batches)) {
    throw new Error("V3.2 追蹤資料格式錯誤");
  }

  return data;
}

function settlePending(data, drawMap) {
  let settledNow = 0;

  for (const batch of data.batches) {
    if (batch.status !== "pending") continue;

    const draw = drawMap.get(String(batch.targetPeriod));
    if (!draw) continue;

    const actual = new Set(draw.numbers);

    function check(tickets) {
      return tickets.map(ticket => {
        const hits = ticket.filter(n => actual.has(n));

        return {
          ticket,
          hits,
          hitCount: hits.length,
          fullHit: hits.length === 3
        };
      });
    }

    batch.oneResults = check(batch.selectedOne);
    batch.twoResults = check(batch.selectedTwo);
    batch.actualNumbers = draw.numbers;

    batch.oneWin = batch.oneResults.some(r => r.fullHit);
    batch.twoWin = batch.twoResults.some(r => r.fullHit);

    batch.status = "settled";
    batch.settledAt = new Date().toISOString();

    settledNow++;
  }

  return settledNow;
}

function createPrediction(data, source, history) {
  const latest = history.at(-1);
  const target = String(BigInt(latest.period) + 1n);

  const sourceBatch = source.batches.find(
    b => String(b.targetPeriod) === target &&
      b.status === "pending" &&
      validTickets(b.tickets)
  );

  if (!sourceBatch) {
    console.log(
      "V3.1 尚未提供最新一期的有效10組預測，" +
      "本次不建立 V3.2 預測。"
    );
    return null;
  }

  const exists = data.batches.some(
    b => String(b.targetPeriod) === target
  );

  if (exists) return null;

  const selections = chooseSelections(
    sourceBatch.tickets,
    history
  );

  const batch = {
    basePeriod: latest.period,
    targetPeriod: target,
    status: "pending",
    createdAt: new Date().toISOString(),
    sourceVersion: "V3.1",
    originalTickets: sourceBatch.tickets,
    selectedOne: selections.selectedOne,
    selectedTwo: selections.selectedTwo
  };

  data.batches.push(batch);
  return batch;
}

function updateSummary(data, history) {
  const settled = data.batches.filter(
    b => b.status === "settled"
  );

  const oneWins = settled.filter(b => b.oneWin).length;
  const twoWins = settled.filter(b => b.twoWin).length;

  const latest = history.at(-1);

  data.latestHistoryPeriod = latest.period;
  data.nextTargetPeriod =
    String(BigInt(latest.period) + 1n);
  data.lastRunAt = new Date().toISOString();

  data.summary = {
    totalPredictions: data.batches.length,
    settledPeriods: settled.length,
    pendingPeriods: data.batches.filter(
      b => b.status === "pending"
    ).length,
    selectedOneWinningPeriods: oneWins,
    selectedTwoWinningPeriods: twoWins,
    selectedOneHitRate: settled.length
      ? Number((oneWins / settled.length * 100).toFixed(2))
      : 0,
    selectedTwoHitRate: settled.length
      ? Number((twoWins / settled.length * 100).toFixed(2))
      : 0
  };
}

function writeReport(data) {
  const rows = [
    "basePeriod,targetPeriod,status,oneWin,twoWin,createdAt,settledAt"
  ];

  for (const b of data.batches) {
    rows.push([
      b.basePeriod,
      b.targetPeriod,
      b.status,
      b.oneWin ?? "",
      b.twoWin ?? "",
      b.createdAt || "",
      b.settledAt || ""
    ].join(","));
  }

  fs.writeFileSync(
    REPORT_FILE,
    rows.join("\n") + "\n"
  );
}

function main() {
  const history = readHistory(HISTORY_FILE);

  if (history.length < 200) {
    throw new Error("至少需要200期歷史資料");
  }

  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(
      "找不到 V3.1 追蹤檔：" + SOURCE_FILE
    );
  }

  const source = JSON.parse(
    fs.readFileSync(SOURCE_FILE, "utf8")
  );

  if (!Array.isArray(source.batches)) {
    throw new Error("V3.1 追蹤資料格式錯誤");
  }

  const data = loadData();

  const drawMap = new Map(
    history.map(d => [d.period, d])
  );

  const settledNow = settlePending(data, drawMap);
  const newBatch = createPrediction(
    data, source, history
  );

  updateSummary(data, history);

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(data, null, 2) + "\n"
  );

  writeReport(data);

  console.log("===== Bingo 3-Star V3.2 =====");
  console.log("最新資料期號：", data.latestHistoryPeriod);
  console.log("下一期目標：", data.nextTargetPeriod);
  console.log("本次核獎：", settledNow);
  console.log("累計核獎：", data.summary.settledPeriods);
  console.log(
    "精選1組全中期數：",
    data.summary.selectedOneWinningPeriods
  );
  console.log(
    "精選2組全中期數：",
    data.summary.selectedTwoWinningPeriods
  );

  if (newBatch) {
    console.log("已建立預測：", newBatch.targetPeriod);
    console.log(
      "精選1組：",
      newBatch.selectedOne.map(t => t.join(" ")).join(" / ")
    );
    console.log(
      "精選2組：",
      newBatch.selectedTwo.map(t => t.join(" ")).join(" / ")
    );
  }

  console.log("追蹤資料：", OUTPUT_FILE);
  console.log("核獎報表：", REPORT_FILE);
}

main();
