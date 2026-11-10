const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');

test('ephemeral entrypoint resets state and keeps all writes outside codebase',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mess-deploy-test-'));
 let child;
 async function start(){
  const probe=require('node:net').createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),MESS_EPHEMERAL:'1',MESS_UPLOADS_DIR:dir},stdio:['ignore','pipe','pipe']});
  let output='';child.stderr.on('data',x=>output+=x);
  return await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Startup timeout: '+output)),15000);
   child.stdout.on('data',x=>{output+=x;const match=output.match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});
   child.once('exit',()=>{clearTimeout(timer);reject(new Error(output));});
  });
 }
 async function stop(){if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}}
 async function login(url){const r=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'student@iiitbh.ac.in',password:'mess2026'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
 try {
  let url=await start();let cookie=await login(url);
  const read=()=>fetch(url+'/api/student/dashboard',{headers:{cookie}}).then(r=>r.json());
  const baseline=await read();
  assert.equal(baseline.ephemeral,true);
  await fetch(url+'/api/student/top-up',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({amount:100})});
  assert.equal((await read()).balance,baseline.balance+100);
  const resetRoute=await fetch(url+'/api/test/reset',{method:'POST',headers:{cookie}});assert.notEqual(resetRoute.status,200);
  await stop();url=await start();cookie=await login(url);
  assert.equal((await read()).balance,baseline.balance);
 } finally {await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
