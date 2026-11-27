import {Profiles,migrateProfiles,parseProfiles} from './profiles.mjs';
export function newProfileId(){
 const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
 return 'p-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export interface ProfileStore{load(name:string):Promise<Profiles>;save(data:Profiles):Promise<void>}
export function createProfileStore(factory:IDBFactory):ProfileStore{
 // Reuse the old account DB. Transfer the old auth key and write the new record in a single transaction.
 const db=new Promise<IDBDatabase>((resolve,reject)=>{
  const r=factory.open('tarn-webos-account',1);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('session'))r.result.createObjectStore('session');};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Account storage blocked'));
 });
 return {
  async load(name){const d=await db;return new Promise((resolve,reject)=>{
   const t=d.transaction('session','readwrite'),s=t.objectStore('session');let value:Profiles;
   t.oncomplete=()=>resolve(value);t.onabort=()=>reject(t.error||Error('Profile migration failed'));t.onerror=()=>reject(t.error);
   const r=s.get('profiles-v1');
   r.onsuccess=()=>{try{
    if(r.result!==undefined){value=parseProfiles(r.result);return;}
    const old=s.get('auth');old.onsuccess=()=>{try{value=migrateProfiles(typeof old.result==='string'&&old.result?old.result:null,name,newProfileId());s.put(value,'profiles-v1');s.delete('auth');}catch{t.abort();}};
   }catch{t.abort();}};
  });},
  async save(data){parseProfiles(data);const d=await db;return new Promise((resolve,reject)=>{
   const t=d.transaction('session','readwrite');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Profile save failed'));t.objectStore('session').put(data,'profiles-v1');
  });}
 };
}
