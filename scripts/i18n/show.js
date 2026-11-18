// Vypíše dávku todo segmentů: node scripts/i18n/show.js <prefix> <start> <maxChars>
const fs=require('fs'),path=require('path');const [,,prefix='cms',start='0',max='14000']=process.argv;
const a=JSON.parse(fs.readFileSync(path.join(__dirname,`../../translations/todo-${prefix}.json`)));
let n=0,i=+start;for(;i<a.length&&n<+max;i++){n+=a[i].length;console.log(i,JSON.stringify(a[i]))}console.log('#next',i,'of',a.length);
