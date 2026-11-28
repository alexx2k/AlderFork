import {useEffect,useRef,useState} from 'react';
import type {Thumbnail} from './viewingExperience.mjs';
// Separate muted decoder; never seeks the main player. CORS is deliberately enforced.
export function useScrubPreview(url:string|undefined,seconds:number|null,hasStoryboard:boolean,enabled:boolean):Thumbnail|null{
 const [frame,setFrame]=useState<Thumbnail|null>(null);
 const video=useRef<HTMLVideoElement|null>(null),failed=useRef(false),cache=useRef(new Map<number,Thumbnail>());
 const target=seconds===null?null:Math.floor(seconds/5)*5;
 const release=()=>{const v=video.current;if(v){v.pause();v.removeAttribute('src');v.load();video.current=null;}};
 useEffect(()=>{failed.current=false;cache.current.clear();setFrame(null);return release;},[url]);
 useEffect(()=>{
  setFrame(null);if(!enabled||!url||target===null||hasStoryboard||failed.current)return;
  const cached=cache.current.get(target);if(cached){setFrame(cached);return;}
  let cancelled=false,deadline:number|undefined,cleanup=()=>{};
  const timer=window.setTimeout(()=>{
   if(cancelled)return;
   const v=video.current||document.createElement('video');video.current=v;
   let wanted:number|null=null;
   const fail=()=>{if(cancelled)return;failed.current=true;cleanup();release();};
   const draw=()=>{if(cancelled||wanted===null||Math.abs(v.currentTime-wanted)>1||v.seeking||v.readyState<2||!v.videoWidth)return;try{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=Math.max(1,Math.min(160,Math.round(160*v.videoHeight/v.videoWidth)));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');ctx.drawImage(v,0,0,canvas.width,canvas.height);const data:Thumbnail={start:target,end:target+5,url:canvas.toDataURL('image/jpeg',.72)};if(cache.current.size>=24)cache.current.delete(cache.current.keys().next().value!);cache.current.set(target,data);setFrame(data);cleanup();}catch{fail();}};
   const seek=()=>{if(cancelled||!Number.isFinite(v.duration)||v.duration<=0)return;try{wanted=Math.min(Math.max(0,v.duration-.5),target);if(Math.abs(v.currentTime-wanted)<.15)draw();else v.currentTime=wanted;}catch{fail();}};
   cleanup=()=>{v.removeEventListener('loadedmetadata',seek);v.removeEventListener('loadeddata',draw);v.removeEventListener('seeked',draw);v.removeEventListener('error',fail);if(deadline!==undefined)window.clearTimeout(deadline);};
   v.addEventListener('loadedmetadata',seek);v.addEventListener('loadeddata',draw);v.addEventListener('seeked',draw);v.addEventListener('error',fail);
   deadline=window.setTimeout(fail,6500);
   if(!v.src){v.crossOrigin='anonymous';v.muted=true;v.preload='metadata';v.src=url;v.load();}else seek();
  },450);
  return()=>{cancelled=true;window.clearTimeout(timer);cleanup();};
 },[url,target,hasStoryboard,enabled]);
 useEffect(()=>{if(!enabled||target===null||hasStoryboard)release();},[enabled,target===null,hasStoryboard]);
 return frame&&target!==null&&frame.start===target?frame:null;
}
