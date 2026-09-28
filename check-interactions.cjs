const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
class Element{
 constructor(){this.listeners={};this.textContent='';this.innerHTML='';this.hidden=false;this.value='';this.dataset={};this.classList={add(){},remove(){},toggle(){}}}
 addEventListener(name,handler){this.listeners[name]=handler}
 click(event={}){return this.listeners.click?.({preventDefault(){},target:this,...event})}
 querySelector(){return new Element()}
 setAttribute(name,value){this[name]=value}
 scrollIntoView(){}
 focus(){}
 showModal(){this.open=true}
 close(){this.open=false}
}
const elements=new Map(),get=selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector)};
get('#topic').value='全新主题';get('#length').value='600';
get('#audience').value='独立研究者';get('#tone').value='深入浅出';get('#style').value='国风雅致';
const storage=new Map();
let generation=0,deleted=0,synced=0,configured=false,allowlisted=false;
const fetchMock=async(url,options)=>{
 if(url==='/api/status')return {ok:true,json:async()=>({ready:true})};
 if(url==='/api/wechat/status')return {ok:true,json:async()=>configured?{configured:true,ready:allowlisted,appId:'wx1234567890abcdef',error:allowlisted?undefined:'40164：IP 不在白名单'}:{configured:false,ready:false}};
 if(url==='/api/wechat/configure'){
  const sent=JSON.parse(options.body);assert.equal(sent.appSecret,'test-secret');assert.equal(sent.author,'测试作者');
  configured=true;
  return {ok:true,json:async()=>({configured:true,ready:false,appId:sent.appId,error:'40164：IP 不在白名单'})};
 }
 if(url==='/api/wechat/sync'){
  synced++;
  assert.equal(JSON.parse(options.body).images.length,3);
  return {ok:true,json:async()=>({mediaId:'draft-'+synced,verified:true})};
 }
 if(url==='/api/generate'){
  generation++;
  const input=JSON.parse(options.body);
  assert.equal(input.audience,'独立研究者');
  assert.equal(input.tone,'深入浅出');
  assert.equal(input.style,'国风雅致');
  const id='00000000-0000-4000-8000-'+String(generation).padStart(12,'0');
  const article={id,topic:'全新主题',target:600,audience:input.audience,tone:input.tone,style:input.style,createdAt:new Date().toISOString(),title:'第'+generation+'篇新文章',lead:'引言',sections:[{heading:'小节',paragraphs:['新'.repeat(590)]}],images:[1,2,3].map(i=>({src:'/generated/'+id+'/'+i+'.png',caption:'新图'+i}))};
  const lines=[{stage:'text'},{stage:'images',title:article.title,actual:600},{stage:'done',article}].map(x=>JSON.stringify(x)+'\n');
  let index=0;
  return {ok:true,body:{getReader(){return {read:async()=>index<lines.length?{done:false,value:new TextEncoder().encode(lines[index++])}:{done:true}}}}};
 }
 if(url.startsWith('/api/articles/')){deleted++;return {ok:true,json:async()=>({deleted:true})}}
 throw new Error('Unexpected URL: '+url);
};
const context={
 document:{querySelector:get,querySelectorAll:()=>[],addEventListener(){},body:new Element()},
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
 fetch:fetchMock,window:{confirm:()=>true,scrollTo(){}},setTimeout:()=>1,clearTimeout(){},Date,Math,JSON,TextDecoder,TextEncoder
};
vm.runInNewContext(source,context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 get('#generate-button').click();assert.equal(get('#generation-overlay').hidden,false);await tick();await tick();assert.equal(get('#generation-overlay').hidden,true);
 assert.equal(generation,1);
 assert.equal((get('#article-body').innerHTML.match(/inline-figure/g)||[]).length,2);
 get('#sync-button').click();assert.equal(get('#wechat-dialog').open,true);
 get('#wechat-appid').value='wx1234567890abcdef';get('#wechat-secret').value='test-secret';get('#wechat-author').value='测试作者';
 await get('#wechat-form').listeners.submit({preventDefault(){}});
 assert.equal(get('#wechat-dialog').open,true);
 assert.equal(get('#wechat-secret').value,'');
 allowlisted=true;
 await get('#wechat-recheck').click();
 assert.equal(get('#wechat-dialog').open,false);
 await get('#sync-button').click();await tick();
 assert.equal(synced,1);
 assert.equal(get('#sync-status').hidden,false);
 assert.match(get('#history-list').innerHTML,/已同步/);
 context.showWechatStatus({configured:true,ready:true,appId:'wxabcdef1234567890'});
 assert.equal(get('#sync-status').hidden,true);
 assert.match(get('#history-list').innerHTML,/未同步/);
 context.showWechatStatus({configured:true,ready:true,appId:'wx1234567890abcdef'});
 assert.equal(get('#sync-status').hidden,false);
 assert.equal(JSON.parse(storage.get('gaozijian_history_v2'))[0].wechatDraftId,'draft-1');
 assert.equal(storage.get('gaozijian_history_v2').includes('test-secret'),false);
 const first=get('#preview-title').textContent;
 get('#refresh-button').click();await tick();await tick();
 assert.equal(generation,2);assert.notEqual(get('#preview-title').textContent,first);
 assert.equal(get('#sync-status').hidden,true);
 assert.equal(JSON.parse(storage.get('gaozijian_history_v2')).length,2);
 assert.match(get('#history-list').innerHTML,/未同步/);
 get('#history-link').click();assert.equal(get('#history-panel').hidden,false);
 const latest=JSON.parse(storage.get('gaozijian_history_v2'))[0];
 await get('#history-list').click({target:{closest(selector){return selector==='[data-delete]'?{dataset:{delete:latest.id}}:null}}});
 await tick();await tick();
 assert.equal(deleted,1);
 assert.equal(JSON.parse(storage.get('gaozijian_history_v2')).length,1);
 assert.equal(get('#preview-title').textContent,first);
 assert.equal(get('#sync-status').hidden,false);
 assert.equal(get('#audience').value,'独立研究者');
 assert.equal(get('#tone').value,'深入浅出');
 assert.equal(get('#style').value,'国风雅致');
 console.log('通过：流式生成、公众号绑定与同步状态、历史文章删除与切换。');
})().catch(error=>{console.error(error);process.exitCode=1});
