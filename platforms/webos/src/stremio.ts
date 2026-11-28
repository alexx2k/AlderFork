// Direct Stremio account integration. Never log response bodies, tokens or transport URLs.
export class ApiError extends Error {
 readonly code:number;
 constructor(code:number){super('Stremio API error '+code);this.code=code;}
}
export type JsonObject=Record<string,unknown>;
export function object(value:unknown):JsonObject{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as JsonObject:{};
}
export function string(value:unknown):string{return typeof value==='string'?value:'';}
export function array(value:unknown):unknown[]{return Array.isArray(value)?value:[];}
export function unwrap(value:unknown):JsonObject{
 const body=object(value),error=object(body.error);
 if(body.error)throw new ApiError(typeof error.code==='number'?error.code:Number(error.code)||0);
 if(!body.result||typeof body.result!=='object'||Array.isArray(body.result))throw Error('Unexpected Stremio response');
 return object(body.result);
}
export async function jsonRequest(url:string,init:RequestInit={},signal?:AbortSignal):Promise<unknown>{
 const controller=new AbortController();
 const cancel=()=>controller.abort();
 if(signal){if(signal.aborted)cancel();else signal.addEventListener('abort',cancel);}
 const timeout=setTimeout(cancel,15000);
 try{
  const response=await fetch(url,{...init,signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timeout);if(signal)signal.removeEventListener('abort',cancel);}
}
const API='https://api.strem.io/api/';
const LINK='https://link.stremio.com/api/v2/';
export type DeviceLink={code:string;url:string};
export async function createLink(signal?:AbortSignal):Promise<DeviceLink>{
 const data=unwrap(await jsonRequest(LINK+'create?type=Create',{},signal));
 const code=string(data.code),url=string(data.link);
 const parsed=new URL(url);
 if(!code||code.length>32||parsed.protocol!=='https:'||!(/(^|\.)stremio\.com$/i.test(parsed.hostname)))throw Error('Unexpected sign-in link');
 return {code,url};
}
export async function readLink(code:string,signal?:AbortSignal):Promise<string|null>{
 try{
  const result=unwrap(await jsonRequest(LINK+'read?type=Read&code='+encodeURIComponent(code),{},signal));
  const auth=string(result.authKey);
  if(!auth)throw Error('Missing session token');
  return auth;
 }catch(error){if(error instanceof ApiError&&error.code===101)return null;throw error;}
}
function post(method:string,body:JsonObject,signal?:AbortSignal){
 return jsonRequest(API+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},signal);
}
export async function installedAddons(authKey:string,signal?:AbortSignal):Promise<unknown[]>{
 const data=unwrap(await post('addonCollectionGet',{type:'AddonCollectionGet',authKey,update:true},signal));
 if(!Array.isArray(data.addons))throw Error('Unexpected add-on collection');
 return data.addons;
}
export async function revokeSession(authKey:string):Promise<void>{
 unwrap(await post('logout',{type:'Logout',authKey}));
}

export async function getUserId(authKey:string,signal?:AbortSignal):Promise<string>{
 const data=unwrap(await post('getUser',{type:'GetUser',authKey},signal));
 const id=string(data._id);if(!id)throw Error('Missing account identifier');return id;
}

export async function readLibraryItems(authKey:string,ids:string[]=[],signal?:AbortSignal):Promise<JsonObject[]>{
 const raw=object(await post('datastoreGet',{authKey,collection:'libraryItem',ids,all:ids.length===0},signal));
 if(raw.error)throw new ApiError(Number(object(raw.error).code)||0);
 if(!Array.isArray(raw.result))throw Error('Invalid library response');
 return raw.result.map(object).filter(x=>typeof x._id==='string');
}
export async function writeLibraryItems(authKey:string,changes:JsonObject[],signal?:AbortSignal):Promise<void>{
 const raw=object(await post('datastorePut',{authKey,collection:'libraryItem',changes},signal));
 if(raw.error)throw new ApiError(Number(object(raw.error).code)||0);
 if(!Object.prototype.hasOwnProperty.call(raw,'result'))throw Error('Invalid library write response');
}

export async function writeAddons(authKey:string,addons:unknown[],signal?:AbortSignal):Promise<void>{
 const body=object(await post('addonCollectionSet',{type:'AddonCollectionSet',authKey,addons},signal));
 if(body.error)throw new ApiError(Number(object(body.error).code)||0);
 if(!Object.prototype.hasOwnProperty.call(body,'result'))throw Error('Unexpected add-on save response');
}
