/* Run: node docs/test-webchat-history-layout.cjs
 * Uses installed Edge + project React/TypeScript. No server login or dependencies.
 * This is a mobile-width Chromium layout test, not a real iOS Safari test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../crm-fronend');
const frontendRequire = createRequire(path.join(root, 'package.json'));
const ts = frontendRequire('typescript');
const WebSocket = frontendRequire('ws');
const edge = process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const productionModule = (name, file) => fs.readFileSync(path.join(path.dirname(frontendRequire.resolve(`${name}/package.json`)), 'cjs', file), 'utf8');
const modules = {
  react: productionModule('react', 'react.production.js'),
  'react/jsx-runtime': productionModule('react', 'react-jsx-runtime.production.js'),
  'react-dom': productionModule('react-dom', 'react-dom.production.js'),
  'react-dom/client': productionModule('react-dom', 'react-dom-client.production.js'),
  scheduler: productionModule('scheduler', 'scheduler.production.js'),
  diagnostics: ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/webchats/HistoryDiagnostics.jsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText,
  history: ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/webchats/historyScroll.js'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
};
const bundle = `const process={env:{NODE_ENV:'production'}};const modules={${Object.entries(modules).map(([name, code]) => `${JSON.stringify(name)}:function(module,exports,require){${code}\n}`).join(',')}};const cache={};function require(name){if(cache[name])return cache[name].exports;const module=cache[name]={exports:{}};modules[name](module,module.exports,require);return module.exports;}`;
const fixture = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}</style><div id="root"></div><script>${bundle.replaceAll('</script', '<\\/script')}
const React=require('react'),{createRoot}=require('react-dom/client'),{flushSync}=require('react-dom');
const {default:HistoryDiagnostics,createHistoryDiagnostics}=require('diagnostics');
const {captureHistoryAnchor,restoreHistoryAnchor,observeHistoryAnchor}=require('history');
const store=createHistoryDiagnostics();let parentRenders=0;
const makePage=start=>Array.from({length:30},(_,index)=>({id:start+index,height:40+((start+index)%7)*13}));
let updateMessages,pendingAnchor,stopFollowing=()=>{};const corrections=[],historyCases=[];
function MessageHistory(){
 const [messages,setMessages]=React.useState(()=>makePage(90));updateMessages=setMessages;
 React.useLayoutEffect(()=>{if(!pendingAnchor)return;const saved=pendingAnchor;pendingAnchor=null;const container=document.getElementById('messages');stopFollowing();restoreHistoryAnchor(container,saved);stopFollowing=observeHistoryAnchor(container,document.getElementById('history-content'),saved,result=>corrections.push(result));return()=>stopFollowing();},[messages]);
 return React.createElement('div',{id:'history-content'},messages.map(message=>React.createElement('div',{key:message.id,'data-message-id':String(message.id),style:{height:message.height}},'Message '+message.id)));
}
function App(){parentRenders++;return React.createElement('div',{style:{height:700,width:'100%',display:'flex',flexDirection:'column'}},React.createElement('div',{id:'messages',style:{flex:1,minHeight:0,overflow:'auto',overflowAnchor:'none',scrollBehavior:'auto'}},React.createElement(MessageHistory)),React.createElement('div',{style:{position:'relative',flexShrink:0}},React.createElement(HistoryDiagnostics,{store})),React.createElement('div',{style:{height:72,flexShrink:0}},'Composer'));}
flushSync(()=>createRoot(document.getElementById('root')).render(React.createElement(App)));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const measurements=[];const errors=[];
function measure(stage){const node=document.getElementById('messages');measurements.push({stage,height:node.clientHeight,width:node.clientWidth,parentRenders});}
function anchorError(container,saved){const node=Array.from(container.querySelectorAll('[data-message-id]')).find(item=>item.dataset.messageId===saved.messageId);return node.getBoundingClientRect().top-container.getBoundingClientRect().top-saved.offset;}
async function historyRegression(){
 const container=document.getElementById('messages');
 for(let page=1;page<=3;page++){
  stopFollowing();container.scrollTop=200+page*31;await wait(30);
  const saved=captureHistoryAnchor(container);pendingAnchor=saved;
  flushSync(()=>updateMessages(previous=>[...makePage(90-page*30),...previous]));await wait(40);
  historyCases.push({stage:'prepend-'+page,anchorErrorPx:anchorError(container,saved),count:container.querySelectorAll('[data-message-id]').length});
  const first=container.querySelector('[data-message-id]');const correctionsBefore=corrections.length;
  first.style.height=(first.getBoundingClientRect().height+57)+'px';await wait(50);
  historyCases.push({stage:'stationary-media-'+page,anchorErrorPx:anchorError(container,saved),correctionCount:corrections.length-correctionsBefore});
  container.scrollTop+=145;container.dispatchEvent(new Event('scroll'));await wait(20);
  const userTop=container.scrollTop;const correctionCount=corrections.length;
  first.style.height=(first.getBoundingClientRect().height+61)+'px';await wait(50);
  historyCases.push({stage:'media-after-user-scroll-'+page,scrollErrorPx:container.scrollTop-userTop,correctionCount:corrections.length-correctionCount});
 }
 stopFollowing();
}
async function run(){
 measure('baseline');
 for(const phase of ['request','waiting for React commit','ready']){store.publish({phase,elapsedMs:999999,events:[]});await wait(280);measure('closed:'+phase);}
 document.querySelector('button[aria-expanded]').click();await wait(30);measure('opened');
 for(const phase of ['waiting for React commit','DOM committed','ready']){store.publish({phase,elapsedMs:999999,events:[]});await wait(280);measure('opened:'+phase);if(!document.querySelector('textarea').value.includes(phase))errors.push('snapshot missing '+phase);}
 document.querySelector('button[aria-expanded]').click();await wait(30);measure('closed-again');
 store.reset();await wait(30);measure('reset');
 await historyRegression();
 await fetch('/result',{method:'POST',body:JSON.stringify({measurements,historyCases,parentRenders,errors,viewportWidth:innerWidth})});
}run().catch(error=>fetch('/result',{method:'POST',body:JSON.stringify({error:String(error),stack:error.stack})}));
</script>`;

async function main() {
  assert.ok(fs.existsSync(edge), `Edge not found: ${edge}`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'webchat-layout-edge-'));
  let resolveResult;
  const resultPromise = new Promise(resolve => { resolveResult = resolve; });
  const server = http.createServer((req, res) => {
    if (req.url === '/result') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => { resolveResult(JSON.parse(body)); res.end('ok'); });
    } else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  let timeout;
  try {
    const browserUrl = await new Promise((resolve, reject) => {
      let output = '';
      const startupTimeout = setTimeout(() => reject(new Error('Edge debugging startup timed out')), 15000);
      child.on('error', reject);
      child.stderr.on('data', chunk => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(startupTimeout); resolve(match[1]); }
      });
    });
    const browserAddress = new URL(browserUrl);
    const pages = await fetch(`http://${browserAddress.host}/json/list`).then(response => response.json());
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.on('open', resolve); socket.on('error', reject); });
    let requestId = 0;
    const pending = new Map();
    socket.on('message', raw => {
      const message = JSON.parse(raw);
      const callback = pending.get(message.id);
      if (callback) { pending.delete(message.id); message.error ? callback.reject(new Error(JSON.stringify(message.error))) : callback.resolve(message.result); }
    });
    const command = (method, params) => new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await command('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    const result = await Promise.race([resultPromise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Browser test timed out')), 20000); })]);
    assert.equal(result.error, undefined, result.stack);
    assert.equal(result.viewportWidth, 390);
    assert.equal(result.parentRenders, 1, 'diagnostics publication must not rerender the chat');
    assert.deepEqual(result.errors, []);
    for (const measurement of result.measurements) {
      assert.equal(measurement.width, 390, measurement.stage);
      assert.equal(measurement.height, 600, `${measurement.stage}: diagnostics changed the message viewport`);
      assert.equal(measurement.parentRenders, 1, measurement.stage);
    }
    assert.equal(result.historyCases.length, 9);
    for (const entry of result.historyCases) {
      if ('anchorErrorPx' in entry) assert.ok(Math.abs(entry.anchorErrorPx) <= 0.5, JSON.stringify(entry));
      if (entry.stage.startsWith('prepend-')) assert.equal(entry.count, 30 + Number(entry.stage.split('-')[1]) * 30);
      if (entry.stage.startsWith('stationary-media-')) assert.ok(entry.correctionCount >= 1, JSON.stringify(entry));
      if (entry.stage.startsWith('media-after-user-scroll-')) {
        assert.equal(entry.scrollErrorPx, 0, JSON.stringify(entry));
        assert.equal(entry.correctionCount, 0, JSON.stringify(entry));
      }
    }
    console.log(JSON.stringify({ status: 'PASS', browser: 'Edge mobile emulation', ...result }, null, 2));
  } finally {
    clearTimeout(timeout);
    socket?.close();
    child.kill();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    // Only remove the unique profile created by this test, never a real profile.
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    assert.ok(path.basename(profile).startsWith('webchat-layout-edge-'));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }); } catch { /* Edge may still be releasing profile files. */ }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
