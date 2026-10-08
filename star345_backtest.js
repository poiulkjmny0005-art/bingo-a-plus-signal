#!/usr/bin/env node
'use strict';
// 3/4/5-star historical repeat analysis. Historical analysis, not a guarantee of returns.
// node star345_backtest.js history.csv --warmup=200 --validation=500 --holdout=500
const fs = require('node:fs');
const args = process.argv.slice(2);
const filename = args.find(a=>!a.startsWith('--'));
if(!filename) throw Error('用法: node star345_backtest.js history.csv [--warmup=200] [--validation=500] [--holdout=500]');
function option(name,def){const s=args.find(a=>a.startsWith(`--${name}=`));const v=s?Number(s.split('=')[1]):def;if(!Number.isInteger(v)||v<30)throw Error(`${name} 必須 >= 30`);return v;}
const warmup=option('warmup',200), validation=option('validation',500), holdout=option('holdout',500);
function parseCsv(txt){
  const lines=txt.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),rows=[];
  for(let i=0;i<lines.length;i++){
    const p=lines[i].split(',').map(s=>s.trim().replace(/^"|"$/g,''));
    if(i===0&&/^(period|期號|draw|issue)$/i.test(p[0]))continue;
    if(p.length!==21||!/^\d+$/.test(p[0]))throw Error(`CSV 第 ${i+1} 行期號/欄位錯誤`);
    const ns=p.slice(1).map(Number);
    if(ns.some(n=>!Number.isInteger(n)||n<1||n>80)||new Set(ns).size!==20)throw Error(`CSV 第 ${i+1} 行不是20顆有效號碼`);
    rows.push({period:p[0],numbers:ns});
  }
  if(rows.length < warmup+validation+holdout+1)throw Error(`至少需要 ${warmup+validation+holdout+1} 期，現有 ${rows.length} 期`);
  if(BigInt(rows[0].period)>BigInt(rows[rows.length-1].period))rows.reverse();
  for(let i=1;i<rows.length;i++)if(BigInt(rows[i].period)<=BigInt(rows[i-1].period))throw Error('期號重複或時間順序錯誤');
  return rows;
}
const draws=parseCsv(fs.readFileSync(filename,'utf8'));
const models={
  '近10期熱度':(n,h)=>h.slice(-10).filter(d=>d.numbers.includes(n)).length,
  '近30期熱度':(n,h)=>h.slice(-30).filter(d=>d.numbers.includes(n)).length,
  '近期加權熱度':(n,h)=>h.slice(-40).reduce((s,d,i,a)=>s+(d.numbers.includes(n)?(i+1)/a.length:0),0),
  '近期冷號':(n,h)=>-h.slice(-30).filter(d=>d.numbers.includes(n)).length,
  '歷史連莊率(平滑)':(n,h)=>{let exposure=0,repeats=0;for(let i=1;i<h.length;i++)if(h[i-1].numbers.includes(n)){exposure++;if(h[i].numbers.includes(n))repeats++;}return(repeats+5)/(exposure+20);},
  '固定號碼排序(對照)':n=>-n
};
const names=Object.keys(models),stars=[3,4,5];
const firstValidation=draws.length-holdout-validation, firstHoldout=draws.length-holdout;
function rank(name,h){const last=h[h.length-1].numbers;return last.map(n=>({n,s:models[name](n,h)})).sort((a,b)=>b.s-a.s||a.n-b.n).map(x=>x.n);}
function calcRange(start,end){
 const out=Object.fromEntries(names.map(name=>[name,Object.fromEntries(stars.map(k=>[k,{counts:Array(k+1).fill(0),total:0}]))]));
 for(let i=start;i<end;i++){
   const history=draws.slice(0,i),actual=new Set(draws[i].numbers);
   for(const name of names){const r=rank(name,history);for(const k of stars){const hits=r.slice(0,k).filter(n=>actual.has(n)).length;out[name][k].counts[hits]++;out[name][k].total+=hits;}}
 }
 return out;
}
function choose(n,k){if(k<0||k>n)return 0;let v=1;for(let j=1;j<=k;j++)v=v*(n-j+1)/j;return v;}
function theoretical(k,j){return choose(20,j)*choose(60,k-j)/choose(80,k);}
function percent(x){return (100*x).toFixed(2)+'%';}
function distribution(counts){return counts.map((c,i)=>`${i}中:${c}`).join(' | ');}
function selected(validationResults,k){return [...names].sort((a,b)=>validationResults[b][k].total-validationResults[a][k].total||names.indexOf(a)-names.indexOf(b))[0];}
const validationResults=calcRange(firstValidation,firstHoldout);
const winners=Object.fromEntries(stars.map(k=>[k,selected(validationResults,k)]));
const holdoutResults=calcRange(firstHoldout,draws.length);
const records=[['star','model_selected_on_validation','validation_periods','validation_avg_hits','holdout_periods','holdout_avg_hits','holdout_any_pct','theoretical_any_pct',...Array.from({length:6},(_,i)=>`hits_${i}`)]];
console.log('=== 賓果連莊 A+：3星／4星／5星（20顆中挑號，下期驗證）===');
console.log(`完整歷史 ${draws.length} 期；最早 ${draws[0].period}；最新 ${draws.at(-1).period}`);
console.log(`暖身至少 ${warmup} 期；策略挑選區 ${validation} 期（${draws[firstValidation].period}～${draws[firstHoldout-1].period}）；獨立保留測試 ${holdout} 期（${draws[firstHoldout].period}～${draws.at(-1).period}）`);
console.log('每次預測只使用該期以前的資料；策略依驗證區選出後才在保留區評估。');
for(const k of stars){
 const name=winners[k],v=validationResults[name][k],r=holdoutResults[name][k];
 const any=r.counts.slice(1).reduce((a,b)=>a+b,0),baseline=1-theoretical(k,0);
 console.log(`\n--- ${k} 星 ---`);
 console.log(`驗證區選出的策略：${name}；驗證區平均命中 ${(v.total/validation).toFixed(3)} 顆`);
 console.log(`保留區：至少中1顆 ${any}/${holdout} (${percent(any/holdout)})；平均命中 ${(r.total/holdout).toFixed(3)} 顆；隨機理論至少中1顆 ${percent(baseline)}；隨機平均 ${(k/4).toFixed(3)} 顆`);
 console.log(`保留區命中分布：${distribution(r.counts)}`);
 console.log(`隨機理論分布：${Array.from({length:k+1},(_,j)=>`${j}中:${percent(theoretical(k,j))}`).join(' | ')}`);
 console.log('保留區其他策略：'+names.map(n=>`${n}=${(holdoutResults[n][k].total/holdout).toFixed(3)}顆/期`).join('；'));
 const picks=rank(name,draws).slice(0,k).sort((a,b)=>a-b).map(n=>String(n).padStart(2,'0'));
 console.log(`下一期研究候選：${picks.join('、')}（根據最新已取得期號 ${draws.at(-1).period}；資料若已過時，候選也已過時）`);
 records.push([k,name,validation,(v.total/validation).toFixed(5),holdout,(r.total/holdout).toFixed(5),percent(any/holdout),percent(baseline),...Array.from({length:6},(_,j)=>r.counts[j]??'')]);
}
fs.writeFileSync('star345_summary.csv',records.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')+'\n');
console.log('\n已輸出 star345_summary.csv。此版未計算獎金/報酬率，須先核對官方星數賠付表與投注金額。');
console.log('提醒：公平獨立開獎下，歷史連莊、熱門或冷號不會改變每顆號碼下一期25%的機率。');
