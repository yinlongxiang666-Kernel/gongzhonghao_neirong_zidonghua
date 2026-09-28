const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const native = require('./native-backend.cjs');
const wechat = require('./wechat-sync.cjs');

const ROOT = __dirname;
const MEDIA_ROOT = path.join(ROOT, 'generated');
const PORT = Number(process.env.PORT || 4173);
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function readJson(req){
  let body='';
  for await(const chunk of req){body+=chunk;if(body.length>100000)throw new Error('请求内容过长');}
  try{return JSON.parse(body||'{}');}catch{throw new Error('请求不是有效 JSON');}
}
function serveStatic(req,res){
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  const file=path.resolve(ROOT,'.'+pathname);
  if(file!==ROOT&&!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
  const relative=path.relative(ROOT,file);
  const allowed=relative==='index.html'||relative==='app.js'||relative==='styles.css'||relative.startsWith('generated'+path.sep)||/^article-(cover|inline-1|inline-2)\.png$/.test(relative);
  if(!allowed){res.writeHead(404).end();return;}
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
  });
}
function createServer(options={}){
  return http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(req.method==='GET'&&pathname==='/'){req.url='/index.html';serveStatic(req,res);return;}
    if(req.method==='GET'&&pathname==='/api/status'){send(res,200,options.status||native.nativeStatus());return;}
    if(req.method==='GET'&&pathname==='/api/wechat/status'){
      send(res,200,await wechat.status(options.wechat||{}));
      return;
    }
    if(req.method==='POST'&&pathname==='/api/wechat/configure'){
      try{
        if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw new Error('只允许从本地创作页面绑定公众号。');
        send(res,200,await wechat.configure(await readJson(req),options.wechat||{}));
      }catch(error){send(res,400,{error:error.message});}
      return;
    }
    if(req.method==='POST'&&pathname==='/api/wechat/sync'){
      try{
        if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw new Error('只允许从本地创作页面发起同步。');
        const article=await readJson(req);
        send(res,200,await wechat.syncArticle(article,options.wechat||{}));
      }catch(error){send(res,error.errcode?502:400,{error:error.message});}
      return;
    }
    if(req.method==='POST'&&pathname==='/api/generate'){
      const started=Date.now();
      if(req.headers['x-progress']==='stream'){
        try{
          const input=await readJson(req);
          res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
          res.flushHeaders();
          const progress=event=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');};
          const article=await native.createArticle(input,{...options,onProgress:progress});
          progress({stage:'done',article});
        }catch(error){
          console.error('Generation failed after '+Math.round((Date.now()-started)/1000)+'s:',error.message);
          if(!res.headersSent)res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});
          if(!res.destroyed)res.write(JSON.stringify({stage:'error',error:error.message})+'\n');
        }
        res.end();
      }else{
        try{send(res,200,await native.createArticle(await readJson(req),options));}
        catch(error){console.error('Generation failed:',error.message);send(res,400,{error:error.message});}
      }
      return;
    }
    if(req.method==='POST'&&pathname==='/api/regenerate-image'){
      try{send(res,200,{image:await native.regenerateImage(await readJson(req),options)});}
      catch(error){send(res,400,{error:error.message});}
      return;
    }
    if(req.method==='DELETE'&&pathname.startsWith('/api/articles/')){
      const id=pathname.slice('/api/articles/'.length);
      if(!/^[0-9a-f-]{36}$/.test(id)){send(res,400,{error:'无效文章 ID'});return;}
      const directory=path.resolve(MEDIA_ROOT,id);
      if(!directory.startsWith(MEDIA_ROOT+path.sep)){send(res,400,{error:'无效文章路径'});return;}
      fs.rmSync(directory,{recursive:true,force:true});send(res,200,{deleted:true});return;
    }
    if(req.method==='GET'){serveStatic(req,res);return;}
    send(res,405,{error:'不支持的请求'});
  });
}
if(require.main===module)createServer().listen(PORT,'127.0.0.1',()=>console.log('Preview ready: http://127.0.0.1:'+PORT));
module.exports={createServer};
