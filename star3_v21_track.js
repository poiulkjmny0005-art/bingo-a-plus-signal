#!/usr/bin/env node
'use strict';
// v2.1: forward-only comparison of the TWO fixed v2 algorithms.
// No production star345_* files are read or modified.
const fs=require('node:fs');
const historyFile=process.argv[2]||'history.csv';
const stateFile='star3_v21_forward_tracking.json';
const reportFile='star3_v21_forward_report.csv';
const summaryFile='star3_v21_summary.csv';
const methods=['DIVERSE_STRONG','DIVERSE_UNIFORM'];
function parse(txt){
 const rows=[];
 for(const [i,line] of txt.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).entries()){
  const p=line.split(',').map(x=>x.trim().replace(/^"|"$/g,''));
  if(i===0&&/^(period|期號|draw|issue)$/i.test(p[0]))continue;
  if(p.length!==21||!/^\d+$/.test(p[0]))throw Error('history.csv 第'+(i+1)+'行格式錯誤');
  const numbers=p.slice(1).map(Number);
  if(numbers.some(n=>!Number.isInteger(n)||n<1||n>80)||new Set(numbers).size!==20)throw Error('第'+(i+1)+'行開獎號碼錯誤');
  rows.push({period:p[0],numbers});
 }
 if(rows.length<100)throw Error('歷史資料不足100期');
 if(BigInt(rows[0].period)>BigInt(rows.at(-1).period))rows.reverse();
 for(let i=1;i<rows.length;i++)if(BigInt(rows[i].period)<=BigInt(rows[i-1].period))throw Error('期號排序或重複錯誤');
 return rows;
}
// The following feature extraction and ticket generator are copied from
// star3_v2_research.js. The two methods remain frozen for forward comparison.
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
function csv(file,rows){fs.writeFileSync(file,rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n')+'\n');}
const draws=parse(fs.readFileSync(historyFile,'utf8'));
const newest=draws.at(-1).period;
let state={version:1,strategies:methods,predictions:[]};
if(fs.existsSync(stateFile)){
 state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 if(state.version!==1||!Array.isArray(state.predictions)||JSON.stringify(state.strategies)!==JSON.stringify(methods))throw Error('追蹤狀態版本或策略不相容');
}
for(const batch of state.predictions){
 if(batch.status!=='pending')continue;
 const at=draws.findIndex(d=>d.period===batch.base);
 if(at<0){
  if(BigInt(newest)>BigInt(batch.base)){batch.status='unverified';batch.note='基準期號已不在歷史資料中';}
  continue;
 }
 if(at+1>=draws.length)continue;
 const next=draws[at+1];
 if(BigInt(next.period)!==BigInt(batch.base)+1n){batch.status='unverified';batch.note='期號不連續，不能確定下一期';continue;}
 const actual=new Set(next.numbers);
 for(const method of methods){
  const tickets=batch.tickets[method];
  if(!Array.isArray(tickets)||tickets.length!==10)throw Error('追蹤資料損毀：'+method);
  batch.hits[method]=tickets.map(t=>t.filter(n=>actual.has(n)).length);
 }
 batch.resultPeriod=next.period;batch.status='settled';
 console.log('已核對 '+batch.base+' → '+next.period+'，每個策略10組');
}
if(!state.predictions.some(b=>b.base===newest)){
 const features=featureScores(draws.slice(-100));
 const tickets=Object.fromEntries(methods.map(m=>[m,makeTickets(features,m,draws.length+104729)]));
 for(const method of methods){
  if(tickets[method].length!==10||new Set(tickets[method].map(t=>t.join(','))).size!==10)throw Error(method+' 沒有10組不同的組合');
 }
 state.predictions.push({base:newest,status:'pending',tickets,hits:{}});
 console.log('建立新的下一期研究預測，基準期號 '+newest+'；兩策略各10組');
 for(const method of methods){
  console.log('【'+method+'】');tickets[method].forEach((t,i)=>console.log(String(i+1).padStart(2,'0')+'. '+t.map(n=>String(n).padStart(2,'0')).join(' ')));
 }
}else console.log('基準期號 '+newest+' 已建立預測，不重複建立');
const settled=state.predictions.filter(b=>b.status==='settled');
const pending=state.predictions.filter(b=>b.status==='pending');
const unverified=state.predictions.filter(b=>b.status==='unverified');
const details=[['base_period','result_period','method','group','numbers','hits','full_3of3']];
const summary=[['method','settled_rounds','rounds_with_any_3of3','round_success_pct','full_tickets','avg_hits_per_ticket','hits_0','hits_1','hits_2','hits_3']];
for(const method of methods){
 let fullRounds=0,fullTickets=0,totalHits=0;const distribution=[0,0,0,0];
 for(const b of settled){
  const hits=b.hits[method];
  if(!Array.isArray(hits)||hits.length!==10)throw Error('已核對資料缺少 '+method);
  if(hits.some(h=>h===3))fullRounds++;
  for(let i=0;i<10;i++){
   const h=hits[i];distribution[h]++;totalHits+=h;if(h===3)fullTickets++;
   details.push([b.base,b.resultPeriod,method,i+1,b.tickets[method][i].map(n=>String(n).padStart(2,'0')).join(' '),h,h===3?1:0]);
  }
 }
 const rounds=settled.length,rate=rounds?(100*fullRounds/rounds).toFixed(2)+'%':'尚無';
 const avg=rounds?(totalHits/(rounds*10)).toFixed(3):'尚無';
 summary.push([method,rounds,fullRounds,rate,fullTickets,avg,...distribution]);
 console.log(method+'：已核對 '+rounds+' 期；至少1組3星全中 '+fullRounds+' 期（'+rate+'）；全中票 '+fullTickets+'；每票平均中 '+avg);
}
csv(reportFile,details);csv(summaryFile,summary);
fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n');
console.log('批次狀態：已核對 '+settled.length+'、等待 '+pending.length+'、無法確認 '+unverified.length);
console.log('輸出 '+stateFile+'、'+reportFile+'、'+summaryFile);
console.log('僅記錄建立預測後的下一期；不回填過往預測、不更動正式30組；公平開獎不保證策略優勢。');
