const assert=require('node:assert/strict');
const {createServer}=require('./preview-server.cjs');
(async()=>{
  const server=createServer({status:{ready:true,provider:'codex-native',imageModel:'automatic'}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const status=await (await fetch(base+'/api/status')).json();
    assert.equal(status.ready,true);
    assert.equal(status.provider,'codex-native');
    const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:'',target:600})};
    const response=await fetch(base+'/api/generate',options);
    assert.equal(response.status,400);
    assert.match((await response.json()).error,/主题/);
    const streamed=await fetch(base+'/api/generate',{...options,headers:{...options.headers,'X-Progress':'stream'}});
    assert.match(await streamed.text(),/"stage":"error"/);
    console.log('API checks passed');
  }finally{server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
