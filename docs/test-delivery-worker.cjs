process.chdir('C:/Users/User/Desktop/Projects/MobileApp/mobile-app');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require("C:/Users/User/Desktop/Projects/MobileApp/mobile-app/node_modules/typescript");
const flush = async () => { for (let i = 0; i < 150; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };

function harness(initial) {
  let now = 1800000000000, maxActive = 0, networkGate, online = true, netListener, account = "1";
  const acknowledgements = [];
  const storage = new Map([['app:outbox_v1', JSON.stringify(initial)]]);
  const active = new Map(), started = [], events = [], timers = new Map(), cleanup = [];
  class Clock extends Date { constructor(...args) {super(...(args.length ? args : [now]));} static now() {return now;} }
  function send(id, type) {
    assert.ok(!active.has(id), `duplicate send ${id}`);
    const gate = deferred(); active.set(id, gate); started.push({id,type});
    maxActive = Math.max(maxActive, active.size);
    return gate.promise;
  }
  const mocks = {
    '@react-native-async-storage/async-storage': {getItem: async key => storage.get(key) ?? null, setItem: async (key,value) => storage.set(key,value)},
    '@react-native-community/netinfo': {fetch: async () => {if(networkGate) await networkGate.promise; return {isConnected:online};}, addEventListener: fn => {netListener=fn;return () => {netListener=null}}},
    react: {useEffect: fn => {const release=fn();if(release)cleanup.push(release);}},
    'react-native': {AppState: {addEventListener: () => ({remove(){}})}},
    './chatCacheScope': {getChatCacheAccount: () => account},
    './messageCache': {cacheAcknowledgedMessage: async (key, row) => acknowledgements.push({key,row})},
    './api': {post: async (_url,payload) => ({data: await send(payload.clientId,'text')})},
    './upload': {uploadFile: (...args) => send(args[7],args[3])},
    './networkDebugProfile': {applyNetworkDebugDelay: async () => {}},
    './networkMetrics': new Proxy({markNetworkScenarioStep: (step,payload) => events.push({step,...payload}), classifyError: () => ({reason:'network'})}, {get: (target,key) => target[key] ?? (()=>{})}),
  };
  const modules = new Map(); let timerId=0;
  function load(file) {
    file=path.resolve(file);if(modules.has(file))return modules.get(file).exports;
    const mod={exports:{}};modules.set(file,mod);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
    vm.runInNewContext(code,{module:mod,exports:mod.exports,require:name=>name in mocks?mocks[name]:load(path.join(path.dirname(file),name+'.ts')),
      console:{log(){},warn(){},error(){}},Date:Clock,Promise,Set,Map,Math,
      setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
    return mod.exports;
  }
  const worker=load('services/outboxWorker.ts'),outbox=load('services/outbox.ts');
  return {worker,outbox,active,started,events,acknowledgements,
    network:async value=>{online=value;netListener?.({isConnected:value});await flush();},
    account:value=>{account=value;},
    subscribe:fn=>{worker.useOutboxWorker(fn,"test-token");return cleanup.pop();},
    start:async()=>{worker.useAppOutboxWorker('test-token',1);await flush();},
    queue:async messages=>{await outbox.saveOutbox([...(await outbox.loadOutbox()),...messages]);await flush();},
    finish:async(id,error)=>{const gate=active.get(id);assert.ok(gate,`not active: ${id}`);active.delete(id);error?gate.reject(error):gate.resolve({id:started.length,clientId:id});await flush();},
    tick:async()=>{now+=60000;const [id,fn]=timers.entries().next().value;timers.delete(id);await fn();await flush();},
    holdNetwork:()=>{networkGate=deferred();return()=>{const gate=networkGate;networkGate=null;gate.resolve();};},
    stop:()=>cleanup.reverse().forEach(fn=>fn()),
    max:()=>maxActive,
  };
}
const message=(clientId,type)=>({clientId,type,id:-1,content:'test',roomId:1,userId:1,mediaUrl:type==='text'?null:'file:///fixture',deliveryStatus:'pending',createdAt:'2027-01-01T00:00:00Z'});
const ids=h=>[...h.active.keys()];

(async()=>{
  {
    const h=harness([{...message('old-failed','text'),deliveryStatus:'failed',content:'x'.repeat(1000000)},message('next-text','text')]);
    await h.start();assert.deepEqual(ids(h),['next-text']);await h.finish('next-text');await h.tick();
    assert.equal(h.started.length,1,'failed message never retried or blocks new sends');h.stop();
  }
  {
    const h=harness([{...message('offline-final-attempt','text'),tries:4}]);await h.start();await h.network(false);
    await h.finish('offline-final-attempt',new Error('Network request failed'));
    const row=(await h.outbox.loadOutbox())[0];assert.equal(row.deliveryStatus,'pending');assert.equal(row.tries,4);
    await h.queue([message('new-message','text')]);await h.network(true);
    assert.deepEqual(ids(h),['new-message']);await h.finish('new-message');h.stop();
  }

  {
    // App is on the common screen: no chat/UI subscriber exists.
    const h=harness([message('offline-room','text'),{...message('offline-boss','audio'),roomId:undefined,chatId:3}, {...message('other-account','text'),userId:2}]);
    await h.network(false);await h.start();assert.equal(h.started.length,0);
    let screenCalls=0;const leaveChat=h.subscribe(()=>screenCalls++);leaveChat();
    await h.network(true);assert.deepEqual(ids(h),['offline-room']);
    await h.finish('offline-room');assert.deepEqual(ids(h),['offline-boss']);
    await h.finish('offline-boss');assert.equal(h.started.length,2);assert.equal(screenCalls,0);
    assert.equal((await h.outbox.loadOutbox())[0].clientId,'other-account');
    assert.deepEqual(h.acknowledgements.map(x=>x.key),[1,'boss:1:3','boss-folder:1:3:1']);
    h.stop();await h.worker.triggerOutboxProcessing('test-token');assert.equal(h.started.length,2);
  }

  {
    const h=harness([message('image','image')]);await h.start();
    await h.queue([message('voice','audio'),message('text','text')]);
    assert.deepEqual(ids(h),['image']);
    await h.finish('image');assert.deepEqual(ids(h),['text']);
    await h.finish('text');assert.deepEqual(ids(h),['voice']);
    await h.finish('voice');assert.equal(h.max(),1);h.stop();
  }
  {
    const h=harness([message('video','video')]);await h.start();
    await h.queue([message('video2','video'),message('doc','document'),message('text','text'),message('image','image'),message('voice','audio')]);
    assert.deepEqual(ids(h),['video','text']);
    const burst=Array.from({length:40},()=>h.worker.processOutboxOnce());await flush();await Promise.all(burst);
    assert.equal(h.started.length,2);
    await h.finish('text');assert.deepEqual(ids(h),['video','image']);
    await h.finish('image');assert.deepEqual(ids(h),['video','voice']);
    await h.tick();assert.equal(h.started.filter(m=>m.id==='video').length,1,'watchdog never reclaims live video');
    await h.finish('video');assert.deepEqual(ids(h),['voice'],'second slot drains after video completion');
    await h.finish('voice');assert.deepEqual(ids(h),['video2']);
    await h.finish('video2');assert.deepEqual(ids(h),['doc']);await h.finish('doc');
    assert.equal(h.max(),2);assert.equal((await h.outbox.loadOutbox()).length,0);
    assert.equal(h.events.filter(e=>e.step==='outbox:video-extra-slot:open').length,2);
    assert.equal(h.events.filter(e=>e.step==='outbox:video-extra-slot:close').length,2);h.stop();
  }
  {
    const h=harness([message('video','video')]);await h.start();await h.queue([message('text','text')]);
    await h.finish('text',new Error('temporary network failure'));
    assert.deepEqual(ids(h),['video']);await h.tick();
    assert.deepEqual(ids(h),['video','text'],'retry timer runs during a long video upload');
    await h.finish('video',{response:{status:400},message:'invalid video'});
    await h.queue([message('voice','audio')]);assert.deepEqual(ids(h),['text'],'video failure closes extra slot');
    await h.finish('text');assert.deepEqual(ids(h),['voice']);await h.finish('voice');
    assert.equal((await h.outbox.loadOutbox())[0].deliveryStatus,'failed');h.stop();
  }
  {
    const h=harness([message('video','video')]);await h.start();
    const resume=h.holdNetwork();await h.queue([message('image','image'),message('voice','audio')]);
    await h.finish('video');resume();await flush();
    assert.equal(h.active.size,1,'selection rechecks budget when video finishes during await');
    await h.finish(ids(h)[0]);await h.finish(ids(h)[0]);assert.equal(h.max(),1);h.stop();
  }
  {
    const h=harness([message('image','image'),message('voice','audio')]);
    await h.start();
    const calls=Array.from({length:40},()=>h.worker.processOutboxOnce('test-token'));
    await flush();assert.deepEqual(ids(h),['image']);await h.finish('image');await Promise.all(calls);
    assert.equal(h.max(),1,'simultaneous triggers cannot exceed normal one-message limit');h.stop();
  }
  console.log('PASS outbox: normal serial sending; video + one text/image/voice; slot draining; retry timer; video failure; no second video/document; watchdog exclusion; concurrent trigger and completion races.');
})().catch(error=>{console.error(error);process.exitCode=1;});
