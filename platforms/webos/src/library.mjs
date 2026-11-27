// Local view model and field-scoped Stremio updates. All positions here are seconds, wire offsets are ms.
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const str=x=>typeof x==='string'?x:'';
const n=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:0;
const stamp=x=>Date.parse(str(x))||0;
export const keyFor=t=>t.type+'|'+t.id;
export const libraryKey=namespace=>'tarn.library.v1:'+encodeURIComponent(namespace);
export const emptyLibrary=()=>({version:1,rows:{},pending:{}});
export function titleSnapshot(t){
 return {id:t.id,type:t.type,name:t.name,year:t.year||'',genre:t.genre||'',description:t.description||'',theme:t.theme||'lake',poster:t.poster,background:t.background,episodes:(t.episodes||[]).map(e=>({id:e.id,season:e.season,number:e.number,name:e.name,description:'',released:e.released,thumbnail:e.thumbnail}))};
}
export function makeRow(title){
 return {title:titleSnapshot(title),videoId:'',position:0,duration:0,next:false,updatedAt:0,list:false,watched:[],remoteWatched:'',hidden:false};
}
export function mergeTitle(old,title){
 const t=titleSnapshot(title);
 return {...old,...t,name:t.name===t.id?old.name:t.name,year:t.year||old.year,genre:t.genre||old.genre,description:t.description||old.description,poster:t.poster||old.poster,background:t.background||old.background,episodes:t.episodes.length?t.episodes:old.episodes||[]};
}
export function isComplete(position,duration){return duration>0&&position>=duration*.9;}
export function nextEpisode(title,videoId,seen=[],now=Date.now()){
 const episodes=title.episodes||[],at=episodes.findIndex(e=>e.id===videoId);
 if(at<0)return null;
 return episodes.slice(at+1).find(e=>e.season!==0&&!seen.includes(e.id)&&(!e.released||!Number.isFinite(Date.parse(e.released))||Date.parse(e.released)<=now))||null;
}
export function watchedFromField(field,episodes,inflate){
 if(!field||!episodes?.length)return [];
 try{
  const parts=field.split(':'),payload=parts.pop(),length=Number(parts.pop()),anchor=parts.join(':');
  if(!Number.isSafeInteger(length)||length<1||length>100000||!payload||payload.length>100000)return [];
  const at=episodes.findIndex(e=>e.id===anchor);if(at<0)return [];
  const bits=inflate(payload);if(bits.length>12500)return [];
  const offset=length-at-1;
  return episodes.filter((_,i)=>{const bit=i+offset;return bit>=0&&bit<bits.length*8&&(bits[bit>>3]&(1<<(bit%8)))!==0;}).map(e=>e.id);
 }catch{return [];}
}
export function watchedField(episodes,seen,deflate){
 const ids=episodes.map(e=>e.id),last=ids.reduce((a,id,i)=>seen.includes(id)?i:a,-1);
 if(last<0)return null;
 const bytes=new Uint8Array(Math.ceil(ids.length/8));
 ids.forEach((id,i)=>{if(seen.includes(id))bytes[i>>3]|=1<<(i%8);});
 return ids[last]+':'+(last+1)+':'+deflate(bytes);
}
export function seenIds(row,inflate){
 return Array.from(new Set(watchedFromField(row.remoteWatched,row.title.episodes,inflate).concat(row.watched))).filter(id=>!(row.unwatched||[]).includes(id));
}
export function applyAction(row,action,inflate){
 const r={...row,title:mergeTitle(row.title,action.title)};
 const seen=seenIds(r,inflate),video=action.videoId||r.videoId;
 if(action.kind==='list'){r.list=action.on;return r;}
 if(action.kind==='hide'){return {...r,position:0,next:false,hidden:true,updatedAt:action.at};}
 if(action.kind==='unwatch'){
  return {...r,watched:r.watched.filter(id=>id!==video),unwatched:Array.from(new Set((r.unwatched||[]).concat(video)))};
 }
 if(action.kind==='watched'||action.kind==='progress'&&(action.ended||isComplete(action.position,action.duration))){
  const watched=Array.from(new Set(r.watched.concat(video))),all=Array.from(new Set(seen.concat(video)));
  const next=r.title.type==='series'?nextEpisode(r.title,video,all,action.at):null;
  // Marking an unrelated episode must not replace a currently active resume point.
  if(action.kind==='watched'&&r.videoId&&r.videoId!==video&&r.position>0&&!r.next)return {...r,watched,unwatched:(r.unwatched||[]).filter(id=>id!==video)};
  return {...r,videoId:next?.id||video,position:0,duration:0,next:!!next,hidden:false,updatedAt:action.at,watched,unwatched:(r.unwatched||[]).filter(id=>id!==video)};
 }
 if(action.kind==='progress'){
  return {...r,videoId:video,position:n(action.position),duration:n(action.duration),next:false,hidden:false,updatedAt:action.at};
 }
 return r;
}
export function continueRows(rows){
 return Object.values(rows).filter(r=>!r.hidden&&r.videoId&&(r.next||r.position>=10&&!isComplete(r.position,r.duration))).sort((a,b)=>b.updatedAt-a.updatedAt);
}
export function listRows(rows){return Object.values(rows).filter(r=>r.list).sort((a,b)=>a.title.name.localeCompare(b.title.name));}
export function fromRemote(raw,old){
 const v=obj(raw),s=obj(v.state),type=v.type,id=str(v._id);
 if(!id||!['movie','series'].includes(type))return null;
 const image=x=>typeof x==='string'&&/^https?:\/\//i.test(x)?x:undefined;
 const t={id,type,name:str(v.name)||id,poster:image(v.poster),background:image(v.background),theme:'lake',year:'',genre:'',description:''};
 const r=old?{...old,title:mergeTitle(old.title,t)}:makeRow(t);
 const videoId=str(s.video_id)||(type==='movie'?id:''),offset=n(s.timeOffset),duration=n(s.duration),updatedAt=stamp(s.lastWatched)||stamp(v._mtime);
 const next=type==='series'&&!!videoId&&offset===1;
 return {...r,videoId,position:next||isComplete(offset,duration)?0:offset/1000,duration:duration/1000,next,updatedAt,list:v.removed===false,hidden:(!next&&offset===0)||(v.removed===true&&v.temp!==true),remoteWatched:str(s.watched),watched:type==='movie'&&(n(s.timesWatched)>0||n(s.flaggedWatched)>0)?[id]:[],unwatched:[]};
}
export function wireItem(title,at){
 const date=new Date(at).toISOString();
 return {_id:title.id,name:title.name,type:title.type,poster:title.poster||'',posterShape:'poster',removed:true,temp:true,_ctime:date,_mtime:date,behaviorHints:{},state:{lastWatched:date,timeWatched:0,timeOffset:0,overallTimeWatched:0,timesWatched:0,flaggedWatched:0,duration:0,video_id:null,watched:null,noNotif:false}};
}
export function applyWire(raw,action,inflate,deflate){
 const t=action.title,old=raw||wireItem(t,action.at),s={...obj(old.state)},out={...old,state:s};
 const date=new Date(action.at).toISOString(),video=action.videoId||str(s.video_id)||t.id;
 if(action.kind==='list'){out.removed=!action.on;out.temp=false;out._mtime=date;return out;}
 // Protect newer playback on other devices. Explicit list edits remain independent.
 if(['progress','hide'].includes(action.kind)&&Math.max(stamp(s.lastWatched),stamp(old._mtime))>action.at)return old;
 if(action.kind==='hide'){s.timeOffset=0;out._mtime=date;return out;}
 const episodes=t.episodes||[];
 const complete=action.kind==='watched'||action.kind==='progress'&&(action.ended||isComplete(action.position,action.duration));
 if(t.type==='series'&&(complete||action.kind==='unwatch')&&episodes.some(e=>e.id===video)){
  const prior=watchedFromField(str(s.watched),episodes,inflate);
  // If any existing watched bits cannot be mapped safely, retain the remote field unchanged.
  let safe=!s.watched;
  if(s.watched)try{const parts=str(s.watched).split(':'),payload=parts.pop(),length=Number(parts.pop()),anchor=parts.join(':'),at=episodes.findIndex(e=>e.id===anchor),bits=inflate(payload);let count=0;for(const b of bits)for(let bit=0;bit<8;bit++)if(b&(1<<bit))count++;safe=at>=0&&Number.isSafeInteger(length)&&length>0&&bits.length<=12500&&count===prior.length;}catch{}
  if(safe){
   const seen=action.kind==='unwatch'?prior.filter(id=>id!==video):Array.from(new Set(prior.concat(video)));
   s.watched=watchedField(episodes,seen,deflate);
  }
 }
 if(action.kind==='unwatch'){if(t.type==='movie'){s.timesWatched=0;s.flaggedWatched=0;}out._mtime=date;return out;}
 if(action.kind==='watched'&&s.video_id&&s.video_id!==video&&n(s.timeOffset)>1){out._mtime=date;return out;}
 if(action.kind==='progress'||complete){
  const same=s.video_id===video;
  if(!same){s.timeWatched=0;s.flaggedWatched=0;}
  s.video_id=video;s.lastWatched=date;
  if(action.kind==='progress'){
   const delta=n(action.played);s.timeWatched=n(s.timeWatched)+delta*1000;s.overallTimeWatched=n(s.overallTimeWatched)+delta*1000;
   s.timeOffset=Math.round(n(action.position)*1000);if(n(action.duration)>0)s.duration=Math.round(action.duration*1000);
  }
  if(complete){
   if(!s.flaggedWatched)s.timesWatched=n(s.timesWatched)+1;
   s.flaggedWatched=1;s.timeOffset=0;
   const seen=watchedFromField(str(s.watched),episodes,inflate),next=t.type==='series'?nextEpisode(t,video,seen,action.at):null;
   if(next){s.video_id=next.id;s.timeOffset=1;s.timeWatched=0;s.duration=0;s.flaggedWatched=0;}
  }
  if(out.removed)out.temp=true;
 }
 out._mtime=date;return out;
}
export function applyQueue(raw,queue,inflate,deflate){
 // A request might have succeeded even if its response was lost. Skip the acknowledged prefix.
 const stamp=str(raw?._mtime),ack=stamp?queue.findIndex(a=>new Date(a.at).toISOString()===stamp):-1;
 return queue.slice(ack+1).reduce((item,action)=>applyWire(item,action,inflate,deflate),raw);
}
export function reduceLibrary(data,action,cloud,inflate,inflight=new Set()){
 const key=keyFor(action.title),row=data.rows[key]||makeRow(action.title);
 const rows={...data.rows,[key]:applyAction(row,action,inflate)};
 const pending={...data.pending};
 if(cloud){
  // Retain ordered explicit actions; coalesce adjacent progress for the same video, never across completion.
  const q=(pending[key]||[]).slice(),last=q[q.length-1];
  if(action.kind==='progress'&&last?.kind==='progress'&&last.videoId===action.videoId&&!inflight.has(last.id)&&!last.ended&&!isComplete(last.position,last.duration)&&!action.ended&&!isComplete(action.position,action.duration)){
   q[q.length-1]={...action,played:n(last.played)+n(action.played)};
  }else q.push(action);
  pending[key]=q;
 }
 return {version:1,rows,pending};
}
export function importRemote(data,items,inflate){
 const rows={...data.rows};
 for(const raw of items){
  const key=keyFor({type:raw.type,id:raw._id}),old=rows[key],r=fromRemote(raw,old);if(!r)continue;
  // Keep un-synced newer local history imported from pre-library builds.
  let merged=old&&old.updatedAt>Math.max(r.updatedAt,stamp(raw._mtime))?{...r,videoId:old.videoId,position:old.position,duration:old.duration,next:old.next,updatedAt:old.updatedAt,hidden:old.hidden,watched:old.watched,unwatched:old.unwatched}:r;
  for(const a of data.pending[key]||[])if(!['progress','hide'].includes(a.kind)||Math.max(stamp(raw._mtime),r.updatedAt)<=a.at)merged=applyAction(merged,a,inflate);
  rows[key]=merged;
 }
 return {...data,rows};
}
