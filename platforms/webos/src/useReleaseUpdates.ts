import {useEffect,useRef,useState} from 'react';
import {availableUpdate,Release,RELEASES_API} from './customisation.mjs';
import {jsonRequest} from './stremio.ts';
const INTERVAL=4*60*60*1000;
export function useReleaseUpdates(enabled:boolean){
 const [release,setRelease]=useState<Release|null>(null),[status,setStatus]=useState('Not checked'),[busy,setBusy]=useState(false);
 const active=useRef<AbortController|null>(null),checked=useRef(0),alive=useRef(true);
 const check=async(force=false)=>{
  if(active.current||!alive.current||!force&&(!enabled||Date.now()-checked.current<INTERVAL))return;
  const c=new AbortController();active.current=c;setBusy(true);setStatus('Checking GitHub releases…');
  try{const raw=await jsonRequest(RELEASES_API,{},c.signal);if(c.signal.aborted)return;if(!Array.isArray(raw))throw Error('Invalid release response');const found=availableUpdate(raw);checked.current=Date.now();setRelease(found);setStatus(found?'webOS update available: '+found.version:'No newer matching stable webOS IPK found in recent releases.');}
  catch{if(!c.signal.aborted)setStatus('Could not check GitHub releases. Try again.');}
  finally{if(active.current===c)active.current=null;if(alive.current&&!c.signal.aborted)setBusy(false);}
 };
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.abort();active.current=null;};},[]);
 useEffect(()=>{if(!enabled)return;void check();const id=window.setInterval(()=>void check(),INTERVAL);const visible=()=>{if(document.visibilityState!=='hidden')void check();};document.addEventListener('visibilitychange',visible);return()=>{window.clearInterval(id);document.removeEventListener('visibilitychange',visible);};},[enabled]);
 return {release,status,busy,check:()=>check(true)};
}
