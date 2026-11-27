import type {PlaybackIntent} from './liveCatalogue.ts';
import {progressKey,Progress,resumePosition,SourceIdentity,Source,sourceIdentity} from './playback.mjs';
// Separate local progress by Stremio user ID; never include auth keys or media URLs.
// No cloud writes. If the account ID or browser storage is unavailable, use session memory.
const memory=new Map<string,Progress>();
const sources=new Map<string,SourceIdentity>();
export function readProgress(account:string,intent:PlaybackIntent):Progress|null{
 const key=progressKey(account,intent);
 if(memory.has(key))return memory.get(key)||null;
 if(!account)return null;
 try{
  const raw=localStorage.getItem(key);if(!raw)return null;
  const value=JSON.parse(raw) as Progress;
  if(!Number.isFinite(value.position)||!Number.isFinite(value.duration)||!Number.isFinite(value.updatedAt))return null;
  return value;
 }catch{return null;}
}
export function saveProgress(account:string,intent:PlaybackIntent,position:number,duration:number){
 if(!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0||position<0)return;
 const key=progressKey(account,intent),value={position:Math.min(position,duration),duration,updatedAt:Date.now()};
 memory.set(key,value);
 if(account)try{localStorage.setItem(key,JSON.stringify(value));}catch{}
}
export function resumeFor(account:string,intent:PlaybackIntent){return resumePosition(readProgress(account,intent));}
export function clearSessionProgress(){memory.clear();sources.clear();}

function sourceKey(account:string,intent:PlaybackIntent){return progressKey(account,intent).replace('tarn.progress.v1:','tarn.source.v1:');}
export function readSource(account:string,intent:PlaybackIntent):SourceIdentity|null{
 const key=sourceKey(account,intent);if(sources.has(key))return sources.get(key)||null;
 if(!account)return null;
 try{const s=JSON.parse(localStorage.getItem(key)||'null');if(s&&['provider','exact','filename','label'].every(k=>typeof s[k]==='string'&&s[k].length<=32))return s;}catch{}
 return null;
}
export function rememberSource(account:string,intent:PlaybackIntent,source:Source){
 const key=sourceKey(account,intent),value=sourceIdentity(source);sources.set(key,value);
 if(account)try{localStorage.setItem(key,JSON.stringify(value));}catch{}
}
