const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const workspace=__dirname;
const temp=fs.mkdtempSync(path.join(workspace,'.native-test-'));
process.env.CODEX_HOME=temp;
const native=require('./native-backend.cjs');
const id='11111111-2222-4333-8444-555555555555';
let calls=0;
const runner=async(prompt,sandbox)=>{
  calls++;
  if(sandbox==='read-only'){
    const article={title:'测试文章',lead:'导语',sections:[{heading:'第一节',paragraphs:['内容']},{heading:'第二节',paragraphs:['内容']},{heading:'第三节',paragraphs:['']}],imagePrompts:['文章主题封面摄影画面，画面元素少且简洁构图','文章第一段主题摄影画面，画面元素少且简洁构图','文章第二段主题摄影画面，画面元素少且简洁构图']};
    article.sections[2].paragraphs[0]='字'.repeat(600-native.articleCount(article));
    return {final:JSON.stringify(article),threadId:id};
  }
  const dir=path.join(temp,'generated_images',id);
  fs.mkdirSync(dir,{recursive:true});
  for(let i=0;i<(prompt.includes('3 次独立工具调用')?3:1);i++)fs.copyFileSync(path.join(workspace,'article-cover.png'),path.join(dir,`exec-${i+1}.png`));
  return {final:'完成',threadId:id};
};
(async()=>{
  try{
    const longArticle={title:'测试长文',lead:'完整导语',sections:[1,2,3].map(i=>({heading:'第'+i+'节',paragraphs:['一项具体行动可以在当天完成。'.repeat(20)]})),imagePrompts:['文章主题封面摄影画面，画面元素少且简洁构图','文章第一段主题摄影画面，画面元素少且简洁构图','文章第二段主题摄影画面，画面元素少且简洁构图']};
    let lengthCalls=0;
    const corrected=await native.generateText({topic:'测试主题',target:600,style:'minimal'},async()=>{lengthCalls++;return {final:JSON.stringify(longArticle)};});
    assert.ok(Math.abs(native.articleCount(corrected)-600)<=50);
    assert.equal(lengthCalls,1);
    const article=await native.createArticle({topic:'测试主题',target:600,style:'minimal'}, {runner});
    assert.equal(native.articleCount(article),600);
    assert.equal(article.images.length,3);
    assert.equal(calls,2);
    for(const image of article.images)assert.ok(fs.existsSync(path.join(workspace,image.src)));
    const changed=await native.regenerateImage({id:article.id,topic:'测试主题',scene:'全新画面'}, {runner});
    assert.ok(changed.src.includes(article.id));
    assert.equal(calls,3);
    fs.rmSync(path.join(workspace,'generated',article.id),{recursive:true,force:true});
    console.log('native backend checks passed');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
