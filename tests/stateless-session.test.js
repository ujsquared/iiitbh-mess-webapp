const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createServer}=require('../server');

test('signed demo login works across independent instances without sharing databases',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mess-signed-session-'));
 const secret=crypto.randomBytes(32).toString('hex');
 const servers=[secret,secret,crypto.randomBytes(32).toString('hex')].map((sessionSecret,i)=>createServer({dbPath:':memory:',sessionSecret,testMode:true,uploadsDir:path.join(dir,String(i))}));
 const urls=[];
 try{
  for(const s of servers){await new Promise(r=>s.listen(0,'127.0.0.1',r));urls.push('http://127.0.0.1:'+s.address().port);}
  const login=await fetch(urls[0]+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'student@iiitbh.ac.in',password:'mess2026'})});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const other=await fetch(urls[1]+'/api/student/dashboard',{headers:{cookie}});
  assert.equal(other.status,200);assert.equal((await other.json()).user.role,'student');
  const wrong=await fetch(urls[2]+'/api/student/dashboard',{headers:{cookie}});assert.equal(wrong.status,401);
  const tampered=cookie.slice(0,-1)+(cookie.endsWith('a')?'b':'a');
  assert.equal((await fetch(urls[1]+'/api/student/dashboard',{headers:{cookie:tampered}})).status,401);
  const admin=await fetch(urls[1]+'/api/admin/overview',{headers:{cookie}});assert.equal(admin.status,403);
  const payload=Buffer.from(JSON.stringify({email:'student@iiitbh.ac.in',expires:Date.now()-1})).toString('base64url');
  const signature=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  assert.equal((await fetch(urls[1]+'/api/student/dashboard',{headers:{cookie:`sid=s1.${payload}.${signature}`}})).status,401);
  const logout=await fetch(urls[1]+'/api/logout',{method:'POST',headers:{cookie}});assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 }finally{for(const s of servers)await new Promise(r=>s.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
