import {useEffect,useRef,useState} from 'react';
import {availableUpdate,Release,RELEASES_API} from './customisation.mjs';
import {jsonRequest} from './stremio.ts';
const INTERVAL=60*60*1000;
const RETRY_INTERVAL=15*60*1000;
let cached:Release|null=null,lastSuccess=0,lastAttempt=0;
export function useReleaseUpdates(enabled:boolean){
 const [release,setRelease]=useState<Release|null>(cached),[status,setStatus]=useState(lastSuccess?(cached?'Windows update available: '+cached.version:'No newer matching Windows installer found in recent releases.'):'Not checked'),[busy,setBusy]=useState(false);
 const [installation,setInstallation]=useState<{stage:string;percent:number;message:string}>({stage:'idle',percent:0,message:''});
 const [installing,setInstalling]=useState(false);const installingRef=useRef(false);
 useEffect(()=>window.tarnDesktop?.onUpdateProgress(setInstallation),[]);
 const install=async()=>{if(!release||!window.tarnDesktop||installingRef.current)return;installingRef.current=true;setInstalling(true);setInstallation({stage:'checking',percent:0,message:'Preparing update…'});try{const result=await window.tarnDesktop.installUpdate(release.version);if(!result.ok)setInstallation(old=>({...old,stage:old.stage==='error'?'error':'idle',message:result.message}));}catch{setInstallation({stage:'error',percent:0,message:'Could not start updater. Download from GitHub instead.'});}finally{installingRef.current=false;setInstalling(false);}};
 const active=useRef<AbortController|null>(null),alive=useRef(true);
 const check=async(force=false)=>{
  if(active.current||!alive.current||!force&&(!enabled||(Date.now()-lastSuccess<INTERVAL||Date.now()-lastAttempt<RETRY_INTERVAL)))return;
  const c=new AbortController();lastAttempt=Date.now();active.current=c;setBusy(true);setStatus('Checking GitHub releases…');
  try{const raw=await jsonRequest(RELEASES_API,{},c.signal);if(c.signal.aborted)return;if(!Array.isArray(raw))throw Error('Invalid release response');const found=availableUpdate(raw);lastSuccess=Date.now();cached=found;setRelease(found);setStatus(found?'Windows update available: '+found.version:'No newer matching Windows installer found in recent releases.');}
  catch{if(!c.signal.aborted)setStatus('Could not check GitHub releases. Try again.');}
  finally{if(active.current===c)active.current=null;if(alive.current&&!c.signal.aborted)setBusy(false);}
 };
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.abort();active.current=null;};},[]);
 useEffect(()=>{if(!enabled)return;void check();const id=window.setInterval(()=>void check(),INTERVAL);const visible=()=>{if(document.visibilityState!=='hidden')void check();};document.addEventListener('visibilitychange',visible);return()=>{window.clearInterval(id);document.removeEventListener('visibilitychange',visible);};},[enabled]);
 return {release,status,busy,check:()=>check(true),install,installation,installing,canInstall:!!window.tarnDesktop};
}
