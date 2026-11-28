import {providerKey} from './advancedPlayback.mjs';
const memory=new Map<string,string>();
export function readProvider(namespace:string,titleId:string):string|null{
 const key=providerKey(namespace,titleId);if(memory.has(key))return memory.get(key)||null;
 try{const value=localStorage.getItem(key);return value&&value.length<=256?value:null;}catch{return null;}
}
export function saveProvider(namespace:string,titleId:string,provider:string){
 if(!namespace||!titleId||!provider||provider.length>256)return;
 const key=providerKey(namespace,titleId);memory.set(key,provider);try{localStorage.setItem(key,provider);}catch{}
}
export function forgetProvider(namespace:string,titleId:string){const key=providerKey(namespace,titleId);memory.delete(key);try{localStorage.removeItem(key);}catch{}}
export function forgetProviderMemory(namespace:string){const prefix=providerKey(namespace,'');for(const k of memory.keys())if(k.startsWith(prefix))memory.delete(k);}
