#!/usr/bin/env node
// Read full 20-number historical Bingo draws from auzo date pages.
// Usage: node fetch_history.js --days=14 --output=history.csv
const fs = require('node:fs');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const s = args.find(x => x.startsWith(`--${name}=`));
  return s ? s.slice(name.length+3) : fallback;
};
const days = Number(arg('days','14'));
const output = arg('output','history.csv');
if (!Number.isInteger(days) || days < 1 || days > 90) throw Error('--days must be 1..90');
const clean = s => s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim();
function parsePage(html) {
  const rows = html.match(/<tr\b[^>]*class\s*=\s*["'][^"']*\bbingo_row\b[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi) || [];
  const draws = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map(m=>({attrs:m[1], text:clean(m[2])}));
    const periodCell = cells.find(c=>/\bBPeriod\b/i.test(c.attrs));
    const period = periodCell?.text.match(/\b\d{8,}\b/)?.[0];
    if (!period || cells.length < 2) continue;
    const nums = (cells[1].text.match(/\b\d{1,2}\b/g)||[]).map(Number);
    if (nums.length !== 20 || nums.some(n=>n<1||n>80) || new Set(nums).size !== 20) {
      console.warn(`略過 ${period}：20 顆號碼無法驗證 (${nums.length} 顆)`);
      continue;
    }
    draws.push({period, numbers:nums});
  }
  return {rowCount:rows.length, draws};
}
function dateTW(offset) {
  const d = new Date(Date.now() + 8*3600*1000);
  const ymd = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+offset));
  return `${ymd.getUTCFullYear()}${String(ymd.getUTCMonth()+1).padStart(2,'0')}${String(ymd.getUTCDate()).padStart(2,'0')}`;
}
async function main() {
  const all = new Map();
  let successDays = 0;
  for(let i=0;i<days;i++) {
    const day=dateTW(-i);
    const url=`https://lotto.auzo.tw/bingobingo/list_${day}.html`;
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1','Accept':'text/html,application/xhtml+xml'}});
      if(!response.ok) {console.log(`${day}: HTTP ${response.status}`);continue;}
      const {rowCount,draws}=parsePage(await response.text());
      console.log(`${day}: HTML rows=${rowCount}, validated draws=${draws.length}`);
      if(draws.length) successDays++;
      for(const d of draws) all.set(d.period,d);
    } catch(e) {console.log(`${day}: fetch failed: ${e.message}`);}
  }
  const sorted=[...all.values()].sort((a,b)=>BigInt(a.period)<BigInt(b.period)?-1:BigInt(a.period)>BigInt(b.period)?1:0);
  if(successDays===0 || sorted.length < 202) throw Error(`資料不足：${sorted.length} 期（至少202期）；請確認網站格式與網路連線。`);
  const csv=['period,'+Array.from({length:20},(_,i)=>`n${i+1}`).join(','),...sorted.map(d=>[d.period,...d.numbers].join(','))].join('\n')+'\n';
  fs.writeFileSync(output,csv,'utf8');
  console.log(`完成：${sorted.length} 期，${successDays} 天，輸出 ${output}`);
}
main().catch(e=>{console.error('抓取失敗：'+e.message);process.exitCode=1;});
