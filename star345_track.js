#!/usr/bin/env node
'use strict';
// Forward-only 30-ticket tracking. A ticket is scored only if the NEXT observed draw
// is verified as the immediately following period in the ordered downloaded history.
const fs=require('node:fs');
const historyFile=process.argv[2]||'history.csv';
const groupsFile=process.argv[3]||'star345_groups.csv';
const stateFile='star345_forward_tracking.json';
const reportFile='star345_forward_report.csv';
function csvCell(v){return '"'+String(v??'').replace(/"/g,'""')+'"';}
function csvWrite(file,rows){fs.writeFileSync(file,rows.map(r=>r.map(csvCell).join(',')).join('\n')+'\n');}
function historyParse(t){const rows=[];for(const [i,line] of t.trim().split(/\r?\n/).entries()){
  const p=line.replace(/"/g,'').split(',').map(s=>s.trim());if(i===0&&p[0]==='period')continue;
  if(p.length!==21||!/^\d+$/.test(p[0]))throw Error('history.csv 格式錯誤，行 '+(i+1));
  const nums=p.slice(1).map(Number);if(nums.length!==20||nums.some(n=>!Number.isInteger(n)||n<1||n>80)||new Set(nums).size!==20)throw Error('號碼無效，行 '+(i+1));
  rows.push({period:p[0],numbers:nums});}
  if(rows.length<2)throw Error('history.csv 資料不足');
  if(BigInt(rows[0].period)>BigInt(rows.at(-1).period))rows.reverse();
  for(let i=1;i<rows.length;i++)if(BigInt(rows[i].period)<=BigInt(rows[i-1].period))throw Error('歷史期號排序錯誤');
  return rows;
}
function groupsParse(t){const rows=t.trim().split(/\r?\n/);const header=rows.shift().replace(/"/g,'').split(',');
 const index=n=>header.indexOf(n);for(const n of ['star','group','numbers','latest_period'])if(index(n)<0)throw Error('groups 缺少 '+n);
 return rows.map(line=>{const p=[...line.matchAll(/"((?:[^"]|"")*)"|([^,]+)/g)].map(m=>(m[1]??m[2]).replace(/""/g,'').trim());
  const star=Number(p[index('star')]),group=Number(p[index('group')]);
  const numbers=p[index('numbers')].split(/\s+/).map(Number),base=p[index('latest_period')];
  if(![3,4,5].includes(star)||!Number.isInteger(group)||group<1||group>10||numbers.length!==star||new Set(numbers).size!==star||numbers.some(n=>!Number.isInteger(n)||n<1||n>80)||!/^\d+$/.test(base))throw Error('groups CSV 不正確');
  return {star,group,numbers,focus:p[index('focus')]||'',base};
 });
}
const history=historyParse(fs.readFileSync(historyFile,'utf8'));
const groups=groupsParse(fs.readFileSync(groupsFile,'utf8'));
if(groups.length!==30||[3,4,5].some(k=>groups.filter(g=>g.star===k).length!==10||new Set(groups.filter(g=>g.star===k).map(g=>g.group)).size!==10))throw Error('必須正好 30 組，每個星數 10 組');
const newest=history.at(-1).period;
if(groups.some(g=>g.base!==newest))throw Error('選號基準期號與歷史最新期號不符');
let state={version:1,predictions:[]};
if(fs.existsSync(stateFile)){
 state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 if(state.version!==1||!Array.isArray(state.predictions))throw Error('追蹤檔格式不相容');
}
// Never retroactively manufacture predictions for earlier periods.
// A pending batch is evaluated only if the immediate successor is present in a
// continuous sequence; missing historical draws make it unscorable.
for(const batch of state.predictions){
 if(batch.status!=='pending')continue;
 const at=history.findIndex(d=>d.period===batch.base);
 if(at<0){if(BigInt(newest)>BigInt(batch.base)){batch.status='unverified';batch.note='基準期號已不在下載資料中';}continue;}
 if(at+1>=history.length)continue;
 const next=history[at+1];
 // Bingo period IDs normally increment by one within continuous draw sequences;
 // at a date boundary the ID can jump. Treat a jump as unverified, not a hit.
 if(BigInt(next.period)!==BigInt(batch.base)+1n){batch.status='unverified';batch.note='期號不連續，無法確認下一期';continue;}
 const actual=new Set(next.numbers);batch.status='settled';batch.resultPeriod=next.period;
 batch.tickets.forEach(ticket=>{ticket.hits=ticket.numbers.filter(n=>actual.has(n)).length;});
 console.log(`已核對基準 ${batch.base} → 開獎 ${next.period}：30組`);
}
if(!state.predictions.some(b=>b.base===newest)){
 state.predictions.push({base:newest,status:'pending',tickets:groups.map(g=>({star:g.star,group:g.group,numbers:g.numbers,focus:g.focus}))});
 console.log(`已建立新預測批次：基準 ${newest}，3/4/5星各10組；等待下一期`);
}else console.log(`基準 ${newest} 已有預測批次，不重複新增`);
// Keep all settled and unverified records for auditable statistics.
const settled=state.predictions.filter(b=>b.status==='settled');
const unverified=state.predictions.filter(b=>b.status==='unverified');
const pending=state.predictions.filter(b=>b.status==='pending');
const rows=[['base_period','result_period','star','group','numbers','hits','focus']];
for(const b of settled)for(const t of b.tickets)rows.push([b.base,b.resultPeriod,t.star,t.group,t.numbers.map(n=>String(n).padStart(2,'0')).join(' '),t.hits,t.focus]);
csvWrite(reportFile,rows);
console.log(`批次狀態：已核對 ${settled.length}、等待 ${pending.length}、無法確認 ${unverified.length}`);
for(const k of [3,4,5]){
 const tickets=settled.flatMap(b=>b.tickets.filter(t=>t.star===k));
 const dist=Array(k+1).fill(0);for(const t of tickets)dist[t.hits]++;
 const total=tickets.reduce((s,t)=>s+t.hits,0);
 console.log(`${k}星：已核對 ${tickets.length} 組次，平均命中 ${tickets.length?(total/tickets.length).toFixed(3):'尚無'}；命中分布 ${dist.map((n,i)=>`${i}中:${n}`).join(' | ')}`);
}
fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n');
console.log('追蹤狀態：'+stateFile+'；明細：'+reportFile);
console.log('提醒：30組彼此可能重疊；命中次數不代表獲利，尚未計算官方獎金。');
