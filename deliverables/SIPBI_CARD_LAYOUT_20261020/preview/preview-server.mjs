// Preview-only static frontend, with read-only API requests proxied to the unchanged API source.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'app','frontend','dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const u=new URL(req.url,'http://localhost');
  if(u.pathname.startsWith('/api/')){
    const upstream=http.request({hostname:'127.0.0.1',port:55150,path:req.url,method:req.method,headers:{accept:'application/json'}},r=>{res.writeHead(r.statusCode,{'content-type':r.headers['content-type']||'application/json','cache-control':'no-store'});r.pipe(res);});
    upstream.on('error',()=>{res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({code:'PREVIEW_UPSTREAM_UNAVAILABLE',message:'Original 5150 service unavailable'}));});
    upstream.end();return;
  }
  let name;
  try{name=decodeURIComponent(u.pathname);}catch{res.writeHead(400);res.end();return;}
  const p=path.resolve(root,'.'+name);
  if(!p.startsWith(root+path.sep)&&p!==root){res.writeHead(403);res.end();return;}
  const f=fs.existsSync(p)&&fs.statSync(p).isFile()?p:path.join(root,'index.html');
  if(!fs.existsSync(f)){res.writeHead(503);res.end('Preview build pending');return;}
  res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(f).pipe(res);
}).listen(55154,'0.0.0.0',()=>console.log('SIPBI Card Layout LAN server on port 55154 ; read-only API -> localhost:55150'));

