'use strict';
// Bingo Super A+ v6.4: pre-registered, forward-only research.
// HOT100 and GAP_SHORT each choose ONE fixed number for the NEXT 12 draws.
// Research only; does not alter v6.2/v6.3 or star345.
const fs = require('node:fs');
const PATH = 'super_v64_tracking.json';
const REPORT = 'super_v64_report.json';
const CSV = 'super_v64_rounds.csv';
const HORIZON = 12;
const LOOKBACK = 100;
const MODELS = ['HOT100', 'GAP_SHORT'];
const BASELINE = 1 - (79 / 80) ** HORIZON;
const pad = n => String(n).padStart(2, '0');
function dateTW(offset) {
  const s = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [y,m,d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y,m-1,d+offset));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth()+1)}${pad(dt.getUTCDate())}`;
}
function strip(html) {return html.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
function parsePage(html) {
  const rows = html.match(/<tr\b[^>]*class=["'][^"']*\bbingo_row\b[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi) || [];
  const out = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    const pc = cells.find(m => /\bBPeriod\b/i.test(m[1]));
    if (!pc) continue;
    const pm = strip(pc[2]).match(/(\d{8,})\s+(\d{1,2}:\d{2})/);
    if (!pm) continue;
    const found = [];
    for (const m of row.matchAll(/<div\b([^>]*)>([\s\S]*?)<\/div>/gi)) {
      const cls = m[1].match(/\bclass\s*=\s*["']([^"']+)["']/i);
      const num = strip(m[2]);
      if (cls && /s$/i.test(cls[1].trim()) && /^\d{1,2}$/.test(num) && +num >= 1 && +num <= 80) found.push(+num);
    }
    if (found.length === 1) out.push({period:pm[1],number:found[0]});
  }
  return out;
}
async function loadDraws() {
  const csv = process.argv.find(x=>x.startsWith('--csv='));
  if (csv) {
    const lines = fs.readFileSync(csv.slice(6),'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    const cols = lines.shift().split(',').map(x=>x.trim().toLowerCase());
    const pi = cols.findIndex(x=>['period','期號'].includes(x));
    const ni = cols.findIndex(x=>['superball','super_ball','超級獎號'].includes(x));
    if (pi<0 || ni<0) throw Error('CSV 必須有 period,superBall 欄位');
    return lines.filter(Boolean).map(line=>{const c=line.split(',');return {period:c[pi]?.trim(),number:Number(c[ni])};});
  }
  const days = Number((process.argv.find(x=>x.startsWith('--days='))||'--days=3').slice(7));
  if (!Number.isInteger(days) || days<1 || days>30) throw Error('--days 必須為 1～30');
  const all = [];
  for (let i=0;i<days;i++) {
    const date = dateTW(-i), url=`https://lotto.auzo.tw/bingobingo/list_${date}.html`;
    try {
      const r = await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'}});
      if (!r.ok) {console.log(`⚠️ ${date}: HTTP ${r.status}`);continue;}
      const parsed = parsePage(await r.text());
      console.log(`📅 ${date}: ${parsed.length} 期有效超級獎號`);
      all.push(...parsed);
    } catch(e) {console.log(`⚠️ ${date}: ${e.message}`);}
  }
  return all;
}
function normalize(raw) {
  const map = new Map();
  for (const x of raw) {
    const period = String(x.period || ''), number = Number(x.number);
    if (!/^\d{8,}$/.test(period) || !Number.isInteger(number) || number<1 || number>80) continue;
    if (map.has(period) && map.get(period).number !== number) throw Error(`期號 ${period} 超級獎號資料衝突`);
    map.set(period,{period,number});
  }
  return [...map.values()].sort((a,b)=>Number(BigInt(a.period)-BigInt(b.period)));
}
function contiguous(draws) {
  for (let i=1;i<draws.length;i++) if (BigInt(draws[i].period) !== BigInt(draws[i-1].period)+1n) return false;
  return true;
}
function choose(history) {
  if (history.length<LOOKBACK || !contiguous(history.slice(-LOOKBACK))) throw Error('無法取得連續100期作為選號依據，停止處理');
  const last = history.slice(-LOOKBACK).reverse();
  const stats = Array.from({length:80},(_,i)=>({number:i+1,count:0,gap:100}));
  last.forEach((x,i)=>{const s=stats[x.number-1];s.count++;if(s.gap===100)s.gap=i;});
  const rank = score => [...stats].sort((a,b)=>score(b)-score(a)||a.number-b.number)[0].number;
  return {
    HOT100:rank(s=>s.count),
    GAP_SHORT:rank(s=>s.gap>=4&&s.gap<=20?20-s.gap:-s.gap)
  };
}
function emptyState() {return {version:'6.4-forward',rule:'each model locks one number for 12 consecutive new draws',models:MODELS,active:null,completed:[]};}
function readState() {
  if (!fs.existsSync(PATH)) return emptyState();
  const state=JSON.parse(fs.readFileSync(PATH,'utf8'));
  if(state.version!=='6.4-forward'||!Array.isArray(state.completed)||!state.models||state.models.join('|')!==MODELS.join('|')) throw Error('v6.4 追蹤狀態格式不相容，拒絕覆蓋');
  return state;
}
function newRound(anchor,history) {
  return {anchorPeriod:anchor,picks:choose(history),draws:[]};
}
function advance(state, history) {
  if(history.length<LOOKBACK) throw Error(`有效資料不足100期：${history.length}`);
  if(!state.active) {
    // First run starts at the latest known draw. Never score past draws.
    state.active=newRound(history[history.length-1].period,history);
    console.log(`🔒 首次鎖定起始期號 ${state.active.anchorPeriod}，從下一期開始驗證`);
    return {state,processed:0,settled:0};
  }
  const anchor=BigInt(state.active.anchorPeriod);
  const future=history.filter(x=>BigInt(x.period)>anchor);
  if(future.length===0) return {state,processed:0,settled:0};
  // Ensure no skipped or duplicated draws, including previously recorded draws.
  let expected=anchor+BigInt(state.active.draws.length)+1n;
  const unseen=future.filter(x=>BigInt(x.period)>=expected);
  if(unseen.length && BigInt(unseen[0].period)!==expected) throw Error(`缺少期號 ${expected}，不跳過資料、不結算`);
  let processed=0,settled=0;
  for(const draw of unseen) {
    if(BigInt(draw.period)!==expected) throw Error(`缺少期號 ${expected}，不跳過資料、不結算`);
    state.active.draws.push({period:draw.period,number:draw.number});
    processed++;
    expected++;
    if(state.active.draws.length===HORIZON) {
      const r=state.active;
      const results={};
      for(const name of MODELS) {
        const hitIndex=r.draws.findIndex(x=>x.number===r.picks[name]);
        results[name]={pick:r.picks[name],hit:hitIndex>=0,firstHitAt:hitIndex>=0?hitIndex+1:null};
      }
      state.completed.push({round:state.completed.length+1,anchorPeriod:r.anchorPeriod,endPeriod:draw.period,picks:r.picks,results});
      settled++;
      // Re-lock at the 12th draw, using only history available at that point.
      const past=history.filter(x=>BigInt(x.period)<=BigInt(draw.period));
      state.active=newRound(draw.period,past);
    }
  }
  return {state,processed,settled};
}
function wilson(h,n,z=1.96) {
  if(!n) return {lower:0,upper:1};
  const p=h/n,z2=z*z,den=1+z2/n,mid=(p+z2/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/den;
  return {lower:Math.max(0,mid-half),upper:Math.min(1,mid+half)};
}
function report(state, latest) {
  const results={};
  for(const name of MODELS) {
    const n=state.completed.length,h=state.completed.filter(x=>x.results[name].hit).length;
    results[name]={rounds:n,hits:h,rate:n?h/n:null,wilson95:wilson(h,n)};
  }
  return {version:state.version,generatedAt:new Date().toISOString(),latestPeriod:latest,baseline:BASELINE,
    note:'Prospective tracking only. Models were chosen after examining v6.3 holdout; only NEW draws after first v6.4 run are scored. Historical v6.3 holdout results are not independent confirmation.',
    completedRounds:state.completed.length,active:state.active,results};
}
function save(state,latest) {
  fs.writeFileSync(PATH,JSON.stringify(state,null,2)+'\n');
  fs.writeFileSync(REPORT,JSON.stringify(report(state,latest),null,2)+'\n');
  const lines=['round,anchor_period,end_period,hot100_pick,hot100_hit,hot100_hit_at,gap_short_pick,gap_short_hit,gap_short_hit_at'];
  for(const r of state.completed) lines.push([r.round,r.anchorPeriod,r.endPeriod,r.picks.HOT100,Number(r.results.HOT100.hit),r.results.HOT100.firstHitAt??'',r.picks.GAP_SHORT,Number(r.results.GAP_SHORT.hit),r.results.GAP_SHORT.firstHitAt??''].join(','));
  fs.writeFileSync(CSV,lines.join('\n')+'\n');
}
async function run() {
  const history=normalize(await loadDraws());
  const state=readState();
  const {processed,settled}=advance(state,history);
  save(state,history.at(-1).period);
  console.log('\n🧪 A+ v6.4｜前瞻驗證：一顆固定12期');
  console.log(`📚 有效歷史 ${history.length} 期，最新期號 ${history.at(-1).period}`);
  console.log(`🔁 新增 ${processed} 期，完成 ${settled} 輪；累積 ${state.completed.length} 輪`);
  console.log(`🔒 本輪錨定 ${state.active.anchorPeriod}，HOT100=${pad(state.active.picks.HOT100)}，GAP_SHORT=${pad(state.active.picks.GAP_SHORT)}；已追蹤 ${state.active.draws.length}/12 期`);
  const r=report(state,history.at(-1).period);
  for(const name of MODELS) {
    const x=r.results[name];
    console.log(`📊 ${name}: ${x.hits}/${x.rounds}；命中率 ${x.rate===null?'尚無':(x.rate*100).toFixed(2)+'%'}；95%區間 [${(x.wilson95.lower*100).toFixed(2)}%, ${(x.wilson95.upper*100).toFixed(2)}%]`);
  }
  console.log(`🎲 公平理論基準 ${(BASELINE*100).toFixed(2)}%；兩模型各自研究，非同時買兩顆`);
  console.log('⚠️ 不保證預測能力。需累積大量新資料，且不能依同批測試結果反覆調參。');
  console.log(`💾 ${PATH} / ${REPORT} / ${CSV}`);
}
if(require.main===module) run().catch(e=>{console.error('❌ '+e.message);process.exitCode=1;});
module.exports={normalize,choose,advance,emptyState,parsePage,report};
