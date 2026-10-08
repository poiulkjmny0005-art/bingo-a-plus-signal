'use strict';
// A+ v6.3 research only. One number, fixed for 12 future draws.
// Does not change scanner_v62.js or aplus_v61_tracking.json.
const fs = require('node:fs');
const H = 12, L = 100;
const baseline = 1 - Math.pow(79 / 80, H);
const arg = (key, fallback) => { const p=process.argv.find(x=>x.startsWith(`--${key}=`)); return p ? p.slice(key.length+3) : fallback; };
const pad = n => String(n).padStart(2,'0');
function dateTW(offset) {
  const s = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [y,m,d]=s.split('-').map(Number), dt=new Date(Date.UTC(y,m-1,d+offset));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth()+1)}${pad(dt.getUTCDate())}`;
}
function strip(html) {return html.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
function parsePage(html) {
  const rows=html.match(/<tr\b[^>]*class=["'][^"']*\bbingo_row\b[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi)||[];
  const out=[];
  for(const row of rows) {
    const cells=[...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    const periodCell=cells.find(m=>/\bBPeriod\b/i.test(m[1]));
    if(!periodCell) continue;
    const pm=strip(periodCell[2]).match(/(\d{8,})\s+(\d{1,2}:\d{2})/);
    if(!pm) continue;
    // Original v6.2 identifies super ball by a DIV class ending in 's'.
    // Reject ambiguous/missing markers rather than silently picking a wrong ball.
    const found=[];
    for(const m of row.matchAll(/<div\b([^>]*)>([\s\S]*?)<\/div>/gi)) {
      const cls=m[1].match(/\bclass\s*=\s*["']([^"']+)["']/i);
      const n=strip(m[2]);
      if(cls && /s$/i.test(cls[1].trim()) && /^\d{1,2}$/.test(n) && +n>=1 && +n<=80) found.push(+n);
    }
    if(found.length===1) out.push({period:pm[1],time:pm[2],number:found[0]});
  }
  return out;
}
async function load() {
  const csv=arg('csv',null);
  if(csv) {
    const txt=fs.readFileSync(csv,'utf8').replace(/^\uFEFF/,'').trim();
    const lines=txt.split(/\r?\n/).filter(Boolean);
    const header=lines[0].split(',').map(s=>s.trim().toLowerCase());
    const p=header.findIndex(s=>['period','期號','draw_id'].includes(s));
    const n=header.findIndex(s=>['superball','super_ball','super','number','超級獎號'].includes(s));
    if(p<0||n<0) throw Error('CSV 必須包含 period 與 superBall 欄位（不是20顆一般號碼）');
    return lines.slice(1).map(line=>{const c=line.split(',');return {period:c[p]?.trim(),number:Number(c[n])};});
  }
  const days=Number(arg('days','10'));
  if(!Number.isInteger(days)||days<1||days>60) throw Error('--days 需為 1～60');
  const all=[];
  for(let i=0;i<days;i++) {
    const date=dateTW(-i), url=`https://lotto.auzo.tw/bingobingo/list_${date}.html`;
    try {
      const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'}});
      if(!r.ok) {console.log(`⚠️ ${date} HTTP ${r.status}`);continue;}
      const got=parsePage(await r.text());
      console.log(`📅 ${date} 解析有效超級獎號 ${got.length} 期`);
      all.push(...got);
    } catch(e) {console.log(`⚠️ ${date} 抓取失敗：${e.message}`);}
  }
  return all;
}
function normalize(raw) {
  const map=new Map();
  for(const x of raw) {
    const p=String(x.period||''), n=Number(x.number);
    if(!/^\d{8,}$/.test(p)||!Number.isInteger(n)||n<1||n>80) continue;
    if(map.has(p) && map.get(p).number!==n) throw Error(`期號 ${p} 有不同超級獎號，停止回測`);
    map.set(p,{period:p,number:n});
  }
  const arr=[...map.values()].sort((a,b)=>Number(b.period)-Number(a.period));
  for(let i=1;i<arr.length;i++) {
    if(BigInt(arr[i-1].period)!==BigInt(arr[i].period)+1n) {
      // Do not score a 12-draw block that skips draw IDs.
      console.log('⚠️ 歷史資料含跳號，會略過不連續的測試區間'); break;
    }
  }
  return arr;
}
const strategies = {
  HOT10:f=>f.c10, HOT20:f=>f.c20, HOT50:f=>f.c50, HOT100:f=>f.c100,
  HOT_ACCEL:f=>f.c10/10-f.c50/50,
  MOMENTUM:f=>3*f.c10+f.c20-0.6*f.c50,
  RECENT_REPEAT:f=>f.gap===0?1:0,
  GAP_SHORT:f=>f.gap>=4&&f.gap<=20?20-f.gap:-f.gap,
  GAP_LONG:f=>f.gap,
  COLD50:f=>-f.c50,
  MIXED:f=>4*f.c10+2*f.c20+f.c50+(f.gap>=3&&f.gap<=15?3:0),
  FIXED01:(_,n)=>n===1?1:0
};
function features(past) {
  const f=Array.from({length:80},(_,i)=>({n:i+1,c10:0,c20:0,c50:0,c100:0,gap:100}));
  past.forEach((v,i)=>{const x=f[v-1];if(i<10)x.c10++;if(i<20)x.c20++;if(i<50)x.c50++;x.c100++;if(x.gap===100)x.gap=i;});
  return f;
}
function pick(f,name) {
  let best=1, score=-Infinity;
  for(const x of f) {const v=strategies[name](x,x.n);if(v>score+1e-10) {score=v;best=x.n;}}
  return best;
}
function scoreBlock(b,name) {
  const p=pick(b.features,name), at=b.future.indexOf(p)+1;
  return {pick:p,hitAt:at,hit:at>0};
}
function summary(blocks,name) {
  const result=blocks.map(b=>scoreBlock(b,name)), hits=result.filter(x=>x.hit).length;
  return {strategy:name,rounds:result.length,hits,rate:result.length?hits/result.length:0};
}
function wilsonLower(h,n,z=1.96) {
  if(!n)return 0; const p=h/n, z2=z*z, d=1+z2/n;
  return (p+z2/(2*n)-z*Math.sqrt(p*(1-p)/n+z2/(4*n*n)))/d;
}
function continuous(a) {
  for(let i=1;i<a.length;i++) if(BigInt(a[i-1].period)!==BigInt(a[i].period)+1n) return false;
  return true;
}
function main(history) {
  if(history.length<L+H*25) throw Error(`有效連續歷史期數不足，至少需要 ${L+H*25} 期；目前 ${history.length} 期`);
  const blocks=[];
  // newest-first history; 12-draw windows non-overlapping, oldest to newest
  for(let start=H;start+L<=history.length;start+=H) {
    const segment=history.slice(start-H,start+L);
    if(!continuous(segment)) continue;
    blocks.push({start,anchor:history[start].period,features:features(history.slice(start,start+L).map(x=>x.number)),future:history.slice(start-H,start).reverse().map(x=>x.number)});
  }
  blocks.reverse();
  if(blocks.length<25) throw Error(`完整12期回測組不足：${blocks.length} 組`);
  const a=Math.floor(blocks.length*0.6),b=Math.floor(blocks.length*0.8);
  const train=blocks.slice(0,a),tune=blocks.slice(a,b),holdout=blocks.slice(b);
  const ranked=Object.keys(strategies).map(name=>({name,train:summary(train,name)})).sort((x,y)=>y.train.rate-x.train.rate||x.name.localeCompare(y.name));
  const top=ranked.slice(0,Math.min(5,ranked.length));
  const tuned=top.map(x=>({...x,tune:summary(tune,x.name)})).sort((x,y)=>y.tune.rate-x.tune.rate||y.train.rate-x.train.rate||x.name.localeCompare(y.name));
  const chosen=tuned[0];
  const test=summary(holdout,chosen.name), lower=wilsonLower(test.hits,test.rounds);
  const allHoldout=Object.keys(strategies).map(name=>summary(holdout,name)); // diagnostic only, not selection
  const nextFeatures=features(history.slice(0,L).map(x=>x.number));
  const candidate=pick(nextFeatures,chosen.name);
  const result={version:'6.3-research',generatedAt:new Date().toISOString(),latestPeriod:history[0].period,historyDraws:history.length,rule:'one fixed number for 12 consecutive future draws',baseline,selection:{trainRounds:train.length,tuneRounds:tune.length,holdoutRounds:holdout.length,top5Train:top,chosen:chosen.name},holdout:{...test,wilson95Lower:lower,aboveRandom95Lower:lower>baseline},nextResearchCandidate:pad(candidate),note:'Research only. The holdout is not used to select strategies. No evidence of predictive advantage without adequate independent replication.'};
  console.log('\n==============================================');
  console.log('🧪 A+ v6.3 超級獎號：固定一顆 × 12期');
  console.log('==============================================');
  console.log(`📚 有效資料 ${history.length} 期；不重疊12期測試組 ${blocks.length}`);
  console.log(`訓練 ${train.length} 組／調整 ${tune.length} 組／最終保留 ${holdout.length} 組`);
  console.log(`🏅 訓練＋調整選定：${chosen.name}`);
  console.log(`🔒 最終保留區：${test.hits}/${test.rounds} = ${(test.rate*100).toFixed(2)}%`);
  console.log(`🎲 公平隨機基準：${(baseline*100).toFixed(2)}%`);
  console.log(`📉 最終保留區95% Wilson信賴區間下限：${(lower*100).toFixed(2)}%`);
  console.log(lower>baseline?'🟡 統計門檻初步通過，仍需新資料複驗':'⚠️ 未證明優於隨機基準，不能宣稱提高命中率');
  console.log(`🎯 研究候選：${pad(candidate)}（依最新期 ${history[0].period}，尚未驗證）`);
  fs.writeFileSync('super_v63_report.json',JSON.stringify(result,null,2)+'\n');
  const rows=['strategy,holdout_rounds,holdout_hits,holdout_rate'];
  for(const x of allHoldout)rows.push(`${x.strategy},${x.rounds},${x.hits},${(x.rate*100).toFixed(4)}`);
  fs.writeFileSync('super_v63_comparison.csv',rows.join('\n')+'\n');
  console.log('💾 super_v63_report.json / super_v63_comparison.csv');
}
if(require.main===module)load().then(raw=>main(normalize(raw))).catch(e=>{console.error('❌',e.message);process.exitCode=1;});
module.exports={parsePage,normalize,features,pick,scoreBlock,continuous,main};
