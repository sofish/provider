import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyJWT } from '../utils/jwt.js';

export function createAdminPages(jwtSecret: string) {
  const app = new Hono();

  // GET /admin — login page or redirect to dashboard
  app.get('/', async (c) => {
    const token = getCookie(c, 'admin_token');
    if (token) {
      const payload = await verifyJWT(token, jwtSecret);
      if (payload) {
        return c.redirect('/admin/dashboard');
      }
    }
    return c.html(loginPage());
  });

  // GET /admin/dashboard — protected dashboard
  app.get('/dashboard', async (c) => {
    const token = getCookie(c, 'admin_token');
    if (!token) return c.redirect('/admin');

    const payload = await verifyJWT(token, jwtSecret);
    if (!payload) return c.redirect('/admin');

    return c.html(dashboardPage());
  });

  return app;
}

function loginPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e5e5e5;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#171717;border:1px solid #262626;border-radius:12px;padding:40px;width:100%;max-width:400px}
h1{font-size:24px;margin-bottom:8px;color:#fff}
p.sub{color:#737373;margin-bottom:32px;font-size:14px}
label{display:block;font-size:13px;color:#a3a3a3;margin-bottom:6px}
input{width:100%;padding:10px 12px;background:#0a0a0a;border:1px solid #262626;border-radius:8px;color:#e5e5e5;font-size:14px;outline:none}
input:focus{border-color:#525252}
button{width:100%;padding:10px;background:#fff;color:#0a0a0a;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:20px}
button:hover{background:#d4d4d4}
button:disabled{opacity:.5;cursor:not-allowed}
.error{color:#ef4444;font-size:13px;margin-top:12px;display:none}
</style>
</head>
<body>
<div class="card">
  <h1>Provider Proxy</h1>
  <p class="sub">Enter admin password to continue</p>
  <form id="loginForm">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required>
    <button type="submit" id="btn">Sign in</button>
    <div class="error" id="error"></div>
  </form>
</div>
<script>
document.getElementById('loginForm').addEventListener('submit', async(e)=>{
  e.preventDefault();
  const btn=document.getElementById('btn');
  const err=document.getElementById('error');
  btn.disabled=true; err.style.display='none';
  try{
    const res=await fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('password').value})});
    if(res.ok){window.location.href='/admin/dashboard'}
    else{const d=await res.json();err.textContent=d.error||'Login failed';err.style.display='block'}
  }catch(ex){err.textContent='Network error';err.style.display='block'}
  finally{btn.disabled=false}
});
</script>
</body>
</html>`;
}

function dashboardPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e5e5e5;min-height:100vh}
.container{max-width:960px;margin:0 auto;padding:24px 16px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px}
h1{font-size:22px;color:#fff}
.logout{background:none;border:1px solid #333;color:#a3a3a3;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px}
.logout:hover{border-color:#525252;color:#e5e5e5}
section{margin-bottom:40px}
h2{font-size:17px;color:#fff;margin-bottom:16px}
table{width:100%;border-collapse:collapse;background:#171717;border:1px solid #262626;border-radius:8px;overflow:hidden}
th,td{padding:10px 14px;text-align:left;font-size:13px;border-bottom:1px solid #262626}
th{background:#1a1a1a;color:#a3a3a3;font-weight:500}
td{color:#d4d4d4}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.badge.on{background:#064e3b;color:#34d399}
.badge.off{background:#451a03;color:#fbbf24}
.badge.cooldown{background:#4c1d95;color:#a78bfa}
.actions button{background:none;border:1px solid #333;color:#a3a3a3;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;margin-right:4px}
.actions button:hover{border-color:#525252;color:#e5e5e5}
.actions button.danger{border-color:#7f1d1d;color:#f87171}
.actions button.danger:hover{border-color:#dc2626}
.create-form{background:#171717;border:1px solid #262626;border-radius:8px;padding:16px;margin-bottom:16px}
.create-form .row{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.create-form .row:last-child{margin-bottom:0}
.create-form input,.create-form select{padding:8px 12px;background:#0a0a0a;border:1px solid #262626;border-radius:6px;color:#e5e5e5;font-size:13px;outline:none}
.create-form input:focus,.create-form select:focus{border-color:#525252}
.create-form select{min-width:120px}
.create-form input.flex{flex:1;min-width:120px}
.create-form input.short{width:80px}
.create-form button{padding:8px 16px;background:#fff;color:#0a0a0a;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.create-form button:hover{background:#d4d4d4}
.key-reveal{background:#171717;border:1px solid #262626;border-radius:8px;padding:16px;margin-bottom:16px;display:none}
.key-reveal .key{font-family:monospace;font-size:13px;word-break:break-all;color:#34d399;margin:8px 0}
.key-reveal .warn{color:#fbbf24;font-size:12px}
.key-reveal button{margin-top:8px;padding:6px 14px;background:#262626;color:#e5e5e5;border:none;border-radius:4px;cursor:pointer;font-size:12px}
.edit-input{padding:4px 8px;background:#0a0a0a;border:1px solid #333;border-radius:4px;color:#e5e5e5;font-size:12px;width:100%;outline:none}
.edit-input:focus{border-color:#525252}
.empty{padding:24px;text-align:center;color:#525252;font-size:13px}
.mono{font-family:monospace;font-size:12px}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Provider Proxy Admin</h1>
    <button class="logout" onclick="logout()">Sign out</button>
  </header>

  <section>
    <h2>Provider Instances</h2>
    <div class="create-form">
      <div class="row">
        <select id="instType">
          <option value="openai">openai</option>
          <option value="anthropic">anthropic</option>
          <option value="gemini">gemini</option>
          <option value="codex">codex</option>
        </select>
        <input class="flex" type="text" id="instName" placeholder="Name (e.g. openai-key-1)">
        <input class="flex" type="password" id="instApiKey" placeholder="API Key">
      </div>
      <div class="row">
        <input class="flex" type="text" id="instBaseUrl" placeholder="Base URL (auto-filled by type)">
        <input class="short" type="number" id="instWeight" placeholder="Weight" value="1" min="1">
        <input class="short" type="number" id="instCooldown" placeholder="CD(s)" value="60" min="0">
        <button onclick="createInst()">Add Instance</button>
      </div>
    </div>
    <table>
      <thead><tr><th>Type</th><th>Name</th><th>Base URL</th><th>API Key</th><th>W</th><th>CD</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="instances"><tr><td colspan="8" class="empty">Loading...</td></tr></tbody>
    </table>
  </section>

  <section>
    <h2>Usage Summary</h2>
    <div class="create-form" style="margin-bottom:12px">
      <div class="row">
        <select id="summaryDays" onchange="loadSummary()">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="">All time</option>
        </select>
      </div>
    </div>
    <table>
      <thead><tr><th>Provider</th><th>Model</th><th>Requests</th><th>Prompt Tokens</th><th>Completion Tokens</th><th>Total Tokens</th><th>Cost</th></tr></thead>
      <tbody id="usageSummary"><tr><td colspan="7" class="empty">Loading...</td></tr></tbody>
    </table>
  </section>

  <section>
    <h2>Request Logs</h2>
    <div class="create-form" style="margin-bottom:12px">
      <div class="row">
        <select id="logProvider" onchange="loadLogs()">
          <option value="">All providers</option>
          <option value="openai">openai</option>
          <option value="anthropic">anthropic</option>
          <option value="gemini">gemini</option>
          <option value="codex">codex</option>
        </select>
        <input class="flex" type="text" id="logModel" placeholder="Filter by model..." oninput="debouncedLoadLogs()">
        <input type="date" id="logStart" onchange="loadLogs()" style="padding:8px 12px;background:#0a0a0a;border:1px solid #262626;border-radius:6px;color:#e5e5e5;font-size:13px">
        <input type="date" id="logEnd" onchange="loadLogs()" style="padding:8px 12px;background:#0a0a0a;border:1px solid #262626;border-radius:6px;color:#e5e5e5;font-size:13px">
      </div>
    </div>
    <table>
      <thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>Tokens (P/C/T)</th><th>Cost</th><th>Duration</th><th>Stream</th><th>Status</th></tr></thead>
      <tbody id="requestLogs"><tr><td colspan="8" class="empty">Loading...</td></tr></tbody>
    </table>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
      <span id="logPagination" style="color:#737373;font-size:13px"></span>
      <div>
        <button class="logout" id="logPrev" onclick="logsPage(-1)" style="margin-right:4px" disabled>&larr; Prev</button>
        <button class="logout" id="logNext" onclick="logsPage(1)">Next &rarr;</button>
      </div>
    </div>
  </section>

  <section>
    <h2>API Keys</h2>
    <div class="create-form">
      <div class="row">
        <input class="flex" type="text" id="keyName" placeholder="Key name (e.g. dev-laptop)">
        <button onclick="createKey()">Create Key</button>
      </div>
    </div>
    <div class="key-reveal" id="keyReveal">
      <div><strong>New API key created</strong></div>
      <div class="key" id="newKey"></div>
      <div class="warn">Copy this key now — it won't be shown again.</div>
      <button onclick="copyKey()">Copy to clipboard</button>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last Used</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="apiKeys"><tr><td colspan="6" class="empty">Loading...</td></tr></tbody>
    </table>
  </section>
</div>

<script>
const api=(path,opts)=>fetch(path,{...opts,headers:{'Content-Type':'application/json',...(opts?.headers||{})}});

const defaultUrls={openai:'https://api.openai.com',anthropic:'https://api.anthropic.com',gemini:'https://generativelanguage.googleapis.com',codex:'https://api.openai.com'};

document.getElementById('instType').addEventListener('change',function(){
  document.getElementById('instBaseUrl').placeholder=defaultUrls[this.value]||'Base URL';
});

async function loadInstances(){
  const res=await api('/v1/config/providers');
  if(res.status===401){window.location.href='/admin';return}
  const{instances}=await res.json();
  const tb=document.getElementById('instances');
  if(!instances||!instances.length){tb.innerHTML='<tr><td colspan="8" class="empty">No instances configured</td></tr>';return}
  tb.innerHTML=instances.map(i=>{
    const now=new Date();
    const inCooldown=i.cooldownUntil&&new Date(i.cooldownUntil+'Z')>now;
    let statusBadge;
    if(!i.enabled) statusBadge='<span class="badge off">disabled</span>';
    else if(inCooldown) statusBadge='<span class="badge cooldown">cooldown</span>';
    else statusBadge='<span class="badge on">active</span>';

    const cdInfo=inCooldown?'<br><span class="mono" style="color:#a78bfa;font-size:11px">until '+i.cooldownUntil+'</span>':'';

    return '<tr>'
      +'<td><strong>'+esc(i.type)+'</strong></td>'
      +'<td>'+esc(i.name||i.id)+'</td>'
      +'<td><input class="edit-input" value="'+esc(i.baseUrl||'')+'" onchange="updateInst(\\''+i.id+'\\',{base_url:this.value})"></td>'
      +'<td><input class="edit-input" type="password" placeholder="\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022" onchange="updateInst(\\''+i.id+'\\',{api_key:this.value})"></td>'
      +'<td class="mono">'+i.weight+'</td>'
      +'<td class="mono">'+i.cooldownSeconds+'s'+cdInfo+'</td>'
      +'<td>'+statusBadge+'</td>'
      +'<td class="actions">'
        +'<button onclick="toggleInst(\\''+i.id+'\\','+(!i.enabled)+')">'+(i.enabled?'Disable':'Enable')+'</button>'
        +(inCooldown?'<button onclick="clearCD(\\''+i.id+'\\')">Clear CD</button>':'')
        +'<button class="danger" onclick="deleteInst(\\''+i.id+'\\')">Delete</button>'
      +'</td>'
      +'</tr>'
  }).join('');
}

async function createInst(){
  const type=document.getElementById('instType').value;
  const name=document.getElementById('instName').value.trim();
  const apiKey=document.getElementById('instApiKey').value;
  const baseUrl=document.getElementById('instBaseUrl').value.trim()||undefined;
  const weight=parseInt(document.getElementById('instWeight').value)||1;
  const cooldown=parseInt(document.getElementById('instCooldown').value)||60;
  await api('/v1/config/providers',{method:'POST',body:JSON.stringify({type,name,api_key:apiKey,base_url:baseUrl,weight,cooldown_seconds:cooldown})});
  document.getElementById('instName').value='';
  document.getElementById('instApiKey').value='';
  document.getElementById('instBaseUrl').value='';
  document.getElementById('instWeight').value='1';
  document.getElementById('instCooldown').value='60';
  loadInstances();
}

async function updateInst(id,data){
  await api('/v1/config/providers/'+id,{method:'PUT',body:JSON.stringify(data)});
  loadInstances();
}

async function toggleInst(id,enabled){
  await api('/v1/config/providers/'+id,{method:'PUT',body:JSON.stringify({enabled})});
  loadInstances();
}

async function clearCD(id){
  await api('/v1/config/providers/'+id+'/cooldown',{method:'POST',body:JSON.stringify({clear:true})});
  loadInstances();
}

async function deleteInst(id){
  if(!confirm('Delete this instance?'))return;
  await api('/v1/config/providers/'+id,{method:'DELETE'});
  loadInstances();
}

async function loadKeys(){
  const res=await api('/v1/config/api-keys');
  if(res.status===401){window.location.href='/admin';return}
  const{keys}=await res.json();
  const tb=document.getElementById('apiKeys');
  if(!keys.length){tb.innerHTML='<tr><td colspan="6" class="empty">No API keys yet</td></tr>';return}
  tb.innerHTML=keys.map(k=>{
    const badge=k.enabled?'<span class="badge on">active</span>':'<span class="badge off">revoked</span>';
    const lastUsed=k.last_used_at?new Date(k.last_used_at).toLocaleDateString():'Never';
    return '<tr>'
      +'<td>'+esc(k.name)+'</td>'
      +'<td><code>'+esc(k.prefix)+'</code></td>'
      +'<td>'+new Date(k.created_at).toLocaleDateString()+'</td>'
      +'<td>'+lastUsed+'</td>'
      +'<td>'+badge+'</td>'
      +'<td class="actions">'
        +'<button onclick="toggleKey(\\''+k.id+'\\','+(!k.enabled)+')">'+(k.enabled?'Disable':'Enable')+'</button>'
        +'<button class="danger" onclick="deleteKey(\\''+k.id+'\\')">Delete</button>'
      +'</td>'
      +'</tr>'
  }).join('');
}

async function createKey(){
  const name=document.getElementById('keyName').value.trim()||'Unnamed key';
  const res=await api('/v1/config/api-keys',{method:'POST',body:JSON.stringify({name})});
  const data=await res.json();
  document.getElementById('newKey').textContent=data.key;
  document.getElementById('keyReveal').style.display='block';
  document.getElementById('keyName').value='';
  loadKeys();
}

function copyKey(){
  navigator.clipboard.writeText(document.getElementById('newKey').textContent);
}

async function toggleKey(id,enabled){
  await api('/v1/config/api-keys/'+id,{method:'PATCH',body:JSON.stringify({enabled})});
  loadKeys();
}

async function deleteKey(id){
  if(!confirm('Delete this API key?'))return;
  await api('/v1/config/api-keys/'+id,{method:'DELETE'});
  loadKeys();
}

async function logout(){
  await api('/admin/logout',{method:'POST'});
  window.location.href='/admin';
}

function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

let logOffset=0;const logLimit=20;let logTotal=0;

async function loadSummary(){
  const days=document.getElementById('summaryDays').value;
  const q=days?'?days='+days:'';
  const res=await api('/v1/config/logs/summary'+q);
  if(res.status===401){window.location.href='/admin';return}
  const{summary}=await res.json();
  const tb=document.getElementById('usageSummary');
  if(!summary||!summary.length){tb.innerHTML='<tr><td colspan="7" class="empty">No usage data yet</td></tr>';return}
  tb.innerHTML=summary.map(r=>'<tr>'
    +'<td><strong>'+esc(r.provider)+'</strong></td>'
    +'<td>'+esc(r.model)+'</td>'
    +'<td class="mono">'+num(r.requests)+'</td>'
    +'<td class="mono">'+num(r.prompt_tokens)+'</td>'
    +'<td class="mono">'+num(r.completion_tokens)+'</td>'
    +'<td class="mono">'+num(r.total_tokens)+'</td>'
    +'<td class="mono">$'+cost(r.cost)+'</td>'
    +'</tr>').join('');
}

async function loadLogs(){
  const provider=document.getElementById('logProvider').value;
  const model=document.getElementById('logModel').value.trim();
  const startDate=document.getElementById('logStart').value;
  const endDate=document.getElementById('logEnd').value;
  const params=new URLSearchParams();
  params.set('limit',logLimit);
  params.set('offset',logOffset);
  if(provider)params.set('provider',provider);
  if(model)params.set('model',model);
  if(startDate)params.set('start_date',startDate);
  if(endDate)params.set('end_date',endDate);
  const res=await api('/v1/config/logs?'+params);
  if(res.status===401){window.location.href='/admin';return}
  const data=await res.json();
  logTotal=data.total;
  const tb=document.getElementById('requestLogs');
  const logs=data.logs;
  if(!logs||!logs.length){tb.innerHTML='<tr><td colspan="8" class="empty">No request logs</td></tr>';updateLogPagination();return}
  tb.innerHTML=logs.map(l=>{
    const t=l.created_at?new Date(l.created_at+'Z').toLocaleString():'—';
    const statusCls=l.status>=400?'color:#f87171':l.status>=300?'color:#fbbf24':'color:#34d399';
    return '<tr>'
      +'<td style="white-space:nowrap">'+t+'</td>'
      +'<td><strong>'+esc(l.provider)+'</strong></td>'
      +'<td>'+esc(l.model)+'</td>'
      +'<td class="mono">'+num(l.prompt_tokens)+' / '+num(l.completion_tokens)+' / '+num(l.total_tokens)+'</td>'
      +'<td class="mono">$'+cost(l.cost)+'</td>'
      +'<td class="mono">'+l.duration_ms+'ms</td>'
      +'<td>'+(l.stream?'Yes':'No')+'</td>'
      +'<td style="'+statusCls+'">'+l.status+'</td>'
      +'</tr>'
  }).join('');
  updateLogPagination();
}

function updateLogPagination(){
  const pg=document.getElementById('logPagination');
  const from=logTotal>0?logOffset+1:0;
  const to=Math.min(logOffset+logLimit,logTotal);
  pg.textContent=from+'-'+to+' of '+logTotal;
  document.getElementById('logPrev').disabled=logOffset===0;
  document.getElementById('logNext').disabled=logOffset+logLimit>=logTotal;
}

function logsPage(dir){
  logOffset=Math.max(0,logOffset+dir*logLimit);
  loadLogs();
}

let _logTimer;
function debouncedLoadLogs(){clearTimeout(_logTimer);_logTimer=setTimeout(()=>{logOffset=0;loadLogs()},300)}

function num(n){return n!=null?Number(n).toLocaleString():'0'}
function cost(n){return n!=null?Number(n).toFixed(6):'0.000000'}

loadInstances();
loadKeys();
loadSummary();
loadLogs();
</script>
</body>
</html>`;
}
