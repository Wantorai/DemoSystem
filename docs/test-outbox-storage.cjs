const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = process.argv[2] || 'C:/Users/User/Desktop/Projects/MobileApp/mobile-app';
const ts = require(root + '/node_modules/typescript');
const LEGACY = 'app:outbox_v1', INDEX = 'app:outbox_v2:index', PREFIX = 'app:outbox_v2:record:';
const source = ts.transpileModule(fs.readFileSync(root + '/services/outboxStorage.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
function boot(disk, failWrite = 0, failRead = false, failDelete = false) {
  let writes=0; const operations=[];
  const storage={
    async getItem(k){ operations.push(['read', k]); if(failRead)throw Error('read unavailable'); return disk.get(k) ?? null; },
    async setItem(k,v){ operations.push(['write',k,v.length]); if(++writes===failWrite)throw Error('write unavailable'); disk.set(k,v); },
    async removeItem(k){if(failDelete)throw Error('delete unavailable');disk.delete(k);},
    async getAllKeys(){return [...disk.keys()];},
  };
  const module={exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports,require:n=>storage,console,Date,Math,Set,Map,WeakMap});
  return {...module.exports, operations};
}
const row=(clientId,content='small')=>({id:-1,clientId,userId:1,roomId:17,type:'text',content,deliveryStatus:'failed',replyTo:{id:1,content:'reply'}});
(async()=>{
  const original=[row('big','x'.repeat(1024*1024)),row('small')];
  const disk=new Map([[LEGACY,JSON.stringify(original)]]);let h=boot(disk);
  const migrated=await h.readStoredOutbox();assert.equal(JSON.stringify(migrated),JSON.stringify(original));assert.ok(!disk.has(LEGACY));
  const oldKeys=JSON.parse(disk.get(INDEX)).keys;h.operations.length=0;
  await h.writeStoredOutbox([migrated[0],{...migrated[1],deliveryStatus:'pending'}]);
  assert.equal(h.operations.filter(o=>o[0]==='read').length,0);
  const writes=h.operations.filter(o=>o[0]==='write');assert.equal(writes.length,2);assert.ok(writes.every(o=>o[2]<1024));
  assert.equal(JSON.parse(disk.get(INDEX)).keys[0],oldKeys[0]);assert.ok(!disk.has(oldKeys[1]));
  assert.ok(Object.isFrozen(migrated[0].replyTo));
  h=boot(disk);let current=await h.readStoredOutbox();assert.equal(current[0].content.length,1024*1024);assert.equal(current[1].deliveryStatus,'pending');
  await h.writeStoredOutbox([]);assert.equal((await boot(disk).readStoredOutbox()).length,0);
  // Re-adding a previously returned row must recreate its deleted backing record.
  await h.writeStoredOutbox([current[0]]);assert.equal((await boot(disk).readStoredOutbox())[0].content.length,1024*1024);
  // Every interrupted migration keeps legacy authoritative until the final index commit.
  for(let fail=1;fail<=3;fail++){
    const d=new Map([[LEGACY,JSON.stringify(original)]]);await assert.rejects(boot(d,fail).readStoredOutbox(),/write unavailable/);
    assert.equal(d.get(LEGACY),JSON.stringify(original));assert.equal(JSON.stringify(await boot(d).readStoredOutbox()),JSON.stringify(original));
    assert.equal([...d.keys()].filter(k=>k.startsWith(PREFIX)).length,2);
  }
  // An interrupted update leaves the old row and index intact, even after restart.
  for(let fail=1;fail<=2;fail++){
    const d=new Map([[LEGACY,JSON.stringify(original)]]);await boot(d).readStoredOutbox();const b=boot(d,fail);const before=await b.readStoredOutbox();
    await assert.rejects(b.writeStoredOutbox([before[0],{...before[1],content:'replacement'}]),/write unavailable/);
    assert.equal((await boot(d).readStoredOutbox())[1].content,'small');
    assert.equal([...d.keys()].filter(k=>k.startsWith(PREFIX)).length,2);
  }
  // Cleanup failure cannot resurrect removed messages from legacy data.
  const d=new Map([[LEGACY,JSON.stringify(original)]]);const b=boot(d,0,false,true);await b.readStoredOutbox();await b.writeStoredOutbox([]);
  assert.ok(d.has(LEGACY));assert.equal((await boot(d).readStoredOutbox()).length,0);assert.equal(d.size,1);
  // Missing/corrupt records or failed reads fail closed, without changing storage.
  for(const bad of ['{', '{}', '[null]']) {const d=new Map([[LEGACY,bad]]);await assert.rejects(boot(d).writeStoredOutbox([]));assert.equal(d.get(LEGACY),bad);assert.ok(!d.has(INDEX));}
  const broken=new Map([[INDEX,JSON.stringify({version:2,keys:[PREFIX+'missing']})],[LEGACY,JSON.stringify(original)]]);await assert.rejects(boot(broken).writeStoredOutbox([]));assert.equal(broken.size,2);
  await assert.rejects(boot(new Map(),0,true).writeStoredOutbox([]),/read unavailable/);
  // Concurrent first readers share exactly one migration.
  const concurrent=boot(new Map([[LEGACY,JSON.stringify(original)]]));await Promise.all([concurrent.readStoredOutbox(),concurrent.readStoredOutbox()]);assert.equal(concurrent.operations.filter(o=>o[0]==='write'&&o[1]===INDEX).length,1);
  console.log('PASS: migration, restart, per-record write volume, immutable snapshots, interrupted writes, orphan cleanup, no resurrection, corrupt storage, concurrent startup');
})().catch(e=>{console.error(e);process.exitCode=1;});
