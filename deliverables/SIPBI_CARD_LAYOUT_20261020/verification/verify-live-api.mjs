import fs from 'node:fs';
const base='http://127.0.0.1:55154';
const ids=['D00','D01','D02','D04','D06','D08','D11','D13','D14','D15','D16','D18'];
const rows=[];let reference;
for(const id of ids){const res=await fetch(`${base}/api/dashboards/${id}?month=202609`);const d=await res.json();if(!res.ok||d.status!=='ok')throw Error(id+' failed');reference??=d;for(const k of ['netSalesUSD','grossProfitUSD','orderCount'])if(d.kpis[k]!==reference.kpis[k])throw Error(id+' '+k+' differs');rows.push({id,status:d.status,queryHash:d.evidence.queryHash,kpis:d.kpis,counts:Object.fromEntries(Object.entries(d.datasets).map(([k,v])=>[k,v.length]))});}
const cases=[];
for(const [name,query]of[['company','month=202609&company=00020'],['early','month=202401'],['future','month=202610'],['all','month=All'],['invalid','month=202609&product=INVALID_TEST_MEMBER']]){const res=await fetch(`${base}/api/dashboards/D04?${query}`);const d=await res.json();cases.push({name,http:res.status,status:d.status,filters:d.filters,kpis:d.kpis,analysis:d.analysis,error:d.error});if(name==='company'&&d.kpis.netSalesUSD!==reference.datasets.companies.find(c=>c.key==='00020').netSalesUSD)throw Error('company mismatch');if(name==='early'&&d.analysis.yoyGrowth!==null)throw Error('invented early YoY');if(name==='future'&&d.status!=='no_data')throw Error('future should be no_data');if(name==='invalid'&&res.status!==400)throw Error('invalid member accepted');}
fs.writeFileSync(new URL('live-data-final.json',import.meta.url),JSON.stringify(reference));
fs.writeFileSync(new URL('api-validation.json',import.meta.url),JSON.stringify({testedAt:new Date().toISOString(),rows,cases},null,2));
console.log(JSON.stringify({pages:rows.length,netSalesUSD:reference.kpis.netSalesUSD,grossProfitUSD:reference.kpis.grossProfitUSD,orderCount:reference.kpis.orderCount,cases:cases.map(c=>({name:c.name,http:c.http,status:c.status}))}));
