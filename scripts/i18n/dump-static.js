// Vypíše nepřeložené segmenty statických stránek (maskované) do translations/todo-static.json
const fs=require('fs'),path=require('path');const S=require('./segments');
const pub=path.join(__dirname,'../../public');const dictPath=path.join(__dirname,'../../translations/static-en.json');
const dict=fs.existsSync(dictPath)?JSON.parse(fs.readFileSync(dictPath)):{};
const PAGES=require('./pages');const todo=new Map();
const add=t=>{const k=S.mask(S.norm(t)).text;if(!(k in dict)&&!todo.has(k))todo.set(k,1)};
for(const p of PAGES){const h=fs.readFileSync(path.join(pub,p.cs+'.html'),'utf8');
  const t=h.match(/<title>([^<]*)<\/title>/);if(t)add(t[1]);
  const d=h.match(/<meta content="([^"]*)" name="description">/)||h.match(/<meta name="description" content="([^"]*)"/);if(d)add(d[1]);
  const oa=h.match(/<meta content="([^"]*)" property="og:image:alt">/);if(oa)add(oa[1]);
  for(const m of h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)){try{const walk=o=>{if(Array.isArray(o))o.forEach(walk);else if(o&&typeof o==='object')for(const[k,v]of Object.entries(o)){if(typeof v==='string'&&['name','description','alternateName','text','headline','serviceType','category'].includes(k)&&/[ěščřžýáíéůú]/i.test(v))add(v);else walk(v)}};walk(JSON.parse(m[1]))}catch(e){}}
  S.transform(h,r=>{add(r);return null},a=>{add(a);return null});}
const arr=[...todo.keys()];fs.writeFileSync(path.join(__dirname,'../../translations/todo-static.json'),JSON.stringify(arr,null,1));
console.log('todo',arr.length,arr.reduce((s,x)=>s+x.length,0),'chars');
