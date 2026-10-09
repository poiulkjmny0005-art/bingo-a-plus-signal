
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

  if (!Array.isArray(tickets) || tickets.length !== 10) {
    throw new Error("必須提供原始10組三星號碼");
  }

  // 每個原始組合挑出1顆，最後從6個不同組合取6顆
  // 同一號碼若出現在不同原始組合，也不能重複使用
  const originalGroups = new Set(
    tickets.map(t =>
      [...t].sort((a, b) => a - b).join("-")
    )
  );

  // 每組內按歷史評分排序
  const choices = tickets.map((ticket, groupIndex) =>
    ticket.map(n => ({
      number: n,
      groupIndex,
      value: score[n]
    })).sort((a, b) =>
      b.value - a.value ||
      a.number - b.number
    )
  );

  const candidates = [];

  // 枚舉10組中任意6組
  function chooseGroups(start, selected) {
    if (selected.length === 6) {
      chooseNumbers(selected, 0, []);
      return;
    }

    for (
      let i = start;
      i <= 10 - (6 - selected.length);
      i++
    ) {
      chooseGroups(i + 1, [...selected, i]);
    }
  }

  // 每個選定的原始組合各取1顆
  function chooseNumbers(groups, index, selected) {
    if (index === groups.length) {
      const numbers = selected.map(x => x.number);

      if (new Set(numbers).size !== 6) return;

      // 第1組：前3個不同來源組
      // 第2組：後3個不同來源組
      const first = selected.slice(0, 3)
        .map(x => x.number)
        .sort((a, b) => a - b);

      const second = selected.slice(3, 6)
        .map(x => x.number)
        .sort((a, b) => a - b);

      // 不可直接複製原本的三星組合
      if (originalGroups.has(first.join("-"))) return;
      if (originalGroups.has(second.join("-"))) return;

      const totalScore = selected.reduce(
        (sum, x) => sum + x.value, 0
      );

      candidates.push({
        first,
        second,
        totalScore,
        sourceGroups: groups.map(i => i + 1)
      });

      return;
    }

    const groupIndex = groups[index];

    for (const choice of choices[groupIndex]) {
      if (selected.some(
        x => x.number === choice.number
      )) continue;

      chooseNumbers(
        groups,
        index + 1,
        [...selected, choice]
      );
    }
  }

  chooseGroups(0, []);

  if (candidates.length === 0) {
    throw new Error("無法產生6組來源分散的精選號碼");
  }

  // 依6顆號碼總歷史評分選出最佳組合
  candidates.sort((a, b) =>
    b.totalScore - a.totalScore ||
    a.first.join("-").localeCompare(
      b.first.join("-")
    ) ||
    a.second.join("-").localeCompare(
      b.second.join("-")
    )
  );

  const best = candidates[0];

  // 再次確認6顆號碼不重複
  const allSix = [...best.first, ...best.second];

  if (new Set(allSix).size !== 6) {
    throw new Error("精選6顆號碼發生重複");
  }

  return {
    selectedOne: [best.first],
    selectedTwo: [best.first, best.second]
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
