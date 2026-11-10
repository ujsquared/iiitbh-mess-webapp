const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createServer } = require('../server');

let server, baseUrl, tempDir;
const cookieJar = new Map();

async function request(route, { method = 'GET', body, as = 'student' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookieJar.has(as)) headers.cookie = cookieJar.get(as);
  const response = await fetch(`${baseUrl}${route}`, { method, headers, body: body && JSON.stringify(body) });
  const cookie = response.headers.get('set-cookie');
  if (cookie) cookieJar.set(as, cookie.split(';')[0]);
  return { status: response.status, body: await response.json() };
}

async function login(as = 'student') {
  const credentials = as === 'admin'
    ? { email: 'admin@iiitbh.ac.in', password: 'mess2026' }
    : { email: 'student@iiitbh.ac.in', password: 'mess2026' };
  const result = await request('/api/login', { method: 'POST', body: credentials, as });
  assert.equal(result.status, 200);
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iiit-mess-test-'));
  server = createServer({ dbPath: path.join(tempDir, 'test.sqlite'), testMode: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(async () => {
  cookieJar.clear();
  await request('/api/test/reset', { method: 'POST', body: {} });
});

test('bulk meal-pack operations do not charge top-up amounts or reuse tokens', async () => {
  await login('student');
  const start=(await request('/api/student/dashboard')).body.nextWeekStart;
  const before=(await request('/api/student/dashboard')).body.balance;
const date=new Date(`${start}T00:00:00Z`);
  const anchorWeekday=date.getUTCDay();
  const wednesdayOffset=(3-anchorWeekday+7)%7;
  const wednesday=new Date(date);wednesday.setUTCDate(date.getUTCDate()+wednesdayOffset);const wedDate=wednesday.toISOString().slice(0,10);
  const friday=new Date(date);friday.setUTCDate(date.getUTCDate()+((5-anchorWeekday+7)%7));const friDate=friday.toISOString().slice(0,10);
  const sunday=new Date(date);sunday.setUTCDate(date.getUTCDate()+((0-anchorWeekday+7)%7));const sunDate=sunday.toISOString().slice(0,10);
  const items=[{date:start,meal:'breakfast',mealType:'veg'},{date:wedDate,meal:'lunch',mealType:'nonveg'},{date:friDate,meal:'dinner',mealType:'nonveg'},{date:sunDate,meal:'lunch',mealType:'nonveg'}];
  const pack=await request('/api/student/purchases/pack',{method:'POST',body:{weekStart:start,items}});
  assert.equal(pack.status,201);
  assert.equal(pack.body.total,items.reduce((total,item)=>total+(item.meal==='breakfast'?25:50),0));
  assert.equal(pack.body.balance,before-pack.body.total);
  const duplicate=await request('/api/student/purchases/pack',{method:'POST',body:{weekStart:start,items:[items[0]]}});
  assert.equal(duplicate.status,409);
});

test('weekly timetable uses visible img elements and confirms purchase before sending it', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.ok(app.includes('class="dish-photo" src='));
  assert.match(app,/Are you sure you want to buy these meals/);
});

test('same-day meals require explicit confirmation before purchase', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(app,/Are you sure you want to buy these meals/);
});

test('prepaid tickets render as scannable date-first cards with distinct meal, price and QR action', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const styles=fs.readFileSync(path.join(__dirname,'..','public','styles.css'),'utf8');
  assert.ok(app.includes('class="advance-ticket-date"'));
  assert.ok(app.includes('class="advance-ticket-meal"'));
  assert.ok(app.includes('class="advance-ticket-price"'));
  assert.ok(app.includes('class="advance-ticket-action"'));
  assert.ok(app.includes("Intl.DateTimeFormat('en-IN',{weekday:'short',day:'numeric',month:'short'"));
  assert.ok(styles.includes('.advance-token-grid{display:grid') || styles.includes('.advance-token-grid {display:grid'));
});

test('demo seed includes next-week meal reservations and redeemed-token activity', async () => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iiit-mess-demo-'));
  const seeded=createServer({dbPath:path.join(temp,'demo.sqlite')});
  await new Promise(resolve=>seeded.listen(0,'127.0.0.1',resolve));
  try {
    const credentials={email:'admin@iiitbh.ac.in',password:'mess2026'};
    const signIn=await fetch(`http://127.0.0.1:${seeded.address().port}/api/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(credentials)});
    const cookie=signIn.headers.get('set-cookie').split(';')[0];
    const overview=await fetch(`http://127.0.0.1:${seeded.address().port}/api/admin/overview`,{headers:{cookie}}).then(r=>r.json());
    assert.ok(overview.forecast.totalMeals>0);
    assert.ok(overview.recentRedemptions.length>0);
    assert.ok(overview.metrics.mealsServed>0);
  } finally {
    await new Promise(resolve=>seeded.close(resolve));
    fs.rmSync(temp,{recursive:true,force:true});
  }
});

test('admin photo editor keeps URLs and status hidden until explicitly editing', () => {
  const editor=fs.readFileSync(path.join(__dirname,'..','public','menu-editor.js'),'utf8');
  const styles=fs.readFileSync(path.join(__dirname,'..','public','menu-editor.css'),'utf8');
  assert.ok(editor.includes('class="menu-photo-preview"'));
  assert.ok(editor.includes('id="photoEditor" class="meal-photo-editor hidden"'));
  assert.ok(editor.includes('class="photo-url hidden"'));
  assert.ok(editor.includes('class="photo-status hidden"'));
  assert.ok(editor.includes('Edit photo'));
  assert.ok(!editor.includes('Preview loaded'));
  assert.ok(styles.includes('.admin-menu-timetable'));
});

test('admin weekly editor renders seven timetable rows with 27 editable meal cells', async () => {
  await login('admin');
  const data=(await request('/api/admin/overview',{as:'admin'})).body;
  const vm=require('node:vm');
  const editor=fs.readFileSync(path.join(__dirname,'..','public','menu-editor.js'),'utf8');
  const host={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>({addEventListener:()=>{}})};
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const context=vm.createContext({state:{menuDraft:null},structuredClone,safe});
  vm.runInContext(editor,context);
  context.renderAdminMenu(host,data);
  assert.ok(host.innerHTML.includes('class="admin-menu-timetable"'));
  assert.equal((host.innerHTML.match(/scope="row"/g)||[]).length,7);
  assert.equal((host.innerHTML.match(/data-edit-meal=/g)||[]).length,27);
  assert.equal((host.innerHTML.match(/<img /g)||[]).length,27);
  assert.ok(!host.innerHTML.includes('<input'));
  assert.ok(!host.innerHTML.includes('Not served'));
  assert.ok(host.innerHTML.includes('Poha · banana · chai'));
  assert.ok(editor.includes('id="mealEditForm"'));
  assert.ok(host.innerHTML.includes('id="discardMenu" disabled'));
});

test('admin kitchen forecast shows weekday and calendar date in separate columns', () => {
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.ok(app.includes('<th>DAY</th><th>DATE</th>'));
  assert.ok(app.includes('class="forecast-date">${safe(forecastDate)}'));
});

test('demo database seeds at least fifty student accounts without assigned student IDs', async () => {
  await login('admin');
  const result = await request('/api/admin/students', {as:'admin'});
  assert.equal(result.status, 200);
  assert.ok(result.body.students.length >= 50);
  assert.ok(result.body.students.filter(student => !student.student_id).length >= 47);
});

test('advance meal pack charges advance rates and appears in cooking forecast', async () => {
  await login('student');
  const dashboard = await request('/api/student/dashboard');
  assert.ok(dashboard.body.nextWeekStart);
const start=dashboard.body.nextWeekStart;
  const date=new Date(`${start}T00:00:00Z`); date.setUTCDate(date.getUTCDate()+2); const wedDate=date.toISOString().slice(0,10);
  const bought = await request('/api/student/purchases/pack', {method:'POST',body:{weekStart:start,items:[
    {date:start,meal:'breakfast',mealType:'veg'},
    {date:wedDate,meal:'lunch',mealType:'nonveg'}
  ]}});
  assert.equal(bought.status,201);
  assert.equal(bought.body.total,75);
  const adminLogin = await request('/api/logout',{method:'POST'});
  await login('admin');
  const overview = await request('/api/admin/overview',{as:'admin'});
  const bookingDay = overview.body.forecast.days.find(item=>item.date===start);
  const nonvegDay = overview.body.forecast.days.find(item=>item.date===wedDate);
  assert.equal(bookingDay.meals.breakfast,1);
  assert.equal(nonvegDay.meals.lunchNonveg,1);
  assert.ok(overview.body.forecast.totalMeals >= 2);
});

test('same-day walk-up purchase charges a premium but token redemption does not charge twice', async () => {
  await login('student');
  const before = (await request('/api/student/dashboard')).body.balance;
  const purchase = await request('/api/student/purchases/single',{method:'POST',body:{meal:'breakfast',mealType:'veg'}});
  assert.equal(purchase.status,201);
  assert.equal(purchase.body.price,32);
  assert.equal(purchase.body.balance,before-purchase.body.price);
  const code=purchase.body.token.code;
  await login('admin');
  const redeemed=await request('/api/admin/redeem',{method:'POST',body:{token:code},as:'admin'});
  assert.equal(redeemed.status,200);
  assert.equal(redeemed.body.charged,0);
});

test('non-vegetarian selection is only available for Wednesday Friday and Sunday', async () => {
  await login();
  const response=await request('/api/student/dashboard');
  assert.deepEqual(response.body.menu.filter(day=>day.nonvegLunch).map(day=>day.day),['Wednesday','Friday','Sunday']);
  assert.ok(response.body.menu.every(day=>day.photoLunch));
});

test('menu updates create student notifications', async () => {
  await login('admin');
  const overview=await request('/api/admin/overview',{as:'admin'});
  const menu=overview.body.menu.map(day=>({...day}));
  menu[0].breakfast += ' · updated';
  const saved=await request('/api/admin/menu',{method:'PUT',body:{menu},as:'admin'});
  assert.equal(saved.status,200);
  await login('student');
  const result=await request('/api/student/notifications');
  assert.ok(result.body.notifications.length >= 1);
  assert.match(result.body.notifications[0].message,/menu/i);
});

test('student can file a complaint with a verified image attachment', async () => {
  await login();
  const form=new FormData();
  form.set('category','Food quality'); form.set('message','The dal was cold at dinner.');
  form.set('image',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'evidence.png');
  const response=await fetch(`${baseUrl}/api/student/complaints`,{method:'POST',headers:{cookie:cookieJar.get('student')},body:form});
  const result=await response.json();
  assert.equal(response.status,201);
  assert.equal(result.complaint.category,'Food quality');
  assert.ok(result.complaint.imageUrl);
});

test('admin overview exposes a day-by-day cooking forecast and complaint count', async () => {
  await login('admin');
  const result=await request('/api/admin/overview',{as:'admin'});
  assert.equal(result.body.forecast.days.length,7);
  assert.equal(result.body.forecast.totalMeals,0);
  assert.equal(result.body.metrics.openComplaints,0);
  assert.ok(result.body.forecast.days.every(day=>Object.hasOwn(day.meals,'lunchNonveg')));
});

test('dark-mode preference control is available and student complaint routes are present', () => {
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(html,/id="themeToggle"/);
  assert.match(app,/themeToggle/);
  assert.match(app,/complaint/i);
});

test('project is pinned to Bun, retains pnpm compatibility, and removes npm lockfiles', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(manifest.packageManager || '', /^bun@/);
  assert.equal(fs.existsSync(path.join(root, 'bun.lock')), true);
  assert.equal(fs.existsSync(path.join(root, 'pnpm-lock.yaml')), true);
  assert.equal(fs.existsSync(path.join(root, 'package-lock.json')), false);
});

test('static assets are served without a duplicate response handler', async () => {
  const response = await fetch(`${baseUrl}/styles.css`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/css/);
  assert.match(await response.text(), /\.login-screen/);
});

test('started application server does not crash on static asset requests', async () => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let stderr=''; child.stderr.setEncoding('utf8'); child.stderr.on('data',chunk=>stderr+=chunk);
  try {
    let response;
    for (let i=0; i<30; i++) {
      try { response=await fetch(`http://127.0.0.1:${port}/styles.css`); break; }
      catch { if(child.exitCode!==null) break; await new Promise(resolve=>setTimeout(resolve,100)); }
    }
    assert.ok(response, `server did not respond: ${stderr}`);
    assert.equal(response.status,200);
    assert.match(await response.text(),/\.login-screen/);
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(child.exitCode,null,`server exited after a static request: ${stderr}`);
  } finally { child.kill('SIGTERM'); await new Promise(resolve=>child.once('exit',resolve)); }
});

test('student can sign in and sees prepaid balance and the seven-day menu', async () => {
  await login();
  const response = await request('/api/student/dashboard');
  assert.equal(response.status, 200);
  assert.equal(response.body.user.role, 'student');
  assert.ok(response.body.balance >= 0);
  assert.equal(response.body.menu.length, 7);
  assert.deepEqual(response.body.mealCosts, { breakfast: 30, lunch: 55, dinner: 55 });
});

test('a student cannot access admin operations', async () => {
  await login();
  const response = await request('/api/admin/overview');
  assert.equal(response.status, 403);
});

test('top-up updates the wallet and records a ledger entry', async () => {
  await login();
  const before = (await request('/api/student/dashboard')).body.balance;
  const result = await request('/api/student/top-up', { method: 'POST', body: { amount: 500 } });
  assert.equal(result.status, 200);
  assert.equal(result.body.balance, before + 500);
  assert.equal(result.body.transaction.type, 'topup');
});

test('meal token charges once when redeemed and cannot be reused', async () => {
  await login('student');
  const created = await request('/api/student/tokens', { method: 'POST', body: { meal: 'lunch' } });
  assert.equal(created.status, 201);
  const token = created.body.token.code;
  await login('admin');
  const redeemed = await request('/api/admin/redeem', { method: 'POST', body: { token }, as: 'admin' });
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.body.charged,0);
  const reused = await request('/api/admin/redeem', { method: 'POST', body: { token }, as: 'admin' });
  assert.equal(reused.status, 409);
});

test('snacks are optional wallet-priced add-ons', async () => {
  await login();
  const dashboard = await request('/api/student/dashboard');
  const before = dashboard.body.balance;
  const snack = dashboard.body.snacks.find(x => x.id === 'samosa');
  const result = await request(`/api/student/snacks/${snack.id}/purchase`, { method: 'POST', body: {} });
  assert.equal(result.status, 200);
  assert.equal(result.body.balance, before - snack.price);
  assert.equal(result.body.transaction.type, 'snack');
});

test('menu update reports notices actually created for seeded students', async () => {
  await login('admin');
  const overview=await request('/api/admin/overview',{as:'admin'});
  const menu=overview.body.menu.map(x=>({...x}));menu[0].breakfast+=' · notice test';
  const saved=await request('/api/admin/menu',{method:'PUT',body:{menu},as:'admin'});
  assert.equal(saved.status,200);
  assert.equal(saved.body.notificationsSent,55);
});

test('meal QR endpoint only returns QR images to the owning student', async () => {
  await login('student');
  const tokenResult = await request('/api/student/tokens', {method:'POST',body:{meal:'breakfast'}});
  const code = tokenResult.body.token.code;
  const image = await fetch(`${baseUrl}/api/student/tokens/${code}/qr`, {headers:{cookie:cookieJar.get('student')}});
  assert.equal(image.status,200);
  assert.match(image.headers.get('content-type'),/image\/png/);
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const denied = await fetch(`${baseUrl}/api/student/tokens/${code}/qr`);
  assert.equal(denied.status,401);
});

test('insufficient wallet funds prevent meal-token creation', async () => {
  await request('/api/test/set-balance', { method: 'POST', body: { amount: 10 } });
  await login();
  const created = await request('/api/student/tokens', { method: 'POST', body: { meal: 'dinner' } });
  assert.equal(created.status, 402);
  assert.match(created.body.error, /balance/i);
});
