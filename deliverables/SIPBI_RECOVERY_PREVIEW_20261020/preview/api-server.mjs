import {startSalesServer} from './app/scripts/sales-server.mjs';
startSalesServer({host:'127.0.0.1',port:55150}).then(s=>console.log('Preview API localhost:'+s.address().port)).catch(e=>{console.error(e.code,e.message);process.exitCode=1;});
