import {array,object,string,jsonRequest,JsonObject} from './stremio.ts';
export type ContentType='movie'|'series';
export type Title={id:string;type:ContentType;name:string;year:string;genre:string;description:string;theme:string;poster?:string;background?:string};
export type Catalog={key:string;name:string;addon:string;type:ContentType;id:string;base:string;required:Record<string,string>;search:boolean;searchRequiredOnly:boolean};
export type Shelf={key:string;name:string;addon:string;type:ContentType;titles:Title[]};
export type CatalogResult={shelves:Shelf[];failures:number;total:number;truncated:boolean};
function contentType(value:unknown):value is ContentType{return value==='movie'||value==='series';}
function strings(value:unknown):string[]{return array(value).filter((s):s is string=>typeof s==='string');}
function transportBase(value:unknown):string|undefined{
 try{
  const u=new URL(string(value));
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/manifest.json'))return;
  return u.href.slice(0,-'/manifest.json'.length);
 }catch{return;}
}
export function catalogues(descriptors:unknown[]):Catalog[]{
 const out:Catalog[]=[];
 descriptors.forEach((raw,index)=>{
  const desc=object(raw),manifest=object(desc.manifest),base=transportBase(desc.transportUrl);
  if(!base)return;
  const addon=string(manifest.name)||string(manifest.id)||'Add-on';
  array(manifest.catalogs).forEach((value,i)=>{
   const c=object(value),type=c.type,id=string(c.id);
   if(!contentType(type)||!id)return;
   const extra=array(c.extra).map(object);
   const requiredNames=strings(c.extraRequired).concat(extra.filter(x=>x.isRequired===true).map(x=>string(x.name)));
   const supported=strings(c.extraSupported).concat(requiredNames,extra.map(x=>string(x.name)));
   const required:Record<string,string>=Object.create(null);
   let browse=true;
   for(const name of Array.from(new Set(requiredNames))){
    const own=extra.find(x=>x.name===name)||{};
    const choices=strings(own.options);
    if(name==='genre'&&!choices.length)choices.push(...strings(c.genres));
    const choice=string(own.default);
    if(choices.length)required[name]=choices.includes(choice)?choice:choices[0];
    else browse=false;
   }
   const search=supported.includes('search');
   const searchRequiredOnly=requiredNames.every(n=>n==='search');
   if(!browse&&!(search&&searchRequiredOnly))return;
   // Search-only catalogues are retained for search, not requested on the home screen.
   if(!browse)required.search='';
   out.push({key:'a'+index+'c'+i,name:string(c.name)||id,addon,type,id,base,required,search,searchRequiredOnly});
  });
 });
 return out;
}
export function browseCatalogs(catalogs:Catalog[]):Catalog[]{return catalogs.filter(c=>!Object.prototype.hasOwnProperty.call(c.required,'search'));}
export function catalogUrl(c:Catalog,query?:string):string{
 const args=query===undefined?c.required:{search:query};
 const suffix=Object.keys(args).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(args[k])).join('&');
 return c.base+'/catalog/'+encodeURIComponent(c.type)+'/'+encodeURIComponent(c.id)+(suffix?'/'+suffix:'')+'.json';
}
function image(value:unknown):string|undefined{
 try{const u=new URL(string(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return;}
}
export function titleKey(t:Pick<Title,'type'|'id'>):string{return t.type+'|'+t.id;}
export function normaliseTitle(raw:unknown,fallback:ContentType):Title|null{
 const m=object(raw),id=string(m.id),name=string(m.name);
 if(!id||!name)return null;
 const type=contentType(m.type)?m.type:fallback;
 return {id,type,name,year:string(m.releaseInfo)||string(m.year)||(typeof m.year==='number'?String(m.year):''),genre:strings(m.genres).slice(0,3).join(' · ')||string(m.genre),description:string(m.description),theme:'lake',poster:image(m.poster),background:image(m.background)};
}
export function parseTitles(raw:unknown,type:ContentType):Title[]{
 const data=object(raw);
 if(!Array.isArray(data.metas))throw Error('Invalid catalogue response');
 const seen=new Set<string>(),out:Title[]=[];
 for(const item of data.metas){
  const t=normaliseTitle(item,type);
  if(t&&!seen.has(titleKey(t))){seen.add(titleKey(t));out.push(t);}
  if(out.length>=30)break;
 }
 return out;
}
const LIMIT=24,WORKERS=4;
export async function loadShelves(catalogs:Catalog[],signal:AbortSignal,query?:string,request=jsonRequest,onShelf?:(shelf:Shelf)=>void):Promise<CatalogResult>{
 const candidates=query===undefined?browseCatalogs(catalogs):catalogs.filter(c=>c.search&&c.searchRequiredOnly);
 const selected=candidates.slice(0,LIMIT),rows:Array<Shelf|undefined>=new Array(selected.length);
 let cursor=0,failures=0;
 async function worker(){
  while(!signal.aborted&&cursor<selected.length){
   const i=cursor++,c=selected[i];
   try{
    const titles=parseTitles(await request(catalogUrl(c,query),{},signal),c.type);
    if(!signal.aborted){
     const shelf={key:c.key,name:c.name,addon:c.addon,type:c.type,titles};
     rows[i]=shelf;onShelf?.(shelf);
    }
   }catch{if(!signal.aborted)failures++;}
  }
 }
 await Promise.all(Array.from({length:Math.min(WORKERS,selected.length)},worker));
 return {shelves:rows.filter((s):s is Shelf=>!!s),failures,total:selected.length,truncated:candidates.length>LIMIT};
}
export function metaCatalogues(descriptors:unknown[],title:Title):{base:string}[]{
 const out:{base:string}[]=[];
 for(const raw of descriptors){
  const d=object(raw),m=object(d.manifest),base=transportBase(d.transportUrl);
  if(!base)continue;
  const resource=array(m.resources).find(x=>x==='meta'||object(x).name==='meta');
  if(!resource)continue;
  const r=object(resource),types=strings(r.types||m.types),prefixes=strings(typeof resource==='string'?m.idPrefixes:r.idPrefixes);
  if(types.includes(title.type)&&(!prefixes.length||prefixes.some(p=>title.id.startsWith(p))))out.push({base});
 }
 return out;
}
export async function loadDetails(descriptors:unknown[],title:Title,signal:AbortSignal):Promise<Title>{
 for(const addon of metaCatalogues(descriptors,title).slice(0,4)){
  if(signal.aborted)break;
  try{
   const raw=object(await jsonRequest(addon.base+'/meta/'+title.type+'/'+encodeURIComponent(title.id)+'.json',{},signal));
   const m=object(raw.meta);
   if(!Object.keys(m).length)continue;
   const t=normaliseTitle({...m,id:title.id,type:title.type,name:string(m.name)||title.name},title.type);
   if(t)return {...title,...t,description:t.description||title.description,poster:t.poster||title.poster,background:t.background||title.background};
  }catch{}
 }
 return title;
}
