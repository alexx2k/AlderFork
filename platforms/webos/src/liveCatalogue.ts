import {catalogueIdentity} from './addonManagement.mjs';
import {array,object,string,jsonRequest} from './stremio.ts';
export type ContentType='movie'|'series';
export type Title={id:string;type:ContentType;name:string;year:string;genre:string;description:string;theme:string;poster?:string;background?:string;rating?:string;runtime?:string;cast?:string[];episodes?:Episode[]};
export type Catalog={key:string;preferenceKey?:string;name:string;addon:string;type:ContentType;id:string;base:string;required:Record<string,string>;search:boolean;searchRequiredOnly:boolean;genres:string[];pages:boolean;searchable:boolean};
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
   const genres=strings(extra.find(x=>x.name==='genre')?.options).concat(strings(c.genres));
   const searchable=search&&requiredNames.every(n=>n==='search'||Object.prototype.hasOwnProperty.call(required,n));
   if(!browse&&!searchable)return;
   // Search-only catalogues are retained for search, not requested on the home screen.
   if(!browse||requiredNames.includes('search'))required.search='';
   out.push({key:'a'+index+'c'+i,preferenceKey:catalogueIdentity(string(desc.transportUrl),type,id),name:string(c.name)||id,addon,type,id,base,required,search,searchRequiredOnly,genres:Array.from(new Set(genres)),pages:supported.includes('skip'),searchable});
  });
 });
 return out;
}
export function browseCatalogs(catalogs:Catalog[]):Catalog[]{return catalogs.filter(c=>!Object.prototype.hasOwnProperty.call(c.required,'search'));}
export function catalogUrl(c:Catalog,query?:string,genre?:string,skip=0):string{
 const args={...c.required};
 if(query!==undefined)args.search=query;
 if(genre!==undefined&&genre!=='')args.genre=genre;
 if(skip>0&&c.pages)args.skip=String(skip);
 const suffix=Object.keys(args).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(args[k])).join('&');
 return c.base+'/catalog/'+encodeURIComponent(c.type)+'/'+encodeURIComponent(c.id)+(suffix?'/'+suffix:'')+'.json';
}
export function image(value:unknown):string|undefined{
 try{const u=new URL(string(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return;}
}
export function titleKey(t:Pick<Title,'type'|'id'>):string{return t.type+'|'+t.id;}
export type Episode={id:string;season:number|null;number:number|null;name:string;description:string;released:string;thumbnail?:string};
function numberOrNull(value:unknown):number|null{
 if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))return null;
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;
}
function displayValue(value:unknown):string{return typeof value==='number'&&Number.isFinite(value)?String(value):string(value);}
export function parseEpisodes(raw:unknown):Episode[]{
 const seen=new Set<string>(),out:Episode[]=[];
 for(const value of array(raw)){
  const v=object(value),id=string(v.id);
  if(!id||seen.has(id))continue;
  seen.add(id);
  const season=numberOrNull(v.season),number=numberOrNull(v.episode??v.number);
  out.push({id,season,number,name:string(v.title)||string(v.name)||(number!==null?'Episode '+number:'Untitled episode'),description:string(v.overview)||string(v.description),released:string(v.released),thumbnail:image(v.thumbnail)});
 }
 return out.sort((a,b)=>(a.season??Number.MAX_SAFE_INTEGER)-(b.season??Number.MAX_SAFE_INTEGER)||(a.number??Number.MAX_SAFE_INTEGER)-(b.number??Number.MAX_SAFE_INTEGER));
}
export function seasonsFor(episodes:Episode[]):(number|null)[]{return Array.from(new Set(episodes.map(e=>e.season)));}
export type PlaybackIntent={type:ContentType;titleId:string;videoId:string;name:string};
export function playbackIntent(title:Title,episode?:Episode):PlaybackIntent|null{
 if(title.type==='series'&&!episode)return null;
 return {type:title.type,titleId:title.id,videoId:episode?.id||title.id,name:episode?title.name+' · '+episode.name:title.name};
}
export function normaliseTitle(raw:unknown,fallback:ContentType):Title|null{
 const m=object(raw),id=string(m.id),name=string(m.name);
 if(!id||!name)return null;
 const type=contentType(m.type)?m.type:fallback;
 return {id,type,name,year:string(m.releaseInfo)||string(m.year)||(typeof m.year==='number'?String(m.year):''),genre:strings(m.genres).slice(0,3).join(' · ')||string(m.genre),description:string(m.description),theme:'lake',poster:image(m.poster),background:image(m.background),rating:displayValue(m.imdbRating)||displayValue(m.rating),runtime:displayValue(m.runtime),cast:strings(m.cast).slice(0,12),episodes:type==='series'?parseEpisodes(m.videos):[]};
}
export function parseTitles(raw:unknown,type:ContentType,limit=30):Title[]{
 const data=object(raw);
 if(!Array.isArray(data.metas))throw Error('Invalid catalogue response');
 const seen=new Set<string>(),out:Title[]=[];
 for(const item of data.metas){
  const t=normaliseTitle(item,type);
  if(t&&!seen.has(titleKey(t))){seen.add(titleKey(t));out.push(t);}
  if(out.length>=limit)break;
 }
 return out;
}
const LIMIT=24,WORKERS=4;
export async function loadShelves(catalogs:Catalog[],signal:AbortSignal,query?:string,request=jsonRequest,onShelf?:(shelf:Shelf)=>void):Promise<CatalogResult>{
 const candidates=query===undefined?browseCatalogs(catalogs):catalogs.filter(c=>c.searchable);
 const selected=query===undefined?candidates.slice(0,LIMIT):candidates,rows:Array<Shelf|undefined>=new Array(selected.length);
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
 return {shelves:rows.filter((s):s is Shelf=>!!s),failures,total:selected.length,truncated:query===undefined&&candidates.length>LIMIT};
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
export async function loadDetails(descriptors:unknown[],title:Title,signal:AbortSignal,request=jsonRequest):Promise<Title>{
 let best=title;
 for(const addon of metaCatalogues(descriptors,title).slice(0,4)){
  if(signal.aborted)break;
  try{
   const raw=object(await request(addon.base+'/meta/'+title.type+'/'+encodeURIComponent(title.id)+'.json',{},signal));
   const m=object(raw.meta);
   if(!Object.keys(m).length)continue;
   const t=normaliseTitle({...m,id:title.id,type:title.type,name:string(m.name)||title.name},title.type);
   if(t){
    best={...best,...t,name:best===title?t.name:best.name,year:best===title?t.year||best.year:best.year||t.year,genre:best===title?t.genre||best.genre:best.genre||t.genre,description:best===title?t.description||best.description:best.description||t.description,poster:t.poster||best.poster,background:t.background||best.background,rating:best.rating||t.rating,runtime:best.runtime||t.runtime,cast:best.cast?.length?best.cast:t.cast,episodes:best.episodes?.length?best.episodes:t.episodes};
    if(best.type==='movie'||best.episodes?.length)return best;
   }
  }catch{}
 }
 return best;
}

export function uniqueTitles(titles:Title[]):Title[]{
 const seen=new Set<string>();return titles.filter(t=>{const k=titleKey(t);if(seen.has(k))return false;seen.add(k);return true;});
}
export type CatalogPage={titles:Title[];next:number|null};
export async function loadPage(c:Catalog,genre:string,offset:number,signal:AbortSignal,request=jsonRequest):Promise<CatalogPage>{
 const raw=object(await request(catalogUrl(c,undefined,genre,offset),{},signal));
 const titles=parseTitles(raw,c.type,Number.MAX_SAFE_INTEGER);
 const count=array(raw.metas).length;
 return {titles,next:c.pages&&count>0?offset+count:null};
}
export function appendPage(existing:Title[],page:CatalogPage):CatalogPage{
 const titles=uniqueTitles(existing.concat(page.titles));
 return {titles,next:titles.length===existing.length?null:page.next};
}
// One cache per linked session, never persisted, bounded by entry count and age.
export class ContentCache{
 private entries=new Map<string,{value:unknown;expires:number}>();
 private ttl:number;
 private limit:number;
 constructor(ttl=300000,limit=80){this.ttl=ttl;this.limit=limit;}
 clear(){this.entries.clear();}
 async request(url:string,init:RequestInit={},signal?:AbortSignal,fetcher=jsonRequest):Promise<unknown>{
  if(signal?.aborted)throw Error('Cancelled');
  const hit=this.entries.get(url);
  if(hit&&hit.expires>Date.now()){this.entries.delete(url);this.entries.set(url,hit);return hit.value;}
  const value=await fetcher(url,init,signal);
  if(!signal?.aborted){this.entries.delete(url);this.entries.set(url,{value,expires:Date.now()+this.ttl});while(this.entries.size>this.limit){const key=this.entries.keys().next().value;if(key===undefined)break;this.entries.delete(key);}}
  return value;
 }
}
