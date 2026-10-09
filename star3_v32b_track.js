
"use strict";

// Bingo 3-Star V3.2 B
// 精選3組、9顆不重複
// Node.js 22+
// Usage: node star3_v32b_track.js history.csv

const fs = require("node:fs");

const HISTORY_FILE = process.argv[2] || "history.csv";
const SOURCE_FILE = "star3_v3_tracking.json";
const OUTPUT_FILE = "star3_v32b_tracking.json";
const REPORT_FILE = "star3_v32b_report.csv";

function readHistory(file) {
  if (!fs.existsSync(file)) {
    throw new Error("找不到歷史資料：" + file);
  }

  const lines = fs.readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);

  const header = lines.shift()
    .split(",").map(s => s.trim());

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

function pairKey(a, b) {
  return a * 81 + b;
}

function tripleKey(a, b, c) {
  return a * 6561 + b * 81 + c;
}

function buildStats(history) {
  const recent40 = history.slice(-40);
  const recent200 = history.slice(-200);

  if (recent200.length < 200) {
    throw new Error("至少需要200期歷史資料");
  }

  function count(draws) {
    const single = Array(81).fill(0);
    const pairs = new Map();
    const triples = new Map();

    for (const draw of draws) {
      const nums = draw.numbers;

      for (let i = 0; i < nums.length; i++) {
        const a = nums[i];
        single[a]++;

        for (let j = i + 1; j < nums.length; j++) {
          const b = nums[j];
          const pk = pairKey(a, b);

          pairs.set(pk, (pairs.get(pk) || 0) + 1);

          for (let k = j + 1; k < nums.length; k++) {
            const c = nums[k];
            const tk = tripleKey(a, b, c);

            triples.set(
              tk,
              (triples.get(tk) || 0) + 1
            );
          }
        }
      }
    }

    return { single, pairs, triples };
  }

  return {
    short: count(recent40),
    long: count(recent200)
  };
}

// 歷史出現頻率相對於理論平均值的評分
// 加入平滑，降低短期樣本波動的影響
function relativeScore(count40, count200, expected) {
  const rate40 =
    (count40 + expected * 20) / 60;

  const rate200 =
    (count200 + expected * 40) / 240;

  const ratio =
    (0.4 * rate40 + 0.6 * rate200) / expected;

  return Math.min(ratio, 3);
}

function buildScores(stats) {
  const expected1 = 20 / 80;
  const expected2 = (20 * 19) / (80 * 79);
  const expected3 =
    (20 * 19 * 18) / (80 * 79 * 78);

  const singles = Array(81).fill(0);

  for (let n = 1; n <= 80; n++) {
    singles[n] = relativeScore(
      stats.short.single[n],
      stats.long.single[n],
      expected1
    );
  }

  function pair(a, b) {
    if (a > b) [a, b] = [b, a];

    const key = pairKey(a, b);

    return relativeScore(
      stats.short.pairs.get(key) || 0,
      stats.long.pairs.get(key) || 0,
      expected2
    );
  }

  function triple(a, b, c) {
    [a, b, c] = [a, b, c].sort((x, y) => x - y);

    const key = tripleKey(a, b, c);

    return relativeScore(
      stats.short.triples.get(key) || 0,
      stats.long.triples.get(key) || 0,
      expected3
    );
  }

  function ticketScore(ticket) {
    const [a, b, c] = ticket;

    const singleScore =
      (singles[a] + singles[b] + singles[c]) / 3;

    const pairScore =
      (pair(a, b) + pair(a, c) + pair(b, c)) / 3;

    const tripleScore = triple(a, b, c);

    return (
      0.5 * singleScore +
      0.3 * pairScore +
      0.2 * tripleScore
    );
  }

  return { ticketScore };
}

function chooseSelections(tickets, history) {
  if (!validTickets(tickets)) {
    throw new Error("原始10組三星資料不正確");
  }

  const scores = buildScores(buildStats(history));

  const originalGroups = new Set(
    tickets.map(t =>
      [...t].sort((a, b) => a - b).join("-")
    )
  );

  let best = null;
  let evaluated = 0;

  // 10組中選9組，每組只取1顆
  function chooseGroups(start, groups) {
    if (groups.length === 9) {
      chooseNumbers(groups, 0, [], new Set());
      return;
    }

    for (
      let i = start;
      i <= 10 - (9 - groups.length);
      i++
    ) {
      chooseGroups(i + 1, [...groups, i]);
    }
  }

  function chooseNumbers(groups, index, selected, used) {
    if (index === 9) {
      const first = selected.slice(0, 3)
        .sort((a, b) => a - b);

      const second = selected.slice(3, 6)
        .sort((a, b) => a - b);

      const third = selected.slice(6, 9)
        .sort((a, b) => a - b);

      const selectedThree = [
        first,
        second,
        third
      ];

      // 不直接複製V3.1原始三星組合
      if (selectedThree.some(t =>
        originalGroups.has(t.join("-"))
      )) return;

      const groupScores = selectedThree.map(
        t => scores.ticketScore(t)
      );

      const totalScore = groupScores.reduce(
        (sum, s) => sum + s, 0
      );

      evaluated++;

      const signature = selectedThree
        .map(t => t.join("-"))
        .join("|");

      if (
        !best ||
        totalScore > best.totalScore + 1e-12 ||
        (
          Math.abs(totalScore - best.totalScore) <= 1e-12 &&
          signature < best.signature
        )
      ) {
        best = {
          selectedThree: selectedThree.map(t => [...t]),
          sourceGroups: groups.map(i => i + 1),
          groupScores,
          totalScore,
          signature
        };
      }

      return;
    }

    const groupIndex = groups[index];

    for (const n of tickets[groupIndex]) {
      if (used.has(n)) continue;

      // 每3個來源組形成1組三星
      // 提前排除原始組合
      if (index % 3 === 2) {
        const t = [
          selected[index - 2],
          selected[index - 1],
          n
        ].sort((a, b) => a - b);

        if (originalGroups.has(t.join("-"))) {
          continue;
        }
      }

      used.add(n);
      selected.push(n);

      chooseNumbers(
        groups,
        index + 1,
        selected,
        used
      );

      selected.pop();
      used.delete(n);
    }
  }

  chooseGroups(0, []);

  if (!best) {
    throw new Error("找不到符合條件的9顆精選號碼");
  }

  const allNine = best.selectedThree.flat();

  if (new Set(allNine).size !== 9) {
    throw new Error("精選9顆號碼出現重複");
  }

  return {
    selectedThree: best.selectedThree,
    sourceGroups: best.sourceGroups,
    groupScores: best.groupScores.map(
      s => Number(s.toFixed(6))
    ),
    totalScore: Number(best.totalScore.toFixed(6)),
    evaluatedCandidates: evaluated
  };
}

function loadData() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return {
      version: "3.2B",
      strategy: "V32B_THREE_GROUP_ASSOCIATION",
      batches: [],
      missedPeriods: 0
    };
  }

  const data = JSON.parse(
    fs.readFileSync(OUTPUT_FILE, "utf8")
  );

  if (!Array.isArray(data.batches)) {
    throw new Error("B版追蹤資料格式錯誤");
  }

  return data;
}

function settlePending(data, drawMap) {
  let settledNow = 0;

  for (const batch of data.batches) {
    if (batch.status !== "pending") continue;

    const draw = drawMap.get(
      String(batch.targetPeriod)
    );

    if (!draw) continue;

    const actual = new Set(draw.numbers);

    batch.threeResults = batch.selectedThree.map(
      ticket => {
        const hits = ticket.filter(
          n => actual.has(n)
        );

        return {
          ticket,
          hits,
          hitCount: hits.length,
          fullHit: hits.length === 3
        };
      }
    );

    batch.actualNumbers = draw.numbers;

    batch.threeWin = batch.threeResults.some(
      r => r.fullHit
    );

    batch.fullHitGroups = batch.threeResults.filter(
      r => r.fullHit
    ).length;

    batch.status = "settled";
    batch.settledAt = new Date().toISOString();

    settledNow++;
  }

  return settledNow;
}

function createPrediction(data, source, history) {
  const latest = history.at(-1);
  const target = String(
    BigInt(latest.period) + 1n
  );

  const exists = data.batches.some(
    b => String(b.targetPeriod) === target
  );

  if (exists) return null;

  const sourceBatch = source.batches.find(
    b =>
      String(b.targetPeriod) === target &&
      b.status === "pending" &&
      validTickets(b.tickets)
  );

  if (!sourceBatch) {
    console.log(
      "V3.1尚未提供下一期有效10組，B版不建立預測"
    );
    return null;
  }

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
    selectedThree: selections.selectedThree,
    sourceGroups: selections.sourceGroups,
    groupScores: selections.groupScores,
    totalScore: selections.totalScore,
    evaluatedCandidates:
      selections.evaluatedCandidates
  };

  data.batches.push(batch);

  return batch;
}

function updateSummary(data, history) {
  const settled = data.batches.filter(
    b => b.status === "settled"
  );

  const winningPeriods = settled.filter(
    b => b.threeWin
  ).length;

  const fullHitGroups = settled.reduce(
    (sum, b) => sum + (b.fullHitGroups || 0),
    0
  );

  const latest = history.at(-1);

  data.latestHistoryPeriod = latest.period;
  data.nextTargetPeriod = String(
    BigInt(latest.period) + 1n
  );

  data.lastRunAt = new Date().toISOString();

  data.summary = {
    totalPredictions: data.batches.length,
    settledPeriods: settled.length,
    pendingPeriods: data.batches.filter(
      b => b.status === "pending"
    ).length,
    selectedThreeWinningPeriods: winningPeriods,
    selectedThreeFullHitGroups: fullHitGroups,
    selectedThreeHitRate: settled.length
      ? Number(
          (winningPeriods / settled.length * 100)
            .toFixed(2)
        )
      : 0,
    totalTicketsSettled: settled.length * 3,
    perTicketFullHitRate: settled.length
      ? Number(
          (
            fullHitGroups /
            (settled.length * 3) *
            100
          ).toFixed(2)
        )
      : 0
  };
}

function writeReport(data) {
  const rows = [
    "basePeriod,targetPeriod,status,group1,group2,group3,fullHitGroups,threeWin,createdAt,settledAt"
  ];

  for (const b of data.batches) {
    const groups = b.selectedThree.map(
      t => t.join("-")
    );

    rows.push([
      b.basePeriod,
      b.targetPeriod,
      b.status,
      groups[0],
      groups[1],
      groups[2],
      b.fullHitGroups ?? "",
      b.threeWin ?? "",
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
      "找不到V3.1追蹤檔：" + SOURCE_FILE
    );
  }

  const source = JSON.parse(
    fs.readFileSync(SOURCE_FILE, "utf8")
  );

  if (!Array.isArray(source.batches)) {
    throw new Error("V3.1追蹤資料格式錯誤");
  }

  const data = loadData();

  const drawMap = new Map(
    history.map(d => [d.period, d])
  );

  const settledNow = settlePending(
    data,
    drawMap
  );

  const newBatch = createPrediction(
    data,
    source,
    history
  );

  updateSummary(data, history);

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(data, null, 2) + "\n"
  );

  writeReport(data);

  console.log("===== Bingo V3.2 B版 =====");
  console.log(
    "最新資料期號：",
    data.latestHistoryPeriod
  );
  console.log(
    "下一期目標：",
    data.nextTargetPeriod
  );
  console.log("本次核獎：", settledNow);
  console.log(
    "累計核獎：",
    data.summary.settledPeriods
  );
  console.log(
    "精選3組全中期數：",
    data.summary.selectedThreeWinningPeriods
  );
  console.log(
    "精選3組命中率：",
    data.summary.selectedThreeHitRate + "%"
  );

  if (newBatch) {
    console.log(
      "已建立預測：",
      newBatch.targetPeriod
    );

    newBatch.selectedThree.forEach((t, i) => {
      console.log(
        "精選第" + (i + 1) + "組：",
        t.join(" ")
      );
    });

    console.log(
      "來源組別：",
      newBatch.sourceGroups.join(",")
    );
  }

  console.log("追蹤資料：", OUTPUT_FILE);
  console.log("核獎報表：", REPORT_FILE);
}

main();
