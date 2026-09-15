const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const root=process.argv[2]||'C:/Users/User/Desktop/Projects/MobileApp/mobile-app',ts=require(root+'/node_modules/typescript');
const disk=new Map(),modules=new Map();let alerts=0;
const mocks={
 '@react-native-async-storage/async-storage':{getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v),removeItem:async k=>disk.delete(k),getAllKeys:async()=>[...disk.keys()]},
 'react-native':{Alert:{alert:()=>alerts++}},'./outboxWorker':{triggerOutboxProcessing:async()=>{}},
 './uploadCancellation':{cancelPendingUpload:()=>{}},'./pendingMediaHints':{removePendingMediaHint:()=>{}},
};
function load(name){if(modules.has(name))return modules.get(name);const out={};modules.set(name,out);const code=ts.transpileModule(fs.readFileSync(path.join(root,'services',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{exports:out,require:n=>mocks[n]??load(n.replace('./','')),console});return out;}
const o=load('outbox');const msg=(clientId,userId=1,roomId=17)=>({id:-1,clientId,userId,roomId,type:'text',content:'small',deliveryStatus:'pending'});
(async()=>{
 assert.equal(o.MAX_OUTBOX_TEXT_LENGTH,5000);await o.pushToOutbox({...msg('limit'),content:'x'.repeat(5000)});await assert.rejects(o.pushToOutbox({...msg('too-big'),content:'x'.repeat(5001)}),/OUTBOX_TEXT_TOO_LARGE/);assert.equal(alerts,1);
 await Promise.all(Array.from({length:10},(_,i)=>o.pushToOutbox(msg('c'+i))));assert.equal((await o.loadOutbox()).length,11);
 await o.updateOutboxMessage('c0',{deliveryStatus:'failed'});await o.removeFromOutbox('c1');assert.equal((await o.loadOutbox()).length,10);
 await o.pushToOutbox(msg('other-account',2));await o.pushToOutbox(msg('other-room',1,18));await o.pushToOutbox({...msg('boss'),roomId:undefined,chatId:17});
 await o.updateOutboxMessage('c2',{deliveryStatus:'sending'});await assert.rejects(o.clearRoomOutbox(17,1));
 await o.requeueSendingMessages();assert.equal(await o.clearRoomOutbox(17,1),10);
 const left=await o.loadOutbox();assert.deepEqual(Array.from(left,m=>m.clientId).sort(),['boss','other-account','other-room']);
 modules.clear();assert.equal((await load('outbox').loadOutbox()).length,3);
 await load('outbox').clearOutbox();modules.clear();assert.equal((await load('outbox').loadOutbox()).length,0);
 console.log('PASS: 5000 boundary, concurrent pushes, update/remove, sending recovery guard, account/room/boss isolation, restart after clear');
})().catch(e=>{console.error(e);process.exitCode=1;});
