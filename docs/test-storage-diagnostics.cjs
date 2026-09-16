const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const root=process.argv[2]||'C:/Users/User/Desktop/Projects/MobileApp/mobile-app';const ts=require(root+'/node_modules/typescript');
const code=ts.transpileModule(fs.readFileSync(root+'/services/storageDiagnostics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exportsObject={};vm.runInNewContext(code,{exports:exportsObject,require,Date,Buffer,setTimeout,console});
const scan=exportsObject.checkStorageDiagnostics;const index='app:outbox_v2:index',record='app:outbox_v2:record:1';
async function run(entries,fastEntries=[],override={}){const disk=new Map(entries),fast=new Map(fastEntries),before=JSON.stringify([...disk]);let reads=0;const storage={keys:async()=>[...disk.keys()],read:async k=>{reads++;return disk.get(k)??null;},fastKeys:()=>[...fast.keys()],fastRead:k=>fast.get(k),...override};const result=await scan(storage,1,{platform:'test'});assert.equal(JSON.stringify([...disk]),before,'scanner must not mutate storage');return result;}
(async()=>{
 let r=await run([]);assert.equal(r.status,'ok');
 const message={roomId:17,userId:1,deliveryStatus:'failed',errorCode:413,content:'PRIVATE_TEXT_SECRET',lastError:'PRIVATE_ERROR_TOKEN',mediaUrl:'PRIVATE_URL',createdAt:new Date(Date.now()-7200000).toISOString()};
 const cache=JSON.stringify({version:2,revision:1,messages:[{id:1,content:'PRIVATE_CACHE_SECRET'}]});
 r=await run([[index,JSON.stringify({version:2,keys:[record]})],[record,JSON.stringify(message)],['room_msgs_17',cache]], [['room_msgs_17',cache]]);
 assert.equal(r.status,'warning');assert.equal(r.queue.statuses.failed,1);assert.equal(r.queue.largest[0].errorCode,413);assert.equal(r.cache.inspected,2);assert.ok(!JSON.stringify(r).includes('PRIVATE_'));
 r=await run([[index,JSON.stringify({version:2,keys:[record]})]]);assert.ok(r.findings.some(f=>f.code==='missing_record'));
 r=await run([[index,'{PRIVATE_SECRET']]);assert.ok(r.findings.some(f=>f.code==='invalid_json'));assert.ok(!JSON.stringify(r).includes('PRIVATE_SECRET'));
 r=await run([['room_msgs_17',cache]],[['room_msgs_17',cache.replace('"revision":1','"revision":2')]]);assert.ok(r.findings.some(f=>f.code==='cache_revision_diff_may_be_in_flight'));
 r=await run([['room_msgs_17','x'.repeat(2*1024*1024+1)]]);assert.equal(r.status,'incomplete');
 let indexReads=0;r=await run([],[],{read:async k=>k===index && ++indexReads>1 ? '{"version":2,"keys":[]}' : null});assert.equal(r.concurrentQueueChange,true);assert.equal(r.status,'incomplete');
 r=await run([],[],{read:async()=>{throw Error('PRIVATE_NATIVE_ERROR');}});assert.equal(r.status,'incomplete');assert.ok(!JSON.stringify(r).includes('PRIVATE_NATIVE_ERROR'));
 r=await run(Array.from({length:510},(_,i)=>['room_msgs_'+i,'[]']));assert.equal(r.status,'incomplete');assert.ok(r.reads<=501);assert.ok(r.findings.length<=100);assert.ok(r.cache.largest.length<=30);
 r=await run([['app:outbox_v1',JSON.stringify([message])]]);assert.equal(r.queue.format,'legacy');assert.equal(r.queue.inspected,1);
 console.log('PASS read-only diagnostics: healthy, failed sends, missing/corrupt data, cache mismatch, concurrent writes, limits, legacy, privacy');
})().catch(e=>{console.error(e);process.exitCode=1;});
