const {spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const MEDIA_ROOT = path.join(ROOT, 'generated');
const CODEX_HOME = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.codex');
const GENERATED_ROOT = path.resolve(CODEX_HOME, 'generated_images');

function countChars(value) { return [...String(value).replace(/\s/g, '')].length; }
function articleCount(a) { return countChars(a.title + a.lead + a.sections.map(s => s.heading + s.paragraphs.join('')).join('')); }
function nativeStatus() {
  try {
    const result = spawnSync('codex', ['login', 'status'], {encoding:'utf8', windowsHide:true, timeout:10000});
    return {ready:result.status === 0 && /Logged in/i.test((result.stdout || '') + (result.stderr || '')), provider:'codex-native', imageModel:'automatic'};
  } catch { return {ready:false, provider:'codex-native', imageModel:'automatic'}; }
}
function runCodex(prompt, sandbox='read-only', timeout=900000) {
  return new Promise((resolve,reject) => {
    const args=['exec','--ephemeral','--ignore-user-config','--sandbox',sandbox,'-C',ROOT,'--json','-'];
    const child=spawn('codex',args,{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='', errors='', threadId='', final='';
    const timer=setTimeout(()=>{child.kill();reject(new Error('Codex 生成超时，请稍后重试'));},timeout);
    child.stdout.on('data',chunk=>{
      output+=chunk.toString();
      if(output.length>2_000_000){child.kill();reject(new Error('Codex 返回内容过长'));return;}
      let pos;
      while((pos=output.indexOf('\n'))!==-1){
        const line=output.slice(0,pos);output=output.slice(pos+1);
        try{
          const event=JSON.parse(line);
          if(event.type==='thread.started')threadId=event.thread_id;
          if(event.type==='item.completed' && event.item?.type==='agent_message')final=event.item.text;
        }catch{}
      }
    });
    child.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(-4000);});
    child.on('error',error=>{clearTimeout(timer);reject(new Error('无法启动 Codex：'+error.message));});
    child.on('close',code=>{
      clearTimeout(timer);
      if(code!==0)return reject(new Error('Codex 生成失败：'+(errors.match(/(?:error:|ERROR).*$/im)?.[0] || '请检查本机登录与网络')));
      resolve({threadId,final});
    });
    child.stdin.end(prompt);
  });
}
function parseObject(text){
  const start=text.indexOf('{'),end=text.lastIndexOf('}');
  if(start<0||end<=start)throw new Error('Codex 未返回有效文章 JSON');
  return JSON.parse(text.slice(start,end+1));
}
function validArticle(a){
  return a&&typeof a.title==='string'&&typeof a.lead==='string'&&Array.isArray(a.sections)&&a.sections.length>=3&&a.sections.every(s=>typeof s.heading==='string'&&Array.isArray(s.paragraphs)&&s.paragraphs.length&&s.paragraphs.every(p=>typeof p==='string'))&&Array.isArray(a.imagePrompts)&&a.imagePrompts.length===3&&a.imagePrompts.every(p=>typeof p==='string'&&p.length>12);
}
function textPrompt(input,attempt,previous){
  const style={editorial:'精美杂志摄影',minimal:'高级极简摄影',warm:'温暖自然摄影'}[input.style]||input.style||'精美杂志摄影';
  return `你是中文公众号编辑。本次是全新独立创作，不得查看、延续、复用已生成的文章或图片。不要调用任何工具。\n仅返回一个 JSON 对象，不要 Markdown 或解释，字段必须为 title 字符串、lead 字符串、sections 数组（至少三节，每节含 heading 字符串和 paragraphs 字符串数组）、imagePrompts 数组（三条详细配图提示词）。\n用户要求：${JSON.stringify({主题:input.topic,读者:input.audience,语气:input.tone,补充:input.notes,风格:style})}\n目标字数：${input.target} 字。计数口径：标题、导语、小标题、所有正文合并，去掉空白字符，误差绝对值不得超过 50 字。你必须先内部计算并调整，再输出。正文必须具体、有条理、可执行，不虚构数据和来源。三张图对应封面与正文两个不同场景，精美、元素少、主体明确、构图不同、无文字无水印。\n本次唯一标识：${crypto.randomUUID()}。第 ${attempt} 次尝试。${previous ? `上次偏差 ${previous} 字，请按此调整长度。` : ''}`;
}
function shortenArticle(article,target){
  let length=articleCount(article);
  for(let pass=0;pass<30 && length>target+50;pass++){
    let choice=null;
    for(let si=article.sections.length-1;si>=0;si--){
      const section=article.sections[si];
      for(let pi=section.paragraphs.length-1;pi>=0;pi--){
        const parts=section.paragraphs[pi].match(/[^。！？!?]+[。！？!?]?/g)||[];
        for(let index=parts.length-1;index>=1;index--){
          const amount=countChars(parts[index]);
          if(length-amount<target-50)continue;
          if(!choice || amount>choice.amount)choice={si,pi,index,parts,amount};
        }
      }
    }
    if(!choice)break;
    const paragraph=choice.parts.filter((_,index)=>index!==choice.index).join('').trim();
    article.sections[choice.si].paragraphs[choice.pi]=paragraph;
    length=articleCount(article);
  }
  return article;
}
async function generateText(input,runner=runCodex){
  let previous=0,lastError='';
  for(let attempt=1;attempt<=2;attempt++){
    const {final}=await runner(textPrompt(input,attempt,previous),'read-only',360000);
    let article;
    try{article=parseObject(final)}catch(error){lastError='文章格式错误：'+error.message;continue;}
    if(!validArticle(article)){lastError='文章缺少正文或配图描述';continue;}
    article=shortenArticle(article,input.target);
    previous=input.target-articleCount(article);
    if(Math.abs(previous)<=50)return article;
    lastError=`文章字数偏差 ${Math.abs(previous)} 字`;
  }
  throw new Error(lastError+'；本次文章未保存，请重试');
}
function imagePrompt(scene,input,role){
  const style={editorial:'premium editorial photography',minimal:'high-end minimal photography',warm:'warm natural editorial photography'}[input.style]||input.style||'premium editorial photography';
  return `Create a new image from scratch for a Chinese WeChat article. Topic: ${input.topic}. Role: ${role}. Scene: ${scene}. Style: ${style}. Beautiful realistic light, one clear subject, few elements, elegant composition. No text, logos, watermarks, or collage. Do not use or reference any previous image.`;
}
async function generateImages(scenes,input,runner=runCodex){
  const prompts=scenes.map((scene,index)=>imagePrompt(scene,input,['cover','first inline image','second inline image'][index] || 'article image'));
  const {threadId}=await runner(`请使用原生 image_gen 工具，根据下面的 ${prompts.length} 条提示词分别生成一张全新图片，共 ${prompts.length} 次独立工具调用。请在同一轮并行发起这些调用，不必等待或检查前一张的结果。每张必须场景和构图不同，不要参考已有图片。工具无模型选择参数，请不要声称能指定 image 2.5。完成后简短回复即可。\n${prompts.map((p,i)=>`${i+1}. ${p}`).join('\n')}`,'workspace-write',1200000);
  if(!/^[0-9a-f-]{36}$/.test(threadId))throw new Error('未获得 Codex 生图任务 ID');
  const directory=path.resolve(GENERATED_ROOT,threadId);
  if(!directory.startsWith(GENERATED_ROOT+path.sep)||!fs.existsSync(directory))throw new Error('原生生图没有返回图片');
  const files=fs.readdirSync(directory).filter(name=>/^exec-[0-9a-f-]+\.png$/.test(name)).sort();
  if(files.length<prompts.length)throw new Error(`原生生图只返回 ${files.length} 张图片，预期 ${prompts.length} 张，请重试`);
  return files.sort((a,b)=>fs.statSync(path.join(directory,a)).mtimeMs-fs.statSync(path.join(directory,b)).mtimeMs).slice(0,prompts.length).map(name=>fs.readFileSync(path.join(directory,name)));
}
async function createArticle(input,options={}){
  const topic=String(input.topic||'').trim(),target=Number(input.target);
  if(!topic||topic.length>500)throw new Error('请填写 1–500 字的文章主题');
  if(!Number.isInteger(target)||target<600||target>1800)throw new Error('目标字数须在 600–1800 之间');
  const brief={topic,target,audience:String(input.audience||'').slice(0,100),tone:String(input.tone||'').slice(0,100),notes:String(input.notes||'').slice(0,1000),style:String(input.style||'杂志摄影').slice(0,100)};
  options.onProgress?.({stage:'text',message:'正在撰写文章并校准字数…'});
  const scenes=[
    `封面：为「${brief.topic}」制作具有视觉隐喻的主题摄影，一件核心物品或一个核心动作，画面留白，避免文字。`,
    `正文场景一：表现「${brief.topic}」在日常实践中的具体过程，人与环境自然互动，简洁画面，与封面的场景和视角完全不同。`,
    `正文场景二：表现「${brief.topic}」带来的变化或成果，近景静物或安静环境，与前两张的主体、视角、色调明显不同。`
  ];
  const imageResult=generateImages(scenes,brief,options.runner||runCodex).then(images=>({images}),error=>({error}));
  const article=await generateText(brief,options.runner||runCodex);
  options.onProgress?.({stage:'images',message:'文章已完成，配图正在生成…',title:article.title,actual:articleCount(article)});
  const result=await imageResult;
  if(result.error)throw result.error;
  const images=result.images;
  const id=crypto.randomUUID(),directory=path.join(MEDIA_ROOT,id);
  fs.mkdirSync(directory,{recursive:true});
  try{images.forEach((bytes,index)=>fs.writeFileSync(path.join(directory,`${index+1}.png`),bytes));}
  catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error;}
  return {id,topic,target,audience:brief.audience,tone:brief.tone,notes:brief.notes,style:brief.style,createdAt:new Date().toISOString(),title:article.title,lead:article.lead,sections:article.sections,actual:articleCount(article),images:scenes.map((scene,index)=>({src:`/generated/${id}/${index+1}.png`,caption:['文章封面','正文配图一','正文配图二'][index],alt:scene.slice(0,120)}))};
}
async function regenerateImage(input,options={}){
  const id=String(input.id||'');
  if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('无效文章 ID');
  const directory=path.resolve(MEDIA_ROOT,id);
  if(!directory.startsWith(MEDIA_ROOT+path.sep)||!fs.existsSync(directory))throw new Error('找不到文章图片目录');
  const topic=String(input.topic||'').slice(0,500),style=String(input.style||'杂志摄影').slice(0,100);
  const [bytes]=await generateImages([String(input.scene||topic)],{topic,style},options.runner||runCodex);
  const filename=crypto.randomUUID()+'.png';
  fs.writeFileSync(path.join(directory,filename),bytes);
  return {src:`/generated/${id}/${filename}`,caption:'重新生成的文章封面',alt:topic+'主题封面'};
}
module.exports={nativeStatus,runCodex,createArticle,regenerateImage,articleCount,generateText,generateImages,imagePrompt};
