export const MAX_PROFILES=5;
export const COLORS=['#F3D9B1','#C98E6A','#8FA39A','#A6A2BD','#D3A66B'];
export const cleanName=value=>typeof value==='string'?value.trim().slice(0,24):'';
export const validPin=value=>value===''||typeof value==='string'&&/^\d{4}$/.test(value);
export const validAvatar=value=>typeof value==='string'&&value.length<=2048&&/^https:\/\/[^\s]+$/i.test(value);
export function emptyProfiles(){return {version:1,profiles:[]};}
export function makeProfile(id,draft,authKey=null,ownerId=null){
 const name=cleanName(draft.name);if(!name||!validPin(draft.pin))throw Error('Enter a name and an optional four-digit PIN.');
 if(typeof id!=='string'||!/^p-[a-z0-9-]{8,80}$/.test(id))throw Error('Invalid profile ID.');
 return {id,name,color:COLORS.includes(draft.color)?draft.color:COLORS[0],avatar:validAvatar(draft.avatar)?draft.avatar:'',pin:draft.pin||'',mode:ownerId?'local':'stremio',ownerId:ownerId||null,authKey:ownerId?null:authKey,legacyPending:false};
}
export function migrateProfiles(token,name,id){
 if(!token)return emptyProfiles();
 const profile=makeProfile(id,{name:cleanName(name)||'Viewer',color:COLORS[0],avatar:'',pin:''},token);
 return {version:1,profiles:[{...profile,legacyPending:true}]};
}
export function ownerFor(data,id){
 const p=data.profiles.find(p=>p.id===id);
 return !p?undefined:p.mode==='stremio'?p:data.profiles.find(o=>o.id===p.ownerId&&o.mode==='stremio');
}
export function effectiveAuth(data,id){return ownerFor(data,id)?.authKey||null;}
export function checkPin(profile,pin){return !profile.pin||profile.pin===pin;}
export function addProfile(data,profile){
 if(data.profiles.length>=MAX_PROFILES)throw Error('Maximum of five profiles.');
 if(data.profiles.some(p=>p.id===profile.id))throw Error('Profile already exists.');
 if(profile.mode==='local'&&!data.profiles.some(p=>p.id===profile.ownerId&&p.mode==='stremio'&&p.authKey))throw Error('Choose a linked Stremio account.');
 return {...data,profiles:[...data.profiles,profile]};
}
export function editProfile(data,id,draft){
 const p=data.profiles.find(p=>p.id===id);if(!p)throw Error('Profile not found.');
 const checked=makeProfile(id,draft,p.authKey,p.ownerId);
 return {...data,profiles:data.profiles.map(x=>x.id===id?{...x,name:checked.name,color:checked.color,avatar:checked.avatar,pin:checked.pin}:x)};
}
export function removeProfile(data,id){
 if(data.profiles.some(p=>p.mode==='local'&&p.ownerId===id))throw Error('Remove dependent local profiles first.');
 return {...data,profiles:data.profiles.filter(p=>p.id!==id)};
}
export function setCredential(data,id,token){
 const owner=data.profiles.find(p=>p.id===id&&p.mode==='stremio');
 if(!owner)throw Error('Only the account owner can link or sign out.');
 return {...data,profiles:data.profiles.map(p=>p.id===id?{...p,authKey:token,legacyPending:p.authKey===token&&p.legacyPending}:p)};
}
export function completeMigration(data,id){return {...data,profiles:data.profiles.map(p=>p.id===id?{...p,legacyPending:false}:p)};}
export function parseProfiles(raw){
 if(!raw||raw.version!==1||!Array.isArray(raw.profiles)||raw.profiles.length>MAX_PROFILES)throw Error('Invalid profile storage.');
 const ids=new Set();
 for(const p of raw.profiles){
  if(!p||typeof p.id!=='string'||!/^p-[a-z0-9-]{8,80}$/.test(p.id)||ids.has(p.id)||!cleanName(p.name)||!validPin(p.pin)||!COLORS.includes(p.color)||typeof p.avatar!=='string'||p.avatar!==''&&!validAvatar(p.avatar)||typeof p.legacyPending!=='boolean'||!['local','stremio'].includes(p.mode))throw Error('Invalid stored profile.');
  if(p.mode==='stremio'&&(p.ownerId!==null||p.authKey!==null&&typeof p.authKey!=='string'))throw Error('Invalid account owner.');
  if(p.mode==='local'&&(p.authKey!==null||typeof p.ownerId!=='string'||p.legacyPending))throw Error('Invalid local profile.');
  ids.add(p.id);
 }
 for(const p of raw.profiles)if(p.mode==='local'&&!ownerFor(raw,p.id))throw Error('Missing account owner.');
 return raw;
}
export function historyNamespace(id){return 'profile:'+id;}
export function historyPrefix(kind,namespace){return 'tarn.'+kind+'.v1:'+encodeURIComponent(namespace)+':';}
export function migrateHistory(storage,oldAccount,profileId){
 if(!oldAccount)throw Error('Account identity required for history migration.');
 const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key)keys.push(key);}
 let copied=0;
 for(const kind of ['progress','source']){
  const from=historyPrefix(kind,oldAccount),to=historyPrefix(kind,historyNamespace(profileId));
  for(const key of keys){if(!key.startsWith(from))continue;const target=to+key.slice(from.length),value=storage.getItem(key);if(value!==null&&storage.getItem(target)===null){storage.setItem(target,value);copied++;}}
 }
 return copied;
}
export function deleteHistory(storage,profileId){
 const prefixes=['progress','source'].map(kind=>historyPrefix(kind,historyNamespace(profileId)));
 const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&prefixes.some(p=>key.startsWith(p)))keys.push(key);}
 for(const key of keys)storage.removeItem(key);
}
