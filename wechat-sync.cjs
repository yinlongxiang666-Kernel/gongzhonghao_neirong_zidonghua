const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');

const API='https://api.weixin.qq.com/cgi-bin/';
const MEDIA_ROOT=path.join(__dirname,'generated');
const CREDENTIAL_FILE=process.env.GAOZIJIAN_CREDENTIALS_FILE||path.join(os.homedir(),'.gaozijian','wechat-credentials.json');
function loadCredentials(){
  try{
    const data=JSON.parse(fs.readFileSync(CREDENTIAL_FILE,'utf8'));
    if(typeof data.appId==='string'&&typeof data.appSecret==='string'&&data.appId&&data.appSecret)return {appId:data.appId,appSecret:data.appSecret,author:String(data.author||'').slice(0,32)};
  }catch{}
  return null;
}
function saveCredentials(value){
  const directory=path.dirname(CREDENTIAL_FILE);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const temporary=path.join(directory,'.wechat-credentials-'+crypto.randomUUID()+'.tmp');
  try{
    fs.writeFileSync(temporary,JSON.stringify(value),{encoding:'utf8',mode:0o600,flag:'wx'});
    fs.renameSync(temporary,CREDENTIAL_FILE);
    if(process.platform!=='win32')fs.chmodSync(CREDENTIAL_FILE,0o600);
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
let cachedToken=null;
let activeCredentials=loadCredentials();
function credentials(env=process.env){
  if(env===process.env&&activeCredentials)return activeCredentials;
  return {appId:String(env.WECHAT_APP_ID||'').trim(),appSecret:String(env.WECHAT_APP_SECRET||'').trim(),author:String(env.WECHAT_AUTHOR||'').trim().slice(0,32)};
}
function errorFromWechat(data){
  const code=Number(data?.errcode||0);
  if(!code)return null;
  const detail=String(data.errmsg||'微信接口拒绝请求').slice(0,300);
  const hint={
    40013:'AppID 无效，请核对公众号开发信息。',
    40125:'AppSecret 无效，请核对开发密钥。',
    40164:'请求出口 IP 不在公众号 API IP 白名单中，请将微信错误信息中的 IP 加入白名单。',
    48001:'此公众号没有该接口权限，请在后台检查草稿箱或素材接口权限。'
  }[code]||'微信接口返回错误。';
  const error=new Error(`${hint}（${code}：${detail}）`);
  error.errcode=code;
  return error;
}
async function apiRequest(endpoint,{method='GET',body,token,headers,fetcher=fetch}={}){
  const url=new URL(endpoint,API);
  if(token)url.searchParams.set('access_token',token);
  let response;
  try{response=await fetcher(url,{method,body,headers,signal:AbortSignal.timeout(90000)});}
  catch{throw new Error('无法连接微信 API，请检查本机网络连接。');}
  let data;
  try{data=await response.json();}catch{throw new Error('微信 API 返回了无法解析的结果。');}
  const wechatError=errorFromWechat(data);
  if(wechatError)throw wechatError;
  if(!response.ok)throw new Error('微信 API 请求失败（HTTP '+response.status+'）。');
  return data;
}
async function getToken({env=process.env,fetcher=fetch}={}){
  const {appId,appSecret}=credentials(env);
  if(!appId||!appSecret)throw new Error('尚未在本机服务端配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET。');
  if(cachedToken?.appId===appId&&cachedToken.appSecret===appSecret&&cachedToken.expiresAt>Date.now())return cachedToken.value;
  const query='token?grant_type=client_credential&appid='+encodeURIComponent(appId)+'&secret='+encodeURIComponent(appSecret);
  const data=await apiRequest(query,{fetcher});
  if(!data.access_token)throw new Error('微信没有返回 access_token，请检查公众号配置。');
  cachedToken={appId,appSecret,value:data.access_token,expiresAt:Date.now()+Math.max(60,Number(data.expires_in||7200)-300)*1000};
  return cachedToken.value;
}
async function configure(input,options={}){
  const appId=String(input.appId||'').trim(),appSecret=String(input.appSecret||'').trim(),author=String(input.author||'').trim().slice(0,32);
  if(!appId||!appSecret)throw new Error('请填写 AppID 和 AppSecret。');
  const previous=activeCredentials;
  activeCredentials={appId,appSecret,author};
  cachedToken=null;
  const result=await status(options);
  try{saveCredentials(activeCredentials);}
  catch{activeCredentials=previous;cachedToken=null;throw new Error('本机无法保存公众号绑定，请检查用户目录的写入权限。');}
  return result;
}
async function status(options={}){
  const {appId,appSecret}=credentials(options.env);
  if(!appId||!appSecret)return {configured:false,ready:false};
  try{await getToken(options);return {configured:true,ready:true,appId,author:credentials(options.env).author||''};}
  catch(error){return {configured:true,ready:false,appId,author:credentials(options.env).author||'',error:error.message};}
}
function imagePath(article,index){
  const id=String(article.id||'');
  if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('文章 ID 无效，请重新生成文章。');
  const src=String(article.images?.[index]?.src||'');
  const prefix='/generated/'+id+'/';
  if(!src.startsWith(prefix))throw new Error('文章配图不属于当前文章，请重新生成配图。');
  const filename=src.slice(prefix.length);
  if(!/^(?:[1-3]|[0-9a-f-]{36})\.png$/.test(filename))throw new Error('文章配图路径无效。');
  const file=path.resolve(MEDIA_ROOT,id,filename);
  if(!file.startsWith(path.resolve(MEDIA_ROOT,id)+path.sep)||!fs.existsSync(file))throw new Error('找不到文章配图，请重新生成文章。');
  return file;
}
function ffmpeg(input,output,size,quality){
  return new Promise((resolve,reject)=>{
    const args=['-hide_banner','-loglevel','error','-y','-i',input,'-vf',`scale=${size}:${size}:force_original_aspect_ratio=decrease`,'-frames:v','1','-q:v',String(quality),output];
    const child=spawn('ffmpeg',args,{windowsHide:true});
    let stderr='';
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-1000);});
    child.on('error',()=>reject(new Error('本机未找到 ffmpeg，无法压缩公众号配图。')));
    child.on('close',code=>code===0?resolve():reject(new Error('配图转换失败：'+stderr)));
  });
}
async function prepareImage(input,directory,index){
  const output=path.join(directory,index+'.jpg');
  for(const [size,quality] of [[1280,4],[960,6],[720,8]]){
    await ffmpeg(input,output,size,quality);
    if(fs.statSync(output).size<950000)return output;
  }
  throw new Error('配图压缩后仍超过公众号正文图片大小限制。');
}
async function uploadImage(kind,file,token,fetcher=fetch){
  const form=new FormData();
  form.set('media',new Blob([fs.readFileSync(file)],{type:'image/jpeg'}),path.basename(file));
  const endpoint=kind==='cover'?'material/add_material?type=image':'media/uploadimg';
  const data=await apiRequest(endpoint,{method:'POST',body:form,token,fetcher});
  const value=kind==='cover'?data.media_id:data.url;
  if(!value)throw new Error(kind==='cover'?'封面上传后没有获得素材 ID。':'正文配图上传后没有获得微信图片地址。');
  return value;
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function contentHtml(article,inlineUrls){
  const sections=article.sections;
  const midpoint=Math.ceil(sections.length/2);
  let html='<p style="font-size:16px;line-height:1.9;color:#444">'+escapeHtml(article.lead)+'</p>';
  sections.forEach((section,index)=>{
    html+='<h2 style="font-size:20px;line-height:1.5;margin:28px 0 12px">'+escapeHtml(section.heading)+'</h2>';
    for(const paragraph of section.paragraphs)html+='<p style="font-size:16px;line-height:1.9;margin:0 0 16px">'+escapeHtml(paragraph)+'</p>';
    if(index===midpoint-1||index===sections.length-1){
      const url=inlineUrls[index===midpoint-1?0:1];
      html+='<p style="margin:22px 0"><img src="'+escapeHtml(url)+'" style="width:100%;height:auto" /></p>';
    }
  });
  return html;
}
function validateArticle(article){
  if(!article||typeof article.title!=='string'||!article.title.trim()||[...article.title].length>64)throw new Error('文章标题无效或过长。');
  if(typeof article.lead!=='string'||!Array.isArray(article.sections)||article.sections.length<1)throw new Error('文章正文不完整。');
  if(!article.sections.every(s=>typeof s.heading==='string'&&Array.isArray(s.paragraphs)&&s.paragraphs.every(p=>typeof p==='string')))throw new Error('文章段落格式无效。');
  if(!Array.isArray(article.images)||article.images.length!==3)throw new Error('需要一张封面和两张正文配图才能同步。');
  return [0,1,2].map(index=>imagePath(article,index));
}
async function syncArticle(article,options={}){
  const paths=validateArticle(article);
  const token=await getToken(options);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-draft-'));
  try{
    const files=await Promise.all(paths.map((file,index)=>prepareImage(file,directory,index)));
    const [thumb,...inlineUrls]=await Promise.all(files.map((file,index)=>uploadImage(index===0?'cover':'inline',file,token,options.fetcher||fetch)));
    const draft={article_type:'news',title:article.title.trim(),digest:article.lead.slice(0,120),content:contentHtml(article,inlineUrls),thumb_media_id:thumb,need_open_comment:0,only_fans_can_comment:0};
    const author=credentials(options.env).author;
    if(author)draft.author=author;
    const payload={articles:[draft]};
    const added=await apiRequest('draft/add',{method:'POST',body:JSON.stringify(payload),token,fetcher:options.fetcher||fetch,headers:{'Content-Type':'application/json; charset=utf-8'}});
    if(!added.media_id)throw new Error('微信未返回草稿 ID，无法确认同步结果。');
    let verified=false;
    try{await apiRequest('draft/get',{method:'POST',body:JSON.stringify({media_id:added.media_id}),headers:{'Content-Type':'application/json; charset=utf-8'},token,fetcher:options.fetcher||fetch});verified=true;}catch{}
    return {mediaId:added.media_id,verified};
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
module.exports={status,configure,syncArticle,contentHtml,validateArticle,prepareImage,getToken,apiRequest};
