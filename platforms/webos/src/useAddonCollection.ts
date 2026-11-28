import {useEffect,useRef,useState} from 'react';
import {installedAddons,writeAddons,ApiError} from './stremio.ts';
import {planCollectionEdit,sameCollection,sameOrder,CollectionEdit} from './addonManagement.mjs';
export function useAddonCollection(token:string,writable:boolean,refresh:number,onExpired:()=>void){
 const [addons,setAddons]=useState<unknown[]>([]),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('Loading installed add-ons…');
 const current=useRef<unknown[]>([]),ready=useRef(false),active=useRef<AbortController|null>(null),alive=useRef(true),expired=useRef(onExpired);expired.current=onExpired;
 const publish=(list:unknown[])=>{const changed=!ready.current||!sameCollection(current.current,list);current.current=list;ready.current=true;if(alive.current){if(changed)setAddons(list);setLoaded(true);}};
 const invalidate=()=>{ready.current=false;if(alive.current)setLoaded(false);};
 const run=async(edit?:CollectionEdit)=>{
  if(active.current||!alive.current)return false;
  if(edit&&(!writable||!ready.current)){setStatus('Only an account owner with a freshly loaded list can make changes.');return false;}
  const c=new AbortController();active.current=c;setBusy(true);setStatus(edit?'Checking latest Stremio collection…':'Synchronising installed add-ons…');
  let writeStarted=false;
  try{
   const before=current.current,fresh=await installedAddons(token,c.signal);if(c.signal.aborted)return false;
   if(!edit){publish(fresh);setStatus('Installed add-ons synchronised.');return true;}
   let next:unknown[];try{const plan=planCollectionEdit(before,fresh,edit,writable);if(plan.conflict){publish(fresh);setStatus('Collection changed on another device. Review the refreshed list and try again.');return false;}next=plan.next;}catch(e){setStatus(e instanceof Error?e.message:'Invalid change.');return false;}
   writeStarted=true;setStatus('Saving to Stremio…');await writeAddons(token,next,c.signal);
   if(c.signal.aborted)return false;
   const verified=await installedAddons(token,c.signal);if(c.signal.aborted)return false;
   publish(verified);const matched=sameOrder(verified,next);setStatus(matched?'Saved and synchronised with Stremio.':'Stremio returned a different collection. Review the refreshed list.');return matched;
  }catch(e){
   if(c.signal.aborted)return false;
   if(e instanceof ApiError&&e.code===1){invalidate();expired.current();return false;}
   invalidate();setStatus(writeStarted?'Save outcome unknown. Sync now before making another change.':'Could not load the collection. Sync now to retry.');return false;
  }finally{if(active.current===c)active.current=null;if(alive.current&&!c.signal.aborted)setBusy(false);}
 };
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;active.current?.abort();active.current=null;};},[]);
 useEffect(()=>{void run();},[token,refresh]);
 return {addons,loaded,busy,status,sync:()=>run(),edit:(edit:CollectionEdit)=>run(edit)};
}
export type AddonCollection=ReturnType<typeof useAddonCollection>;
