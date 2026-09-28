const $=selector=>document.querySelector(selector);
const KEY='gaozijian_history_v2';
const oldImages=[
  {src:'article-cover.png',caption:'旧版示例封面'},
  {src:'article-inline-1.png',caption:'旧版示例插图一'},
  {src:'article-inline-2.png',caption:'旧版示例插图二'}
];
let history=loadHistory(),current=null,busy=false,wechatReady=false,wechatStatus=null;
function loadHistory(){
  try{const parsed=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(parsed)?parsed:[]}
  catch{return []}
}
function saveHistory(){
  try{localStorage.setItem(KEY,JSON.stringify(history))}
  catch{toast('浏览器存储空间不足，历史文章无法保存')}
}
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}
function count(a){return [...String(a.title+a.lead+a.sections.map(s=>s.heading+s.paragraphs.join('')).join('')).replace(/\s/g,'')].length}
function imagesOf(a){
  if(Array.isArray(a.images)&&a.images.length===3)return a.images;
  return [0,1,2].map(i=>oldImages[(i+(a.imageOffset||0))%3]);
}
function articleSignature(a){return JSON.stringify([a.title,a.lead,a.sections,a.images])}
function syncedToBoundAccount(a){return Boolean(a?.wechatDraftId&&(!a.wechatAppId||a.wechatAppId===wechatStatus?.appId))}
function updateSyncStatus(){
  $('#sync-status').hidden=!syncedToBoundAccount(current);
}
function invalidateSyncIfChanged(a){
  if(!a.wechatDraftId)return;
  const signature=articleSignature(a);
  if(!a.wechatSyncedSignature){a.wechatSyncedSignature=signature;saveHistory();return;}
  if(a.wechatSyncedSignature!==signature){
    delete a.wechatDraftId;
    delete a.wechatSyncedAt;
    delete a.wechatSyncedSignature;
    delete a.wechatAppId;
    saveHistory();
  }
}
function toast(message,type='info'){
  $('#toast-message').textContent=message;
  $('#toast').classList.toggle('error',type==='error');
  $('.toast-icon').textContent=type==='error'?'!':'✓';
  $('#toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),5200);
}
function setBusy(value,message){
  busy=value;
  $('#generate-button').disabled=value;
  $('#refresh-button').disabled=value;
  $('#regenerate-image').disabled=value;
  $('#generation-overlay').hidden=!value;
  $('.article-panel').setAttribute('aria-busy',String(value));
  document.body.classList.toggle('loading',value);
  if(value)$('#generation-overlay-title').textContent=message||'正在创作新文章';
  $('#generate-button span:nth-child(2)').textContent=value?'生成中，请稍候…':'生成文章与配图';
  $('#refresh-button').textContent=value?'生成中…':'↻ 重新生成';
}
function updateReadiness(){
  const titleReady=Boolean(current?.title);
  const imagesReady=Array.isArray(current?.images)&&current.images.length===3;
  $('#check-title').textContent=titleReady?'✓ 标题已生成':'○ 标题待生成';
  $('#check-images').textContent=imagesReady?'✓ 配图已生成':'○ 配图待生成';
  $('#check-account').textContent=wechatReady?'✓ 公众号已绑定':'○ 账号待绑定';
  $('#readiness').textContent=[titleReady,imagesReady,wechatReady].filter(Boolean).length+' / 3';
}
function renderEmpty(){
  current=null;
  updateSyncStatus();
  $('#preview-title').textContent='填写要求后，生成你的第一篇文章';
  $('#preview-lead').textContent='文章会按目标字数生成，并为这篇文章创建三张全新配图。';
  $('#cover-figure').hidden=true;
  $('#article-body').innerHTML='';
  $('#word-count').textContent='尚未生成';
  $('#preview-summary').textContent='暂无文章';
  $('#reading-time').textContent='';
  $('#generation-status').textContent='等待生成';
}
function renderArticle(a){
  invalidateSyncIfChanged(a);
  current=a;
  updateSyncStatus();
  $('#preview-title').textContent=a.title;
  $('#preview-lead').textContent=a.lead;
  const images=imagesOf(a);
  $('#cover-figure').hidden=false;
  $('#cover-image').src=images[0].src;
  $('#cover-image').alt=images[0].alt||images[0].caption||'文章封面';
  $('#cover-caption').textContent=images[0].caption||'文章封面';
  const sections=a.sections.filter(s=>s.paragraphs?.length);
  const mid=Math.ceil(sections.length/2);
  const sectionHtml=items=>items.map(s=>'<section><h4>'+escapeHtml(s.heading)+'</h4>'+s.paragraphs.map(p=>'<p>'+escapeHtml(p)+'</p>').join('')+'</section>').join('');
  const figure=(image)=>'<figure class="inline-figure"><img src="'+escapeHtml(image.src)+'" alt="'+escapeHtml(image.alt||image.caption||'正文配图')+'"><figcaption>'+escapeHtml(image.caption||'正文配图')+'</figcaption></figure>';
  $('#article-body').innerHTML=sectionHtml(sections.slice(0,mid))+figure(images[1])+sectionHtml(sections.slice(mid))+figure(images[2]);
  const actual=count(a);
  $('#word-count').textContent='实写 '+actual+' 字 / 目标 '+a.target+' 字';
  $('#preview-summary').textContent=sections.length+' 个小节 · 3 张配图 · '+actual+' 字';
  $('#reading-time').textContent='预计阅读 '+Math.max(1,Math.ceil(actual/350))+' 分钟';
  $('#generation-status').textContent='已生成 · '+new Date(a.createdAt).toLocaleString('zh-CN');
  $('#history-panel').hidden=true;
}
function renderHistory(){
  history.forEach(invalidateSyncIfChanged);
  $('#history-count').textContent=history.length;
  $('#history-list').innerHTML=history.length?history.map(a=>
    '<div class="history-entry"><button type="button" class="history-item'+(a.id===current?.id?' active':'')+'" data-id="'+escapeHtml(a.id)+'"><strong>'+escapeHtml(a.title)+'</strong><span>'+new Date(a.createdAt).toLocaleString('zh-CN')+' · '+count(a)+' 字 · 3 张配图</span><small class="history-sync '+(syncedToBoundAccount(a)?'synced':'unsynced')+'">'+(syncedToBoundAccount(a)?'已同步':'未同步')+'</small></button><button type="button" class="history-delete" data-delete="'+escapeHtml(a.id)+'" aria-label="删除文章：'+escapeHtml(a.title)+'">删除</button></div>'
  ).join(''):'<p class="history-empty">还没有历史文章。生成第一篇后会自动保存在这里。</p>';
}
function restoreForm(a){
  $('#topic').value=a.topic||a.title;
  $('#length').value=a.target||1200;
  $('#length-value').textContent='约 '+Number($('#length').value).toLocaleString()+' 字';
  if(a.audience)$('#audience').value=a.audience;
  if(a.tone)$('#tone').value=a.tone;
  $('#notes').value=a.notes||'';
  $('#style').value=({editorial:'杂志摄影',minimal:'高级极简',warm:'温暖自然'}[a.style]||a.style||'杂志摄影');
}
function brief(){
  return {
    topic:$('#topic').value.trim(),
    target:Number($('#length').value),
    audience:$('#audience').value.trim(),
    tone:$('#tone').value.trim(),
    notes:$('#notes').value.trim(),
    style:$('#style').value.trim()||'杂志摄影'
  };
}
const comboChoices={
  audience:['对效率感兴趣的职场人','创业者与自由职业者','内容创作者','大学生与应届毕业生','初入职场的新人','企业管理者与团队负责人','产品经理与设计师','教师与教育从业者','家长与家庭照护者','科技爱好者','中小企业主','普通大众'],
  tone:['清晰、克制、有启发','轻松、像朋友聊天','专业、数据驱动','亲切、通俗易懂','犀利、观点鲜明','温暖、治愈','严谨、客观','幽默、有趣','故事化、有画面感','鼓舞人心','简洁、直接','深度分析、层层递进'],
  style:['杂志摄影','高级极简','温暖自然','电影感摄影','清新生活方式摄影','科技未来感','复古胶片','国风雅致','日系治愈','写实插画','水彩插画','扁平插画','3D艺术','黑白纪实']
};
function closeCombos(except){
  document.querySelectorAll('.combo').forEach(combo=>{
    if(combo===except)return;
    combo.querySelector('.combo-menu').hidden=true;
    combo.querySelector('input').setAttribute('aria-expanded','false');
    combo.classList.remove('open');
  });
}
function openCombo(combo,filter=''){
  closeCombos(combo);
  const input=combo.querySelector('input'),menu=combo.querySelector('.combo-menu');
  const choices=comboChoices[combo.dataset.combo].filter(value=>value.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  menu.innerHTML=choices.length?choices.map(value=>'<button type="button" role="option" class="combo-option" data-value="'+escapeHtml(value)+'" aria-selected="'+(value===input.value)+'">'+escapeHtml(value)+'</button>').join(''):'<p class="combo-empty">可直接输入自定义内容</p>';
  menu.hidden=false;
  combo.dataset.filterMode=filter?'filtered':'all';
  input.setAttribute('aria-expanded','true');
  combo.classList.add('open');
}
document.querySelectorAll('.combo').forEach(combo=>{
  const input=combo.querySelector('input'),menu=combo.querySelector('.combo-menu'),toggle=combo.querySelector('.combo-toggle');
  input.addEventListener('focus',()=>openCombo(combo));
  input.addEventListener('input',()=>openCombo(combo,input.value.trim()));
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'){event.preventDefault();openCombo(combo);menu.querySelector('.combo-option')?.focus();}
    if(event.key==='Escape')closeCombos();
  });
  toggle.addEventListener('click',()=>{
    if(!menu.hidden&&combo.dataset.filterMode==='all')closeCombos();
    else{openCombo(combo);input.focus();}
  });
  menu.addEventListener('click',event=>{
    const option=event.target.closest('[data-value]');
    if(!option)return;
    input.value=option.dataset.value;
    closeCombos();
  });
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){closeCombos();input.focus();return;}
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    event.preventDefault();
    const options=[...menu.querySelectorAll('.combo-option')],index=options.indexOf(event.target);
    options[(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();
  });
});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.combo'))closeCombos()});
async function requestJson(url,options){
  let response;
  try{response=await fetch(url,options)}
  catch{throw new Error('无法连接生成服务。请用 http://127.0.0.1:4173/ 打开页面，确认本地服务正在运行。')}
  let data;
  try{data=await response.json()}
  catch{throw new Error('生成服务返回异常，请检查服务状态后点击“重新生成”')}
  if(!response.ok)throw new Error(data.error||'生成失败，请点击“重新生成”重试');
  return data;
}
async function requestArticle(input){
  let response;
  try{response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','X-Progress':'stream'},body:JSON.stringify(input)});}
  catch{throw new Error('无法连接本地生成服务，请检查预览服务是否仍在运行');}
  if(!response.ok||!response.body)throw new Error('生成服务未能启动，请稍后重试');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',article=null;
  const processLine=line=>{
    if(!line.trim())return;
    const event=JSON.parse(line);
    if(event.stage==='text'){
      $('#generation-overlay-title').textContent='正在撰写文章…';
      $('.generation-loader p').textContent='正在按目标字数创作并校准文章，请保持页面打开。';
    }else if(event.stage==='images'){
      $('#generation-overlay-title').textContent='文章已完成，正在生成三张配图…';
      $('.generation-loader p').textContent='《'+event.title+'》已写好，共 '+event.actual+' 字。正在生成三张不同构图的新图。';
      $('#generation-status').textContent='文章已完成 · 配图生成中';
    }else if(event.stage==='done')article=event.article;
    else if(event.stage==='error')throw new Error(event.error||'生成失败');
  };
  while(true){
    const {value,done}=await reader.read();
    if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    let index;
    while((index=buffer.indexOf('\n'))!==-1){processLine(buffer.slice(0,index));buffer=buffer.slice(index+1);}
  }
  if(buffer.trim())processLine(buffer);
  if(!article)throw new Error('生成连接中断，本次结果未完成；请重试');
  return article;
}
async function generate(){
  if(busy)return;
  const input=brief();
  if(!input.topic){$('#topic').focus();toast('请先填写文章主题','error');return}
  setBusy(true,'正在创作文章与三张新配图…');
  $('#generation-status').textContent='生成中 · 请稍候';
  try{
    const article=await requestArticle(input);
    if(Math.abs(count(article)-input.target)>50)throw new Error('实际字数超过目标 ±50 字，已拒绝保存，请重试');
    history.unshift(article);
    history=history.slice(0,50);
    saveHistory();
    renderArticle(article);
    renderHistory();
    toast('已生成全新文章和三张新配图');
  }catch(error){
    $('#generation-status').textContent=current?'生成失败 · 当前展示上一版本':'生成失败';
    toast(error.message,'error');
  }finally{setBusy(false)}
}
async function regenerateCover(){
  if(!current){toast('请先生成文章');return}
  if(!/^[0-9a-f-]{36}$/.test(current.id)){toast('旧版文章使用示例图片，请先重新生成文章');return}
  if(busy)return;
  setBusy(true,'正在生成新封面…');
  try{
    const result=await requestJson('/api/regenerate-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:current.id,topic:current.topic,style:current.style,scene:current.title+'：'+current.lead})});
    current.images[0]=result.image;
    invalidateSyncIfChanged(current);
    saveHistory();
    renderArticle(current);
    toast('封面已重新生成');
  }catch(error){toast(error.message)}
  finally{setBusy(false)}
}
async function deleteArticle(id){
  const article=history.find(a=>a.id===id);
  if(!article)return;
  if(!window.confirm('确定删除《'+article.title+'》？删除后无法从历史列表恢复。'))return;
  if(/^[0-9a-f-]{36}$/.test(id)){
    try{await requestJson('/api/articles/'+id,{method:'DELETE'})}
    catch(error){toast('删除图片文件失败：'+error.message);return}
  }
  history=history.filter(a=>a.id!==id);
  saveHistory();
  if(current?.id===id){if(history.length)renderArticle(history[0]);else renderEmpty()}
  renderHistory();
  toast('文章已删除');
}
$('#length').addEventListener('input',event=>$('#length-value').textContent='约 '+Number(event.target.value).toLocaleString()+' 字');
$('#generate-button').addEventListener('click',generate);
$('#refresh-button').addEventListener('click',generate);
$('#regenerate-image').addEventListener('click',regenerateCover);
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter')generate()});
$('#history-link').addEventListener('click',event=>{event.preventDefault();$('#history-panel').hidden=false;renderHistory()});
$('#close-history').addEventListener('click',()=>$('#history-panel').hidden=true);
$('#history-list').addEventListener('click',event=>{
  const deleteButton=event.target.closest('[data-delete]');
  if(deleteButton){deleteArticle(deleteButton.dataset.delete);return}
  const button=event.target.closest('[data-id]');
  if(button){const article=history.find(a=>a.id===button.dataset.id);if(article){restoreForm(article);renderArticle(article);window.scrollTo({top:0,behavior:'smooth'})}}
});
$('#open-editor').addEventListener('click',()=>$('#article-body').scrollIntoView({behavior:'smooth'}));
function showWechatStatus(status){
  wechatStatus=status;
  wechatReady=Boolean(status.ready);
  $('#wechat-badge').textContent=status.ready?'已绑定':status.configured?'待验证':'未绑定';
  $('#wechat-badge').classList.toggle('unbound',!status.ready);
  $('#wechat-name').textContent=status.ready?'公众号已连接':status.configured?'公众号暂未连接':'尚未绑定公众号';
  $('#wechat-detail').textContent=status.ready?'AppID '+status.appId:status.error||'输入 AppID 和 AppSecret 后验证';
  $('#account-info').textContent=status.ready?'重新绑定':'绑定公众号';
  updateSyncStatus();
  renderHistory();
  updateReadiness();
}
async function loadWechatStatus(){
  try{const status=await requestJson('/api/wechat/status');showWechatStatus(status);return status;}
  catch(error){const status={configured:false,ready:false,error:error.message};showWechatStatus(status);return status;}
}
function openWechatDialog(){
  if(wechatStatus?.appId)$('#wechat-appid').value=wechatStatus.appId;
  $('#wechat-author').value=wechatStatus?.author||'';
  $('#wechat-bind-error').textContent=wechatStatus?.error||'';
  $('#wechat-bind-error').hidden=!wechatStatus?.error;
  $('#wechat-dialog').showModal();
}
$('#account-info').addEventListener('click',openWechatDialog);
$('#close-wechat-dialog').addEventListener('click',()=>$('#wechat-dialog').close());
$('#wechat-recheck').addEventListener('click',async()=>{
  const button=$('#wechat-recheck');
  button.disabled=true;button.textContent='正在重新验证…';
  const status=await loadWechatStatus();
  if(status.ready){$('#wechat-dialog').close();toast('公众号已绑定，可以同步文章到草稿箱');}
  else{$('#wechat-bind-error').textContent=status.error||'验证仍未通过';$('#wechat-bind-error').hidden=false;}
  button.disabled=false;button.textContent='白名单已更新，重新验证';
});
$('#wechat-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#wechat-bind-button');
  button.disabled=true;button.textContent='正在验证…';
  $('#wechat-bind-error').hidden=true;
  try{
    const status=await requestJson('/api/wechat/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId:$('#wechat-appid').value.trim(),appSecret:$('#wechat-secret').value.trim(),author:$('#wechat-author').value.trim()})});
    $('#wechat-secret').value='';
    showWechatStatus(status);
    if(!status.ready){$('#wechat-bind-error').textContent=status.error||'公众号验证失败';$('#wechat-bind-error').hidden=false;return;}
    $('#wechat-dialog').close();
    toast('公众号已绑定，可以同步文章到草稿箱');
  }catch(error){$('#wechat-secret').value='';$('#wechat-bind-error').textContent=error.message;$('#wechat-bind-error').hidden=false;}
  finally{button.disabled=false;button.textContent='验证并绑定';}
});
$('#sync-button').addEventListener('click',async()=>{
  if(busy)return;
  if(!current){toast('请先生成文章与配图','error');return;}
  if(syncedToBoundAccount(current)){toast('这篇文章已同步到公众号草稿箱');return;}
  if(!wechatReady){openWechatDialog();return;}
  setBusy(true,'正在同步到公众号草稿箱…');
  $('.generation-loader p').textContent='正在上传封面和正文配图，然后创建公众号草稿。';
  try{
    const result=await requestJson('/api/wechat/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(current)});
    current.wechatDraftId=result.mediaId;
    current.wechatSyncedAt=new Date().toISOString();
    current.wechatSyncedSignature=articleSignature(current);
    current.wechatAppId=wechatStatus.appId;
    saveHistory();renderArticle(current);renderHistory();
    toast('已同步到公众号草稿箱');
  }catch(error){$('#generation-status').textContent='同步失败：'+error.message;$('#wechat-detail').textContent=error.message;toast(error.message,'error');}
  finally{setBusy(false);}
});
renderHistory();
if(history.length)renderArticle(history[0]);else renderEmpty();
loadWechatStatus();
fetch('/api/status').then(response=>response.json()).then(status=>{
  $('#service-status').textContent=status.ready?'Codex 已登录':'Codex 模型服务不可用';
  $('#service-detail').textContent=status.ready?'使用本机 ChatGPT 登录 · 生成需要联网':'请确认本机 Codex 已登录';
  $('#generation-help').textContent=status.ready?'每次独立生成文章与三张新配图。原生生图暂不能指定具体模型版本。':'请先在本机运行 codex login，然后重启预览服务。';
}).catch(()=>{$('#service-status').textContent='生成服务不可用';$('#generation-help').textContent='请启动本地预览服务后再生成。'});
