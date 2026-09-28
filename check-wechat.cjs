const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const credentialsDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'gaozijian-wechat-test-'));
const credentialsFile=path.join(credentialsDirectory,'wechat-credentials.json');
process.env.GAOZIJIAN_CREDENTIALS_FILE=credentialsFile;
const wechat=require('./wechat-sync.cjs');
const id='22222222-3333-4444-8555-666666666666';
const folder=path.join(__dirname,'generated',id);
fs.mkdirSync(folder,{recursive:true});
for(let i=1;i<=3;i++)fs.copyFileSync(path.join(__dirname,'article-cover.png'),path.join(folder,i+'.png'));
const calls=[];
const fetcher=async(url,options)=>{
 const pathname=new URL(url).pathname;
 calls.push(pathname);
 let data;
 if(pathname.endsWith('/token'))data={access_token:'test-token',expires_in:7200};
 else if(pathname.endsWith('/material/add_material'))data={media_id:'cover-media-id'};
 else if(pathname.endsWith('/media/uploadimg'))data={url:'https://mmbiz.qpic.cn/test-'+calls.length};
 else if(pathname.endsWith('/draft/add')){
  const body=JSON.parse(options.body);
  assert.equal(body.articles[0].author,'龙祥');
  assert.equal((body.articles[0].content.match(/<img/g)||[]).length,2);
  assert.equal(body.articles[0].thumb_media_id,'cover-media-id');
  data={media_id:'draft-media-id'};
 }else if(pathname.endsWith('/draft/get'))data={news_item:[{title:'测试草稿'}]};
 else throw new Error('Unexpected '+pathname);
 return {ok:true,status:200,json:async()=>data};
};
(async()=>{
 try{
  const bound=await wechat.configure({appId:'wx1234567890abcdef',appSecret:'test-secret',author:'龙祥'},{fetcher});
  assert.equal(bound.ready,true);
  assert.equal(bound.author,'龙祥');
  assert.equal(fs.existsSync(credentialsFile),true);
  delete require.cache[require.resolve('./wechat-sync.cjs')];
  const restarted=require('./wechat-sync.cjs');
  assert.equal((await restarted.status({fetcher})).author,'龙祥');
  await restarted.configure({appId:'wxabcdef1234567890',appSecret:'another-secret',author:'新作者'},{fetcher});
  assert.equal(JSON.parse(fs.readFileSync(credentialsFile,'utf8')).appId,'wxabcdef1234567890');
  assert.equal(JSON.parse(fs.readFileSync(credentialsFile,'utf8')).author,'新作者');
  const article={id,title:'测试草稿',lead:'这是导语',sections:[{heading:'第一节',paragraphs:['正文一']},{heading:'第二节',paragraphs:['正文二']},{heading:'第三节',paragraphs:['正文三']}],images:[1,2,3].map(i=>({src:'/generated/'+id+'/'+i+'.png'}))};
  const result=await wechat.syncArticle(article,{fetcher});
  assert.equal(result.mediaId,'draft-media-id');
  assert.equal(result.verified,true);
  assert.equal(calls.filter(x=>x.endsWith('/media/uploadimg')).length,2);
  const ipError=await wechat.apiRequest('token',{fetcher:async()=>({ok:true,status:200,json:async()=>({errcode:40164,errmsg:'invalid ip 39.181.63.92'})})}).then(()=>null,e=>e);
  assert.equal(ipError.errcode,40164);
  console.log('WeChat draft integration checks passed');
 }finally{fs.rmSync(folder,{recursive:true,force:true});fs.rmSync(credentialsFile,{force:true});fs.rmdirSync(credentialsDirectory);}
})().catch(e=>{console.error(e);process.exitCode=1});
