#!/usr/bin/env node
'use strict';
// Independent 3-star / 10-ticket research; does not change production outputs.
const fs=require('node:fs');
const args=process.argv.slice(2);
const file=args.find(x=>!x.startsWith('--'))||'history.csv';
const option=(name,def)=>{const x=args.find(a=>a.startsWith('--'+name+'='));const n=x?Number(x.split('=')[1]):def;if(!Number.isInteger(n)||n<100)throw Error(name+' 必須是 >=100 的整數');return n;};
const warmup=option('warmup',200),validation=option('validation',500),holdout=option('holdout',500);
function parse(txt){const rows=[];for(const [i,line] of txt.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).entries()){
 const p=line.split(',').map(x=>x.trim().replace(/^"|"$/g,''));if(i===0&&/^(period|期號|draw|issue)$/i.test(p[0]))continue;
 if(p.length!==21||!/^\d+$/.test(p[0]))throw Error('history.csv 第'+(i+1)+'行格式錯誤');
 const numbers=p.slice(1).map(Number);if(numbers.some(n=>!Number.isInteger(n)||n<1||n>80)||new Set(numbers).size!==20)throw Error('第'+(i+1)+'行開獎號碼錯誤');rows.push({period:p[0],numbers});}
 if(rows.length<warmup+validation+holdout)throw Error(`資料不足，需至少 ${warmup+validation+holdout} 期，現有 ${rows.length}`);
 if(BigInt(rows[0].period)>BigInt(rows.at(-1).period))rows.reverse();
 for(let i=1;i<rows.length;i++)if(BigInt(rows[i].period)<=BigInt(rows[i-1].period))throw Error('期號排序或重複錯誤');return rows;}
const draws=parse(fs.readFileSync(file,'utf8'));
const featureNames=['近50期熱度','50期熱度加速','50期直線連莊','50期斜線相鄰','50期密集區域','10對20期熱度變化','50期間隔2至5期'];
const factorWeights=[[3,2,1,1,1,1,1],[2,3,1,1,1,2,1],[2,1,3,1,1,1,2],[2,1,1,3,1,1,1],[2,1,1,1,3,1,1],[1,2,2,1,2,1,1],[2,2,1,2,1,1,1],[2,1,2,1,2,1,1],[1,2,1,2,2,2,1],[2,2,2,2,2,1,1]];
const fixedWeight=[1,1,1,1,1,1,1];
const count=(hist,n,a,b)=>{let s=0;for(let i=a;i<b;i++)if(hist[i].has(n))s++;return s;};
function featureScores(history){const h=history.map(d=>new Set(d.numbers)),L=h.length;const last=h.slice(-50),len=last.length;const features=featureNames.map(()=>Array(80).fill(0));
 for(let n=1;n<=80;n++){
  const c10=count(h,n,Math.max(0,L-10),L),c20=count(h,n,Math.max(0,L-20),L),c50=count(h,n,Math.max(0,L-50),L);
  features[0][n-1]=c50;features[1][n-1]=c10*4-count(h,n,Math.max(0,L-50),Math.max(0,L-10));
  let consec=0,diag=0,near=0,gap=0,gapPattern=0;
  for(let i=0;i<len;i++){
   const row=last[i];for(let m=Math.max(1,n-2);m<=Math.min(80,n+2);m++)if(row.has(m))near++;
   if(i>0){if(last[i-1].has(n)&&row.has(n))consec++;if((n>1&&last[i-1].has(n-1)&&row.has(n))||(n<80&&last[i-1].has(n+1)&&row.has(n)))diag+= (n>1&&last[i-1].has(n-1)&&row.has(n)?1:0)+(n<80&&last[i-1].has(n+1)&&row.has(n)?1:0);}
   if(row.has(n)){if(gap>=2&&gap<=5)gapPattern++;gap=0;}else gap++;
  }
  features[2][n-1]=consec;features[3][n-1]=diag;features[4][n-1]=near;features[5][n-1]=2*c10-c20;features[6][n-1]=gapPattern;
 }
 return features.map(a=>{const lo=Math.min(...a),hi=Math.max(...a);return a.map(x=>hi===lo?.5:(x-lo)/(hi-lo));});}
function makeTickets(features,method,seed){
 if(method==='RANDOM'){let s=(seed^0x9e3779b9)>>>0;const rnd=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};const tickets=[];const seen=new Set();while(tickets.length<10){const arr=Array.from({length:80},(_,i)=>i+1);for(let j=0;j<3;j++){const k=j+Math.floor(rnd()*(80-j));[arr[j],arr[k]]=[arr[k],arr[j]];}const t=arr.slice(0,3).sort((a,b)=>a-b),key=t.join(',');if(!seen.has(key)){seen.add(key);tickets.push(t);}}return tickets;}
 const generated=[];
 for(let g=0;g<10;g++){
  const w=method==='DIVERSE_UNIFORM'?fixedWeight:factorWeights[g];const scores=Array.from({length:80},(_,i)=>({n:i+1,score:w.reduce((s,v,j)=>s+v*features[j][i],0)}));
  const chosen=[];
  for(let slot=0;slot<3;slot++){
   const candidates=scores.filter(x=>!chosen.includes(x.n)).map(x=>{
    const shared=generated.reduce((s,t)=>s+t.includes(x.n),0);
    const nearby=chosen.filter(n=>Math.abs(n-x.n)<=2).length;
    let penalty=shared*(1+g*.11)+nearby*.35;
    if(method==='DIVERSE_STRONG')penalty=shared*5+nearby*.35;
    if(method==='DIVERSE_UNIFORM')penalty=shared*5+nearby*.35;
    return {...x,adjusted:x.score-penalty};
   }).sort((a,b)=>b.adjusted-a.adjusted||a.n-b.n);
   const next=slot===2?candidates.find(x=>!generated.some(t=>[...chosen,x.n].sort((a,b)=>a-b).join(',')===t.join(','))):candidates[0];
   chosen.push((next||candidates[0]).n);
  }
  generated.push(chosen.sort((a,b)=>a-b));
 }
 return generated;
}
const methods=['ORIGINAL_LIKE','DIVERSE_STRONG','DIVERSE_UNIFORM','RANDOM'];
// ORIGINAL_LIKE reproduces the original factor weights and overlap penalties, but does
// not reproduce its validation-derived reliability weights; it is an approximation.
// Selection uses ONLY validation period; holdout is evaluated once for chosen method.
const validationStart=draws.length-holdout-validation,holdoutStart=draws.length-holdout;
function evaluate(start,end){const stats=Object.fromEntries(methods.map(m=>[m,{rounds:0,fullRounds:0,fullTickets:0,totalHits:0,distribution:[0,0,0,0]}]));
 for(let i=start;i<end;i++){
  const features=featureScores(draws.slice(Math.max(0,i-100),i));const actual=new Set(draws[i].numbers);
  for(const method of methods){const tickets=makeTickets(features,method,i+104729);const hits=tickets.map(t=>t.filter(n=>actual.has(n)).length);const s=stats[method];s.rounds++;s.fullRounds+=Number(hits.some(n=>n===3));s.fullTickets+=hits.filter(n=>n===3).length;s.totalHits+=hits.reduce((a,b)=>a+b,0);for(const n of hits)s.distribution[n]++;}
 }
 return stats;}
const train=evaluate(validationStart,holdoutStart);
const candidates=['ORIGINAL_LIKE','DIVERSE_STRONG','DIVERSE_UNIFORM'];
const winner=[...candidates].sort((a,b)=>train[b].fullRounds-train[a].fullRounds||candidates.indexOf(a)-candidates.indexOf(b))[0];
const test=evaluate(holdoutStart,draws.length);
const pct=(x,n)=>(100*x/n).toFixed(2)+'%';
const choose=(n,k)=>{let v=1;for(let i=1;i<=k;i++)v=v*(n-i+1)/i;return v;};
const single=choose(20,3)/choose(80,3);
const csv=[['method','selected_on_validation','validation_rounds','validation_full_rounds','validation_full_round_pct','holdout_rounds','holdout_full_rounds','holdout_full_round_pct','holdout_full_tickets','holdout_avg_hits_per_ticket','holdout_hits0','holdout_hits1','holdout_hits2','holdout_hits3']];
console.log('=== 3星 A+ v2｜每期10組，下一期至少一組3顆全中 ===');
console.log('歷史資料 '+draws.length+' 期，訓練/驗證 '+validation+' 期，獨立保留 '+holdout+' 期；每期僅使用過去資料。');
console.log('單組3星全中理論機率 '+pct(single,1)+'；10組機率取決於重疊程度，不可簡單乘以10。');
console.log('注意：ORIGINAL_LIKE 是原版權重近似，不含原版驗證區 reliability 權重；非完全相同的舊版重播。');
console.log('驗證區選出 '+winner+'；以下其他方法的保留區數據僅作診斷，不可事後換冠軍。');
for(const m of methods){const a=train[m],b=test[m];console.log(`${m}: 驗證 ${a.fullRounds}/${a.rounds} (${pct(a.fullRounds,a.rounds)})；保留 ${b.fullRounds}/${b.rounds} (${pct(b.fullRounds,b.rounds)})；3星全中票數 ${b.fullTickets}；每張平均命中 ${(b.totalHits/(b.rounds*10)).toFixed(3)}`);
 csv.push([m,m===winner?'YES':'NO',a.rounds,a.fullRounds,pct(a.fullRounds,a.rounds),b.rounds,b.fullRounds,pct(b.fullRounds,b.rounds),b.fullTickets,(b.totalHits/(b.rounds*10)).toFixed(5),...b.distribution]);}
const latest=featureScores(draws.slice(-100));const research=makeTickets(latest,winner,draws.length+104729);
console.log('獨立保留區預先選定策略 '+winner+'：'+test[winner].fullRounds+'/'+holdout+'，'+pct(test[winner].fullRounds,holdout));
console.log('下一期研究用10組（尚未證明優於隨機）：');research.forEach((t,i)=>console.log(`${String(i+1).padStart(2,'0')}. ${t.map(n=>String(n).padStart(2,'0')).join(' ')}`));
const writeCsv=(f,rows)=>fs.writeFileSync(f,rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n')+'\n');
writeCsv('star3_v2_comparison.csv',csv);
writeCsv('star3_v2_research_groups.csv',[['group','numbers','latest_period','method'],...research.map((t,i)=>[i+1,t.map(n=>String(n).padStart(2,'0')).join(' '),draws.at(-1).period,winner])]);
console.log('已產出 star3_v2_comparison.csv、star3_v2_research_groups.csv；不修改正式 star345_groups.csv。');
