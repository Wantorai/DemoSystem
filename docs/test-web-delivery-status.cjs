const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('crm-fronend/src/app/webchats/[kind]/[id]/page.js','utf8');
const begin=source.indexOf('  const sendMessage = async () => {');const end=source.indexOf('// onFiles',begin);const fn=source.slice(begin,end);
function harness(mode){const payloads=[];const ctx={sending:false,text:'hello',editingMessage:null,messages:[],token:'test',kind:'room',id:'17',user:{id:1,name:'Test'},replyDraft:null,navigator:{onLine:mode!=='offline'},seenRef:{current:new Set()},toast:{info(){}},console:{warn(){},error(){}},postMessageCandidates:()=>['/test'],setReplyDraft:v=>{ctx.replyDraft=v;},setSending:v=>{ctx.sending=v;},setText:v=>{ctx.text=typeof v==='function'?v(ctx.text):v;},setMessages:f=>{ctx.messages=f(ctx.messages);},fetch:async(_url,options)=>{payloads.push(JSON.parse(options.body));if(mode==='error'||mode==='offline')throw Error('offline');return {ok:true,json:async()=> mode==='empty'?null:{id:123,content:'hello',userId:1}};}};vm.createContext(ctx);vm.runInContext(fn+'; globalThis.send = sendMessage;',ctx);return {ctx,payloads,setMode:v=>mode=v};}
(async()=>{
 const h=harness('error');await h.ctx.send();assert.equal(h.ctx.messages.length,1);assert.equal(h.ctx.messages[0].deliveryStatus,'failed');assert.equal(h.ctx.text,'hello');const clientId=h.payloads[0].clientId;
 h.setMode('success');await h.ctx.send();assert.equal(h.payloads[1].clientId,clientId);assert.equal(h.ctx.messages.length,1);assert.equal(h.ctx.messages[0].id,123);assert.equal(h.ctx.text,'');
 const offline=harness('offline');await offline.ctx.send();assert.equal(offline.ctx.messages[0].deliveryStatus,'pending');assert.equal(offline.ctx.text,'hello');
 const empty=harness('empty');await empty.ctx.send();assert.equal(empty.ctx.messages[0].deliveryStatus,'failed');assert.equal(empty.ctx.text,'hello');
 console.log('PASS web room send: persistent failure row, retained text, idempotent retry, success cleanup, offline pending, empty response');
})().catch(e=>{console.error(e);process.exitCode=1;});
