#!/usr/bin/env node
'use strict';
// 3/4/5-star analysis selecting freely from 01..80, not limited to the prior draw.
// Historical analysis, not a guarantee of returns.
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
// All strategies score each of the 80 numbers using ONLY the past at each prediction time.
// A 25% per-number draw probability is the theoretical baseline for an independent fair draw.
// 50-period visual chart features, computed from past 20-number draws (NOT Super Number).
// Every scoring function receives only the draws available BEFORE the evaluated draw.
const frequency=(n,h,count)=>h.slice(-count).filter(d=>d.numbers.includes(n)).length;
const last50=h=>h.slice(-50);
const has=(d,n)=>n>=1&&n<=80&&d.numbers.includes(n);
const recentConsecutive=(n,h)=>{
  const w=last50(h);let v=0;
  for(let i=1;i<w.length;i++)if(has(w[i-1],n)&&has(w[i],n))v++;
  return v;
};
const diagonal=(n,h)=>{
  const w=last50(h);let v=0;
  for(let i=1;i<w.length;i++){
    if(has(w[i-1],n-1)&&has(w[i],n))v++;
    if(has(w[i-1],n+1)&&has(w[i],n))v++;
  }
  return v;
};
const neighborhood=(n,h)=>{
  const w=last50(h);let v=0;
  for(const d of w)for(let m=Math.max(1,n-2);m<=Math.min(80,n+2);m++)if(has(d,m))v++;
  return v;
};
const gapPattern=(n,h)=>{
  const w=last50(h);let gap=0,score=0;
  for(const d of w){
    if(has(d,n)){if(gap>=2&&gap<=5)score++;gap=0;}
    else gap++;
  }
  return score;
};
const models={
  '近10期熱度':(n,h)=>frequency(n,h,10),
  '10對20期熱度變化':(n,h)=>2*frequency(n,h,10)-frequency(n,h,20),
  '近30期熱度':(n,h)=>frequency(n,h,30),
  '近50期熱度':(n,h)=>frequency(n,h,50),
  '近100期熱度':(n,h)=>frequency(n,h,100),
  '近期加權熱度':(n,h)=>h.slice(-40).reduce((sum,d,i,a)=>sum+(has(d,n)?(i+1)/a.length:0),0),
  '近期冷號':(n,h)=>-frequency(n,h,30),
  '歷史總熱度(平滑)':(n,h)=>(frequency(n,h,h.length)+5)/(h.length+20),
  '50期直線連莊':(n,h)=>recentConsecutive(n,h),
  '50期斜線相鄰':(n,h)=>diagonal(n,h),
  '50期密集區域':(n,h)=>neighborhood(n,h),
  '50期間隔2至5期':(n,h)=>gapPattern(n,h),
  '50期熱度加速':(n,h)=>frequency(n,h,10)*4-frequency(n,h.slice(0,-10),40),
  '固定號碼排序(對照)':n=>-n
};
const names=Object.keys(models),stars=[3,4,5];
const firstValidation=draws.length-holdout-validation, firstHoldout=draws.length-holdout;
function rank(name,h){return Array.from({length:80},(_,i)=>i+1).map(n=>({n,s:models[name](n,h)})).sort((a,b)=>b.s-a.s||a.n-b.n).map(x=>x.n);}
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
console.log('=== 賓果 A+：50期圖形走勢／3星／4星／5星（01～80全號碼）===');
console.log(`完整歷史 ${draws.length} 期；最早 ${draws[0].period}；最新 ${draws.at(-1).period}`);
console.log(`暖身至少 ${warmup} 期；策略挑選區 ${validation} 期（${draws[firstValidation].period}～${draws[firstHoldout-1].period}）；獨立保留測試 ${holdout} 期（${draws[firstHoldout].period}～${draws.at(-1).period}）`);
console.log('選號範圍：01～80，不限上一期開出號碼；新增50期直線、斜線、密集、間隔、熱度加速等策略。每次預測只使用該期以前的資料；策略依驗證區選出後才在保留區評估。');
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

// Generate ten different combinations per star size. Model weights come only from
// validation, not from the untouched holdout; no forward predictive edge is assumed.
const scoreNames=['近50期熱度','50期熱度加速','50期直線連莊','50期斜線相鄰','50期密集區域','10對20期熱度變化','50期間隔2至5期'];
const factorWeights=[
 [3,2,1,1,1,1,1], [2,3,1,1,1,2,1], [2,1,3,1,1,1,2],
 [2,1,1,3,1,1,1], [2,1,1,1,3,1,1], [1,2,2,1,2,1,1],
 [2,2,1,2,1,1,1], [2,1,2,1,2,1,1], [1,2,1,2,2,2,1],
 [2,2,2,2,2,1,1]
];
const validationMeans=Object.fromEntries(scoreNames.map(name=>[name,Object.fromEntries(stars.map(k=>[k,validationResults[name][k].total/validation]))]));
const latest=draws;
const raw=Object.fromEntries(scoreNames.map(name=>[name,Array.from({length:80},(_,i)=>models[name](i+1,latest))]));
const normalized=Object.fromEntries(scoreNames.map(name=>{
 const v=raw[name], min=Math.min(...v), max=Math.max(...v);
 return [name,v.map(x=>max===min?0.5:(x-min)/(max-min))];
}));
const csvGroups=[['star','group','numbers','focus','validation_reference','latest_period']];
function comboGroups(k){
 const generated=[];
 for(let g=0;g<10;g++){
   const weights=factorWeights[g];
   const candidates=Array.from({length:80},(_,i)=>{
     const n=i+1;
     let score=0;
     for(let j=0;j<scoreNames.length;j++){
       const name=scoreNames[j];
       // Bounded validation performance adjustment: no holdout peeking.
       const relative=validationMeans[name][k]/(k/4);
       const reliability=Math.max(0.7,Math.min(1.3,relative));
       score+=weights[j]*reliability*normalized[name][i];
     }
     // Change tie ordering between groups, without using future data.
     return {n,score};
   });
   const chosen=[];
   for(let slot=0;slot<k;slot++){
     const sorted=candidates.filter(x=>!chosen.includes(x.n)).map(x=>{
       const overlap=generated.reduce((sum,prior)=>sum+prior.includes(x.n),0);
       const nearby=chosen.filter(n=>Math.abs(n-x.n)<=2).length;
       return {...x,adjusted:x.score-overlap*(1.0+g*.11)-nearby*.35};
     }).sort((a,b)=>b.adjusted-a.adjusted||a.n-b.n);
     let pick=sorted[0].n;
     // Avoid reproducing an identical complete ticket.
     if(slot===k-1){
       const alternate=sorted.find(x=>!generated.some(prior=>[...chosen,x.n].sort((a,b)=>a-b).join(',')===prior.join(',')));
       if(alternate)pick=alternate.n;
     }
     chosen.push(pick);
   }
   chosen.sort((a,b)=>a-b);
   generated.push(chosen);
   const focus=scoreNames[weights.indexOf(Math.max(...weights))];
   const formatted=chosen.map(n=>String(n).padStart(2,'0')).join('、');
   console.log(`第${String(g+1).padStart(2,'0')}組：${formatted}｜側重 ${focus}`);
   csvGroups.push([k,g+1,chosen.map(n=>String(n).padStart(2,'0')).join(' '),focus,'策略權重只參考驗證區',draws.at(-1).period]);
 }
}
console.log('\n=== 50期走勢綜合評分：每種星數10組（共30組）===');
console.log('綜合：50期熱度、10/20期熱度變化、直線連莊、斜線相鄰、密集區域、間隔；使用驗證區策略成績調整權重。');
console.log('每組都是不同的號碼組合，並施加重複號碼懲罰；10組並非獨立，也不代表更高期望報酬。');
for(const k of stars){console.log(`\n--- ${k} 星：10組 ---`);comboGroups(k);}
fs.writeFileSync('star345_groups.csv',csvGroups.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')+'\n');
console.log('\n已輸出 star345_groups.csv（如需下載此檔，需將它加入工作流程的 artifact path）。');

console.log('\n已輸出 star345_summary.csv。此版未計算獎金/報酬率，須先核對官方星數賠付表與投注金額。');
console.log('提醒：公平獨立開獎下，歷史熱門或冷號不會改變每顆號碼下一期25%的機率。');
