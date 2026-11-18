// Sloučí translations/batches/<prefix>-*.json ({index: en}) s todo-<prefix>.json do translations/<prefix>-en.json ({cs: en})
const fs=require('fs'),path=require('path');const S=require('./segments');
const prefix=process.argv[2]||'static';const T=path.join(__dirname,'../../translations');
const todo=JSON.parse(fs.readFileSync(path.join(T,`todo-${prefix}.json`)));
const dictPath=path.join(T,`${prefix}-en.json`);const dict=fs.existsSync(dictPath)?JSON.parse(fs.readFileSync(dictPath)):{};
let n=0,errs=0;
for(const f of fs.readdirSync(path.join(T,'batches')).filter(f=>f.startsWith(prefix+'-')&&f.endsWith('.json')).sort()){
  const b=JSON.parse(fs.readFileSync(path.join(T,'batches',f)));
  for(const [i,en] of Object.entries(b)){const cs=todo[+i];if(cs==null){console.error(f,'index mimo',i);errs++;continue}
    const a=(cs.match(/\{\d+\}/g)||[]).sort().join(),c=(en.match(/\{\d+\}/g)||[]).sort().join();
    if(a!==c){console.error(f,i,'placeholdery nesedí',a,'|',c);errs++;continue}
    dict[cs]=en;n++;}
}
const missing=todo.filter(k=>!(k in dict));
fs.writeFileSync(dictPath,JSON.stringify(dict,null,1));
console.log(prefix,'sloučeno',n,'chyb',errs,'chybí',missing.length);if(missing.length)console.log(missing.slice(0,10));
