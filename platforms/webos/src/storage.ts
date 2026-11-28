export const STORE_KEY='tarn.foundation.v1';
export type FoundationState={version:1;profileId:string;name:string;visits:number;updatedAt:number};
export function initialState(now=Date.now()):FoundationState {
 return {version:1,profileId:'local-demo',name:'Viewer',visits:0,updatedAt:now};
}
export function parseState(raw:string|null,now=Date.now()):FoundationState {
 try {
   const s=JSON.parse(raw||'null');
   if(s&&s.version===1&&typeof s.profileId==='string'&&typeof s.name==='string'&&Number.isSafeInteger(s.visits)&&s.visits>=0&&Number.isFinite(s.updatedAt))return s;
 }catch{}
 return initialState(now);
}
export interface StateStore {load():Promise<FoundationState>;save(state:FoundationState):Promise<void>;close():void}
export function createStore(factory:IDBFactory):StateStore {
 const db=new Promise<IDBDatabase>((resolve,reject)=>{
   const request=factory.open('tarn-webos',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('state'))request.result.createObjectStore('state');};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(Error('Storage upgrade blocked'));
 });
 return {
   close(){void db.then(d=>d.close()).catch(()=>{});},
   async load(){const d=await db;return new Promise((resolve,reject)=>{
     const r=d.transaction('state','readonly').objectStore('state').get(STORE_KEY);
     r.onsuccess=()=>resolve(parseState(typeof r.result==='string'?r.result:null));
     r.onerror=()=>reject(r.error);
   });},
   async save(state){const d=await db;return new Promise((resolve,reject)=>{
     const t=d.transaction('state','readwrite');
     t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Storage aborted'));
     t.objectStore('state').put(JSON.stringify(state),STORE_KEY);
   });}
 };
}
