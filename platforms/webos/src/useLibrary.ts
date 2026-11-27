import {useEffect,useRef,useState} from 'react';
import type {Title,PlaybackIntent} from './liveCatalogue.ts';
import {Action,LibraryData,Row,emptyLibrary,libraryKey,keyFor,makeRow,mergeTitle,reduceLibrary,importRemote,applyWire,titleSnapshot,isComplete,seenIds} from './library.mjs';
import {inflateWatched,deflateWatched} from './watchedCodec.ts';
import {readLibraryItems,writeLibraryItems,getUserId} from './stremio.ts';
import {historyPrefix} from './profiles.mjs';
import {resumeFor} from './progress.ts';
function read(namespace:string):LibraryData{
 try{const d=JSON.parse(localStorage.getItem(libraryKey(namespace))||'null');if(d?.version===1&&d.rows&&d.pending)return d;}catch{}
 return emptyLibrary();
}
function oldHistory(data:LibraryData,namespace:string,titles:Title[]):LibraryData{
 const rows={...data.rows},prefix=historyPrefix('progress',namespace);
 try{
  for(let i=0;i<localStorage.length;i++){
   const k=localStorage.key(i);if(!k?.startsWith(prefix))continue;
   let decoded:string;try{decoded=decodeURIComponent(k.slice(prefix.length));}catch{continue;}
   const split=decoded.indexOf('|'),type=decoded.slice(0,split),videoId=decoded.slice(split+1);
   if(!videoId||!['movie','series'].includes(type))continue;
   const t=titles.find(t=>t.type===type&&(t.id===videoId||t.episodes?.some(e=>e.id===videoId)||type==='series'&&videoId.startsWith(t.id+':')));
   const id=t?.id||(type==='movie'?videoId:/^tt\d+:\d+:\d+$/.test(videoId)?videoId.split(':')[0]:'');
   if(!id)continue;
   const title:Title=t||{id,type:type as Title['type'],name:id,year:'',genre:'',description:'',theme:'lake'};
   const key=keyFor(title),p=JSON.parse(localStorage.getItem(k)||'null');
   if(!p||!Number.isFinite(p.position)||!Number.isFinite(p.duration)||!Number.isFinite(p.updatedAt))continue;
   const row=rows[key]||makeRow(title);
   // Once a real library action exists, do not resurrect old dismissed progress.
   if(data.rows[key]){if(t)rows[key]={...row,title:mergeTitle(row.title,t)};continue;}
   const complete=isComplete(p.position,p.duration),seen=complete?Array.from(new Set(row.watched.concat(videoId))):row.watched;
   rows[key]=p.updatedAt>row.updatedAt?{...row,videoId,position:complete?0:p.position,duration:p.duration,updatedAt:p.updatedAt,watched:seen}: {...row,watched:seen};
  }
 }catch{}
 return {...data,rows};
}
export function useLibrary(namespace:string,token:string,cloud:boolean){
 const [data,setData]=useState(()=>oldHistory(read(namespace),namespace,[]));
 const model=useRef(data),alive=useRef(true),working=useRef(false),timer=useRef<number|undefined>(undefined),seq=useRef(0);
 const [status,setStatus]=useState(cloud?'Waiting to sync library…':'Local library');
 const [revision,setRevision]=useState(0);
 const controller=useRef<AbortController|null>(null);
 const identity=useRef('');
 const inFlightIds=useRef(new Set<string>());
 const actionClock=useRef(0);
 const boundAccount=()=>{try{return localStorage.getItem(libraryKey(namespace)+':account')||'';}catch{return '';}};
 const save=(d:LibraryData)=>{
  model.current=d;
  if(alive.current)setData(d);
  try{localStorage.setItem(libraryKey(namespace),JSON.stringify(d));}
  catch{if(alive.current)setStatus('Local library storage full or unavailable; changes may not survive restart.');}
 };
 const schedule=(delay=1500)=>{if(!cloud||!alive.current)return;if(timer.current!==undefined){if(delay!==0)return;window.clearTimeout(timer.current);}timer.current=window.setTimeout(()=>{timer.current=undefined;setRevision(v=>v+1);},delay);};
 const sync=async()=>{
  if(!cloud||working.current||!alive.current)return;
  working.current=true;const c=new AbortController();controller.current=c;
  setStatus('Synchronising Stremio library…');
  try{
   // Bind the durable outbox to the actual account, not an expiring auth token.
   const user=identity.current||await getUserId(token,c.signal);
   if(c.signal.aborted)return;
   identity.current=user;
   const bindingKey=libraryKey(namespace)+':account';
   const prior=localStorage.getItem(bindingKey);
   if(prior&&prior!==user){setStatus('Linked account changed. Cloud sync paused to protect the previous account’s library.');return;}
   if(!prior)localStorage.setItem(bindingKey,user);
   const remote=await readLibraryItems(token,[],c.signal);
   if(c.signal.aborted)return;
   save(importRemote(model.current,remote,inflateWatched));
   // Read each changed item again before applying only the intended fields.
   for(const key of Object.keys(model.current.pending)){
    if(c.signal.aborted)break;
    const q=model.current.pending[key]||[];if(!q.length)continue;
    inFlightIds.current=new Set(q.map(a=>a.id));
    const current=await readLibraryItems(token,[q[0].title.id],c.signal);
    let raw=current.find(x=>x._id===q[0].title.id&&x.type===q[0].title.type);
    // A different type with the same Stremio ID cannot safely be overwritten.
    if(!raw&&current.some(x=>x._id===q[0].title.id))throw Error('Library ID collision');
    for(const a of q){
     // Retry after a lost acknowledgment: a matching write timestamp is already applied.
     if(raw?._mtime===new Date(a.at).toISOString())continue;
     raw=applyWire(raw,a,inflateWatched,deflateWatched);
    }
    if(c.signal.aborted)break;
    if(raw)await writeLibraryItems(token,[raw],c.signal);
    if(c.signal.aborted)break;
    const latest=model.current,done=new Set(q.map(a=>a.id)),pending={...latest.pending};
    const remaining=(pending[key]||[]).filter(a=>!done.has(a.id));if(remaining.length)pending[key]=remaining;else delete pending[key];
    save(raw?importRemote({...latest,pending},[raw],inflateWatched):{...latest,pending});
   }
   if(!c.signal.aborted)setStatus('Stremio library synced');
  }catch{if(!c.signal.aborted)setStatus('Library sync unavailable. Local changes retained; retry from My List.');}
  finally{working.current=false;inFlightIds.current.clear();if(controller.current===c)controller.current=null;if(!c.signal.aborted&&Object.keys(model.current.pending).length)schedule(15000);}
 };
 useEffect(()=>{alive.current=true;save(model.current);return()=>{alive.current=false;controller.current?.abort();if(timer.current!==undefined)window.clearTimeout(timer.current);};},[]);
 useEffect(()=>{void sync();},[revision]);
 useEffect(()=>{if(!cloud)return;const id=window.setInterval(()=>schedule(0),60000);return()=>window.clearInterval(id);},[cloud]);
 const act=(action:Omit<Action,'id'|'at'>)=>{
  if(!alive.current)return;
  const at=Math.max(Date.now(),actionClock.current+1);actionClock.current=at;
  const a:Action={...action,title:titleSnapshot(action.title),at,id:at.toString(36)+'-'+(++seq.current).toString(36)+'-'+Math.random().toString(36).slice(2)};
  const bound=boundAccount(),safeCloud=cloud&&!!bound&&(!identity.current||identity.current===bound);
  save(reduceLibrary(model.current,a,safeCloud,inflateWatched,inFlightIds.current));if(cloud&&!safeCloud)setStatus('Account identity not verified or changed. This change is local only.');schedule(5000);
 };
 const enrich=(titles:Title[])=>{
  const current=model.current,next=oldHistory(current,namespace,titles);
  for(const t of titles){const key=keyFor(t),r=next.rows[key];if(r)next.rows[key]={...r,title:mergeTitle(r.title,t)};}
  if(JSON.stringify(next)!==JSON.stringify(current))save(next);
 };
 const row=(title:Title):Row|undefined=>data.rows[keyFor(title)];
 const watched=(title:Title,videoId:string)=>{const r=row(title);return r?seenIds({...r,title:mergeTitle(r.title,title)},inflateWatched).includes(videoId):false;};
 const position=(title:Title,intent:PlaybackIntent)=>{
  const r=model.current.rows[keyFor(title)];
  if(r?.videoId===intent.videoId)return r.next||r.hidden?0:r.position;
  if(r&&seenIds(r,inflateWatched).includes(intent.videoId))return 0;
  return resumeFor(namespace,intent);
 };
 return {data,status,act,enrich,row,watched,position,retry:()=>schedule(0)};
}
export type LibraryModel=ReturnType<typeof useLibrary>;
