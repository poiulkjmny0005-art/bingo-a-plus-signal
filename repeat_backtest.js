#!/usr/bin/env node
// Bingo 80 choose 20: select 3 or 5 numbers from previous draw and test next-draw repeats.
// Usage: node repeat_backtest.js history.csv [--train=200] [--test=200]
// CSV columns: period,n1,n2,...,n20; oldest row first OR newest first (detected by numeric period).
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const filename = args.find(a => !a.startsWith('--'));
if (!filename) { console.error('用法：node repeat_backtest.js history.csv [--train=200] [--test=200]'); process.exit(1); }
const opt = (name, fallback) => {
  const match = args.find(a => a.startsWith(`--${name}=`));
  const n = match ? Number(match.split('=')[1]) : fallback;
  if (!Number.isInteger(n) || n < 30) throw new Error(`${name} 必須為 >=30 的整數`);
  return n;
};
const train = opt('train', 200), testMax = opt('test', 200);
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(',').map(x => x.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /^(period|期號|draw|issue)$/i.test(parts[0])) continue;
    if (parts.length !== 21) throw new Error(`第 ${i+1} 行需要期號加20個號碼，實際 ${parts.length} 欄`);
    const numbers = parts.slice(1).map(Number);
    if (numbers.some(n => !Number.isInteger(n) || n < 1 || n > 80) || new Set(numbers).size !== 20) {
      throw new Error(`第 ${i+1} 行有無效或重複號碼`);
    }
    rows.push({period: parts[0], numbers});
  }
  if (rows.length < train + 2) throw new Error(`至少需要 ${train+2} 期，目前只有 ${rows.length} 期`);
  if (!rows.every(r => /^\d+$/.test(r.period))) throw new Error('期號必須是數字，以便確認時間先後順序');
  const first = BigInt(rows[0].period), last = BigInt(rows[rows.length-1].period);
  if (first === last) throw new Error('第一筆與最後一筆期號相同，無法確認排序');
  if (first > last) rows.reverse();
  for (let i=1;i<rows.length;i++) if (BigInt(rows[i].period) <= BigInt(rows[i-1].period)) throw new Error('期號必須依時間單調遞增或遞減，不可混亂或重複');
  return rows;
}
const draws = parseCsv(fs.readFileSync(filename, 'utf8'));
// Each model ranks ONLY numbers in immediately previous draw, based on past draws (no leakage).
const models = {
  '近10期熱度': (n, history) => history.slice(-10).filter(d=>d.numbers.includes(n)).length,
  '近30期熱度': (n, history) => history.slice(-30).filter(d=>d.numbers.includes(n)).length,
  '近期加權熱度': (n, history) => history.slice(-40).reduce((s,d,i,a)=>s+(d.numbers.includes(n)?(i+1)/a.length:0),0),
  '近期冷號': (n, history) => -history.slice(-30).filter(d=>d.numbers.includes(n)).length,
  '歷史連莊率(平滑)': (n, history) => {
    let exposed=0, repeats=0;
    for(let i=1;i<history.length;i++) {
      if(history[i-1].numbers.includes(n)) {exposed++; if(history[i].numbers.includes(n)) repeats++;}
    }
    // Beta prior 25%: equivalent to 20 historical exposures
    return (repeats+5)/(exposed+20);
  },
  '固定號碼排序(對照)': n => -n
};
const start = Math.max(train, draws.length - testMax);
const tests = draws.length - start;
const results = {};
for(const name of Object.keys(models)) results[name] = {3:{any:0,total:0,two:0,all:0},5:{any:0,total:0,two:0,all:0}};
for(let i=start;i<draws.length;i++) {
  const past = draws.slice(0,i); // prior draws only
  const last = past[past.length-1].numbers;
  const actual = new Set(draws[i].numbers);
  for(const [name,score] of Object.entries(models)) {
    const ranked = last.map(n=>({n, s:score(n,past)})).sort((a,b)=>b.s-a.s || a.n-b.n);
    for(const k of [3,5]) {
      const hits = ranked.slice(0,k).filter(x=>actual.has(x.n)).length;
      const r = results[name][k];
      r.any += +(hits>=1); r.two += +(hits>=2); r.all += +(hits===k); r.total+=hits;
    }
  }
}
function choose(n,k){let p=1;for(let i=1;i<=k;i++)p*= (n-i+1)/i;return p;}
function randomAtLeastOne(k) {return 1 - choose(60,k)/choose(80,k);}
function randomAtLeastTwo(k) {
  return 1 - choose(60,k)/choose(80,k) - (choose(20,1)*choose(60,k-1))/choose(80,k);
}
console.log(`資料：${draws.length}期，訓練至少${train}期；時間順序驗證 ${tests} 期（每期預測下一期）`);
console.log('重要：每一筆測試只使用當時之前的歷史資料；沒有使用未來資料。');
for(const k of [3,5]) {
  console.log(`\n===== 上期20顆中選${k}顆 =====`);
  console.log(`隨機基準：至少中1顆 ${(100*randomAtLeastOne(k)).toFixed(2)}%；至少中2顆 ${(100*randomAtLeastTwo(k)).toFixed(2)}%；平均命中 ${(k*.25).toFixed(2)} 顆`);
  const ranking = Object.entries(results).map(([name,v])=>({name,...v[k]})).sort((a,b)=>b.total-a.total || b.any-a.any);
  for(const r of ranking) {
    console.log(`${r.name.padEnd(15)} 至少中1顆 ${r.any}/${tests} (${(r.any/tests*100).toFixed(2)}%) | 至少中2顆 ${r.two}/${tests} (${(r.two/tests*100).toFixed(2)}%) | 平均 ${(r.total/tests).toFixed(3)} 顆`);
  }
}
console.log('\n提醒：從多個模型中挑最高分會有選模偏差；需要另外保留完全未參與選模的未來期數再驗證。');
