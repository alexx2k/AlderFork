// Keep the account token separate from the demo profile and never store it in URLs or logs.
// IndexedDB is app-origin storage, not a hardware-backed credential vault.
export interface SessionStore {load():Promise<string|null>;save(key:string|null):Promise<void>}
export function createSessionStore(factory:IDBFactory):SessionStore{
 const db=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=factory.open('tarn-webos-account',1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('session'))request.result.createObjectStore('session');};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('Account storage blocked'));
 });
 return {
  async load(){const d=await db;return new Promise((resolve,reject)=>{
   const r=d.transaction('session','readonly').objectStore('session').get('auth');
   r.onsuccess=()=>resolve(typeof r.result==='string'&&r.result?r.result:null);
   r.onerror=()=>reject(r.error);
  });},
  async save(key){const d=await db;return new Promise((resolve,reject)=>{
   const t=d.transaction('session','readwrite'),s=t.objectStore('session');
   t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Session storage aborted'));
   if(key)s.put(key,'auth');else s.delete('auth');
  });}
 };
}
