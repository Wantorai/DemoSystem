const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const root = process.argv[2] || 'C:/Users/User/Desktop/Projects/MobileApp/mobile-app';
const ts = require(path.join(root, 'node_modules/typescript'));
// Real source, synthetic in-memory storage only. No phone, database or network access.
async function scenario(name, items, expectedReads, expectedInterval) {
  const raw = JSON.stringify(items);
  let reads = 0, parses = 0, chars = 0, networkChecks = 0, apiCalls = 0;
  const noop = () => {};
  const disk = new Map([['app:outbox_v1', raw]]);
  const storage = {
    getItem: async k => { reads++; const value=disk.get(k)??null; chars += value?.length??0; return value; },
    setItem: async(k,v)=>disk.set(k,v), removeItem:async k=>disk.delete(k), getAllKeys:async()=>[...disk.keys()]
  };
  const mocks = {
    '@react-native-async-storage/async-storage': { default: storage },
    './outboxWorker': { triggerOutboxProcessing: noop },
    './uploadCancellation': { cancelPendingUpload: noop, isPendingUploadCancelled: () => false },
    './pendingMediaHints': { removePendingMediaHint: noop },
    '@react-native-community/netinfo': { default: { fetch: async () => { networkChecks++; return {isConnected:true,isInternetReachable:true}; } } },
    'react': {useEffect: noop}, 'react-native': {AppState:{},Alert:{alert:()=>{}}},
    './api': {default:{post:async()=>{apiCalls++;throw Error('Unexpected HTTP request');}}},
    './chatCacheScope': {getChatCacheAccount:()=> '1'},
    './messageCache': {cacheAcknowledgedMessage:noop},
    './networkDebugProfile': {applyNetworkDebugDelay:noop},
    './networkMetrics': new Proxy({}, {get:()=>noop}),
    './upload': {uploadFile:async()=>{throw Error('Unexpected upload');}},
  };
  function compile(file, extra='') {
    const source = fs.readFileSync(path.join(root,'services',file),'utf8') + extra;
    const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const exports = {};
    vm.runInNewContext(js, {exports,require:id=>{if(!(id in mocks))throw Error('Unmocked '+id);return mocks[id];},console,
      JSON:{parse:s=>{parses++;return JSON.parse(s);},stringify:JSON.stringify},
      setTimeout,clearTimeout,Date,Promise,Set,Map});
    return exports;
  }
  mocks['./outboxStorage'] = compile('outboxStorage.ts');
  mocks['./outbox'] = compile('outbox.ts');
  assert.equal(mocks['./outbox'].validateOutgoingText('x'.repeat(5000)), true);
  assert.equal(mocks['./outbox'].validateOutgoingText('x'.repeat(5001)), false);
  await assert.rejects(mocks['./outbox'].pushToOutbox({content:'x'.repeat(5001)}), /OUTBOX_TEXT_TOO_LARGE/);
  assert.equal(reads, 0, 'oversized text must never enter storage');
  const worker = compile('outboxWorker.ts', '\nexport const audit = {tick:runWorkerLoopOnce, interval:getAdaptiveWorkerIntervalMs, boot:()=>{_workerToken="test";_workerBooted=true;}};');
  worker.audit.boot();
  for(let i=0;i<5;i++) { await worker.audit.tick(); await new Promise(setImmediate); }
  assert.equal(reads,expectedReads); assert.equal(parses,1 + items.length);
  assert.equal(worker.audit.interval(),expectedInterval); assert.equal(apiCalls,0);
  return {name,ticks:5,reads,parses,charactersRead:chars,networkChecks,httpRequests:apiCalls,nextIntervalMs:worker.audit.interval()};
}
(async()=>{
 const base={id:-1,clientId:'audit',userId:1,roomId:17,type:'text',content:'x'.repeat(1024*1024),deliveryStatus:'failed',errorCode:413};
 const results=[];
 results.push(await scenario('empty',[],2,20000));
 results.push(await scenario('one failed 413, 1 MiB ASCII text',[base],2,20000));
 results.push(await scenario('other account pending, 1 MiB ASCII text',[{...base,userId:2,deliveryStatus:'pending'}],2,20000));
 console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
