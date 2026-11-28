// Account edits preserve whole descriptors, including unknown fields and broken entries.
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const str=v=>typeof v==='string'?v:'';
const arr=v=>Array.isArray(v)?v:[];
export const PHONE_ADDONS_URL='https://web.stremio.com/#/addons';
export function normalizeManifestUrl(value,parse){
 let raw=String(value||'').trim();if(!raw||raw.length>8192||/\s/.test(raw))throw Error('Enter a valid manifest URL.');
 raw=raw.replace(/^stremio:\/\//i,'https://');if(!raw.includes('://'))raw='https://'+raw;
 const u=parse(raw);
 if(!['http:','https:'].includes(u.protocol)||!u.hostname||u.username||u.password||u.search||u.hash)throw Error('Use an HTTP(S) manifest address without credentials, query or fragment.');
 if(!u.pathname.endsWith('/manifest.json'))u.pathname=u.pathname.replace(/\/+$/,'')+'/manifest.json';
 return u.href;
}
export function makeDescriptor(url,raw){
 const m=obj(raw);
 if(!str(m.id).trim()||!str(m.name).trim()||!Array.isArray(m.resources)||!m.resources.length||!m.resources.every(r=>typeof r==='string'&&!!r.trim()||!!str(obj(r).name).trim()))throw Error('That address did not return a valid add-on manifest.');
 return {transportUrl:url,manifest:m,flags:{official:false,protected:false}};
}
export function addonInfo(raw,index){
 const d=obj(raw),m=obj(d.manifest),flags=obj(d.flags),resources=arr(m.resources).map(r=>typeof r==='string'?r:str(obj(r).name));
 return {name:str(m.name)||str(m.id)||'Unknown add-on '+(index+1),id:str(m.id),version:str(m.version),description:str(m.description),roles:Array.from(new Set(resources.filter(Boolean))),official:flags.official===true,locked:flags.protected===true,shareable:flags.official!==true&&resources.includes('stream')&&!/watchly|trakt|simkl|syncribullet|aiolists/i.test(str(m.name)),url:str(d.transportUrl)};
}
export function applyCollectionEdit(list,edit,writable){
 if(!writable)throw Error('Only the linked account owner can change installed add-ons.');
 if(edit.kind==='install'){
  const url=addonInfo(edit.descriptor,0).url;if(!url)throw Error('Invalid add-on.');
  if(list.some((d,i)=>addonInfo(d,i).url===url))throw Error('This add-on is already installed.');
  return list.concat(edit.descriptor);
 }
 if(!Number.isInteger(edit.index)||edit.index<0||edit.index>=list.length)throw Error('Add-on no longer available.');
 const next=list.slice();
 if(edit.kind==='remove'){
  if(addonInfo(next[edit.index],edit.index).locked)throw Error('This built-in add-on is protected.');
  next.splice(edit.index,1);return next;
 }
 if(edit.kind==='move'){
  const dest=edit.index+edit.delta;if(![-1,1].includes(edit.delta)||dest<0||dest>=next.length)throw Error('Cannot move this add-on further.');
  [next[edit.index],next[dest]]=[next[dest],next[edit.index]];return next;
 }
 throw Error('Unknown change.');
}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.keys(value).sort().reduce((out,k)=>{Object.defineProperty(out,k,{value:canonical(value[k]),enumerable:true});return out;},{});
 return value;
}
export function sameCollection(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
export function sameOrder(a,b){return a.length===b.length&&a.every((d,i)=>{const x=addonInfo(d,i),y=addonInfo(b[i],i);return x.url===y.url&&x.id===y.id;});}
// Stable local catalogue keys: hash the transport URL to avoid storing a configured provider's raw URL.
export function catalogueIdentity(url,type,id){
 let h=2166136261,g=5381;for(const c of String(url)){h=Math.imul(h^c.charCodeAt(0),16777619);g=Math.imul(g,33)^c.charCodeAt(0);}
 return (h>>>0).toString(16)+'-'+(g>>>0).toString(16)+':'+encodeURIComponent(type)+':'+encodeURIComponent(id);
}
export function layoutKey(namespace){return 'tarn.cataloglayout.v1:'+encodeURIComponent(namespace);}
export function cleanLayout(raw){
 const p=obj(raw),keys=x=>Array.from(new Set(arr(x).filter(k=>typeof k==='string'&&k.length>0&&k.length<=2048))).slice(0,5000);
 return {hidden:keys(p.hidden),order:keys(p.order)};
}
export function orderCatalogues(catalogs,layout,includeHidden=false){
 const p=cleanLayout(layout),ranks=new Map(p.order.map((k,i)=>[k,i]));
 const key=c=>c.preferenceKey||c.key;
 return catalogs.filter(c=>includeHidden||!p.hidden.includes(key(c))).map((c,i)=>({c,i,rank:ranks.has(key(c))?ranks.get(key(c)):p.order.length+i})).sort((a,b)=>a.rank-b.rank||a.i-b.i).map(x=>x.c);
}
export function editLayout(layout,catalogs,key,kind,delta=0){
 const p=cleanLayout(layout),all=orderCatalogues(catalogs,p,true),keys=all.map(c=>c.preferenceKey||c.key);
 if(!keys.includes(key))return p;
 if(kind==='toggle')return {...p,hidden:p.hidden.includes(key)?p.hidden.filter(k=>k!==key):p.hidden.concat(key)};
 if(kind==='move'){const at=keys.indexOf(key),dest=at+delta;if(![-1,1].includes(delta)||dest<0||dest>=keys.length)return p;[keys[at],keys[dest]]=[keys[dest],keys[at]];return {...p,order:keys};}
 return p;
}
