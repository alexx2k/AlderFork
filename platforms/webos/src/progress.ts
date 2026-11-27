import type {PlaybackIntent} from './liveCatalogue.ts';
import {progressKey,Progress,resumePosition} from './playback.mjs';
// Separate local progress by Stremio user ID; never include auth keys or media URLs.
// No cloud writes. If the account ID or browser storage is unavailable, use session memory.
const memory=new Map<string,Progress>();
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
export function clearSessionProgress(){memory.clear();}
