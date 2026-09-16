const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');const root='C:/Users/User/Desktop/Projects/MobileApp/mobile-app';const ts=require(root+'/node_modules/typescript');const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(root+'/services/MessageDeliveryNotice.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,require:()=>({})});const label=exportsObject.deliveryNotice;
assert.equal(label({deliveryStatus:'pending'},true,false).text,'Ожидает подключения');
assert.equal(label({deliveryStatus:'sending'},false,false).text,'Отправляется…');
assert.equal(label({deliveryStatus:'failed'},true,false).text,'Не отправлено');
assert.equal(label({deliveryStatus:'failed'},false,true).retry,false);
assert.ok(label({deliveryStatus:'failed'},false,true).text.includes('Файл недоступен'));
assert.equal(label({deliveryStatus:'sent'},false,false),null);
assert.equal(label({deliveryStatus:'failed',is_deleted:true},false,false),null);
console.log('PASS delivery labels: offline pending, sending, failed, missing file, sent/deleted hidden');
