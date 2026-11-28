import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {addProfile,checkPin,cleanName,COLORS,completeMigration,deleteHistory, Draft,effectiveAuth,editProfile,historyNamespace,lenderTokens,makeProfile,MAX_PROFILES,migrateHistory,ownerFor,Profile,Profiles,removeProfile,setCredential} from './profiles.mjs';
import {createProfileStore,newProfileId,ProfileStore} from './profileStore.ts';
import {createStore} from './storage.ts';
import {getUserId,revokeSession} from './stremio.ts';
import {clearPlayerSettings} from './playerSettings.ts';
import {clearSessionProgress} from './progress.ts';
import {directionFor,isBack,nextFocus} from './navigation.ts';
import {avatars,services} from './avatarCatalog.ts';
import {SignIn} from './SignIn.tsx';
type Step={kind:'pick'}|{kind:'diagnostics'}|{kind:'pin';id:string;action:'enter'|'edit'}|{kind:'edit';id:string|null}|{kind:'link';id:string|null;draft?:Draft}|{kind:'delete';id:string};
type Active={profile:Profile;token:string};
type Props={renderApp:(profile:Profile,token:string,namespace:string,onSwitch:()=>void,onSignOut:()=>void,onExpired:()=>void,lenders:string[])=>React.ReactNode;renderDiagnostics:()=>React.ReactNode};
function btn(id:string,label:React.ReactNode,action:()=>void,disabled=false,cls=''){
 return <button type="button" data-focus id={id} disabled={disabled} className={cls} onClick={action}>{label}</button>;
}
export function Portrait({profile}:{profile:Pick<Draft,'name'|'color'|'avatar'>}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[profile.avatar]);
 return <span className="profile-portrait" style={{background:profile.color}}>{profile.avatar&&!failed?<img src={profile.avatar} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:cleanName(profile.name).slice(0,1).toUpperCase()||'?'}</span>;
}
function jump(id:string){requestAnimationFrame(()=>document.getElementById(id)?.focus());}
function freshDraft():Draft{return {name:'',color:COLORS[Math.floor(Math.random()*COLORS.length)],avatar:'',pin:''};}
function ProfileEditor({initial,existing,owners,onSave,onDelete,onCancel,busy}:{initial:Draft;existing:Profile|null;owners:Profile[];onSave:(draft:Draft,owner:string|null)=>void;onDelete:()=>void;onCancel:()=>void;busy:boolean}){
 const [draft,setDraft]=useState<Draft>(initial);
 const [owner,setOwner]=useState<string|null>(existing?.ownerId||owners[0]?.id||null);
 const [gallery,setGallery]=useState(false);
 const [service,setService]=useState(services[0]||'Netflix');
 const [group,setGroup]=useState('');
 const [limit,setLimit]=useState(36);
 const [keyboard,setKeyboard]=useState(false);
 const [caps,setCaps]=useState(false);
 const groups=Array.from(new Set(avatars.filter(a=>a.service===service).map(a=>a.group)));
 const icons=avatars.filter(a=>a.service===service&&(!group||a.group===group));
 const change=(patch:Partial<Draft>)=>setDraft(d=>({...d,...patch}));
 return <section className="profile-editor"><h1>{existing?'Edit profile':'Create profile'}</h1>
 <div className="profile-edit-preview"><Portrait profile={draft}/><div><label htmlFor="profile-name">Profile name</label><input id="profile-name" data-focus maxLength={24} value={draft.name} onChange={e=>change({name:e.target.value})}/>{btn('profile-keyboard',keyboard?'Hide keyboard':'On-screen keyboard',()=>{setKeyboard(!keyboard);if(!keyboard)jump('profile-key-0');},busy)}</div></div>
 {keyboard&&<div className="search-keys">{(caps?'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789':'abcdefghijklmnopqrstuvwxyz0123456789').split('').map((k,i)=><button type="button" data-focus key={i} id={'profile-key-'+i} onClick={()=>setDraft(d=>({...d,name:(d.name+k).slice(0,24)}))}>{k}</button>)}{btn('profile-caps','Shift',()=>setCaps(!caps))}{btn('profile-space','Space',()=>setDraft(d=>({...d,name:(d.name+' ').slice(0,24)})))}{btn('profile-delete-char','Delete',()=>setDraft(d=>({...d,name:d.name.slice(0,-1)})))}</div>}
 <div className="controls">{btn('avatar-gallery',gallery?'Hide avatars':'Browse pre-loaded avatars',()=>{setGallery(!gallery);if(!gallery)jump('avatar-service-0');},busy)}{btn('avatar-initials','Use initials instead',()=>{change({avatar:''});setGallery(false);},busy)}</div>
 {gallery&&<section className="avatar-browser"><h2>Avatar gallery</h2><div className="filter-strip">{services.map((s,i)=><button key={s} id={'avatar-service-'+i} data-focus type="button" className={s===service?'filter-active':''} onClick={()=>{setService(s);setGroup('');setLimit(36);}}>{s}</button>)}</div><div className="filter-strip">{btn('avatar-group-all','All collections',()=>{setGroup('');setLimit(36);},false,!group?'filter-active':'')}{groups.map((g,i)=><button key={g} id={'avatar-group-'+i} data-focus type="button" className={g===group?'filter-active':''} onClick={()=>{setGroup(g);setLimit(36);}}>{g}</button>)}</div><div className="avatar-grid">{icons.slice(0,limit).map((a,i)=><button type="button" data-focus id={'avatar-icon-'+i} key={a.url+'-'+i} className={draft.avatar===a.url?'filter-active':''} aria-label={a.name} onClick={()=>{change({avatar:a.url});setGallery(false);jump('avatar-gallery');}}><img src={a.url} alt="" loading="lazy" referrerPolicy="no-referrer"/><small>{a.name}</small></button>)}</div>{icons.length>limit&&btn('avatar-more','More avatars',()=>setLimit(n=>n+36))}</section>}
 <h2>Profile colour</h2><div className="controls">{COLORS.map((c,i)=><button key={c} id={'profile-color-'+i} data-focus type="button" className={draft.color===c?'filter-active profile-swatch':'profile-swatch'} style={{background:c}} aria-label={'Colour '+(i+1)} onClick={()=>change({color:c})}>{draft.color===c?'✓':' '}</button>)}</div>
 <h2>Optional profile PIN</h2><p className="muted">A four-digit household lock, not an account password.</p><input id="profile-pin" data-focus type="password" inputMode="numeric" maxLength={4} value={draft.pin} onChange={e=>change({pin:e.target.value.replace(/\D/g,'').slice(0,4)})}/><div className="pin-keys">{'1234567890'.split('').map(n=><button key={n} id={'edit-pin-'+n} data-focus type="button" onClick={()=>setDraft(d=>({...d,pin:(d.pin+n).slice(0,4)}))}>{n}</button>)}{btn('edit-pin-clear','Clear PIN',()=>change({pin:''}))}</div>
 {!existing&&<><h2>Streaming account</h2><p className="muted">Local profiles share a linked owner's sources but have independent local playback history.</p><div className="filter-strip">{owners.map((p,i)=><button key={p.id} id={'profile-owner-'+i} data-focus type="button" className={owner===p.id?'filter-active':''} onClick={()=>setOwner(p.id)}>Share {p.name}'s account</button>)}{btn('profile-own-account','Link a separate Stremio account',()=>setOwner(null),false,owner===null?'filter-active':'')}</div></>}
 {existing?.mode==='stremio'&&<><h2>Household streaming access</h2><p className="muted">Opt in to lend eligible stream add-ons to other profiles. Your login, catalogues and history are not copied to them.</p>{btn('profile-share-streams',draft.sharesStreams?'Share streaming sources: On':'Share streaming sources: Off',()=>change({sharesStreams:!draft.sharesStreams}),busy,draft.sharesStreams?'filter-active':'')}</>}
 <div className="controls">{btn('profile-save',existing?'Save changes':owner?'Create profile':'Continue to sign-in',()=>onSave(draft,owner),busy||!cleanName(draft.name)||!!draft.pin&&draft.pin.length!==4,'primary')}{btn('profile-cancel','Cancel',onCancel,busy)}{existing&&btn('profile-remove','Delete profile',onDelete,busy)}</div></section>;
}
function PinPrompt({profile,onCorrect,onCancel}:{profile:Profile;onCorrect:()=>void;onCancel:()=>void}){
 const [pin,setPin]=useState('');const [error,setError]=useState('');
 const submit=(value=pin)=>{if(checkPin(profile,value)){onCorrect();return;}setPin('');setError('Incorrect PIN. Try again.');};
 const digit=(n:string)=>{const next=(pin+n).slice(0,4);setPin(next);if(next.length===4)submit(next);};
 return <section className="profile-pin-panel"><Portrait profile={profile}/><h1>Enter {profile.name}'s PIN</h1><input id="unlock-pin" data-focus type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>{const value=e.target.value.replace(/\D/g,'').slice(0,4);setPin(value);if(value.length===4)submit(value);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();submit();}}}/><div className="pin-keys">{'1234567890'.split('').map(n=><button key={n} id={'unlock-'+n} data-focus type="button" onClick={()=>digit(n)}>{n}</button>)}{btn('unlock-clear','Clear',()=>setPin(''))}{btn('unlock-cancel','Cancel',onCancel)}</div><p role="status" className="warn">{error}</p></section>;
}
export function ProfileGate({renderApp,renderDiagnostics}:Props){
 const [data,setData]=useState<Profiles|null>(null);
 const store=useRef<ProfileStore|null>(null);
 const model=useRef<Profiles|null>(null);
 const [active,setActive]=useState<Active|null>(null);
 const [step,setStep]=useState<Step>({kind:'pick'});
 const [manage,setManage]=useState(false);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);const lock=useRef(false);
 const [boot,setBoot]=useState(0);
 const currentStep=useRef(step);currentStep.current=step;
 const resetRoute=()=>{history.replaceState(null,'',location.pathname+location.search);};
 useEffect(()=>{let alive=true;setError('');setData(null);(async()=>{
  try{
   let name='Viewer';try{name=(await createStore(indexedDB).load()).name;}catch{}
   const s=createProfileStore(indexedDB);const d=await s.load(name);
   if(alive){store.current=s;model.current=d;setData(d);}
  }catch{if(alive)setError('Could not open profile storage. No stored account was replaced. Retry or check browser storage.');}
 })();return()=>{alive=false;};},[boot]);
 const commit=async(next:Profiles)=>{if(!store.current)throw Error('Profile storage unavailable.');await store.current.save(next);model.current=next;setData(next);};
 const run=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Profile operation failed.');}finally{lock.current=false;setBusy(false);}};
 const pick=()=>{if(lock.current)return;setStep({kind:'pick'});setError('');};
 const activate=async(id:string)=>{
  let d=model.current;if(!d)return;const p=d.profiles.find(x=>x.id===id),owner=ownerFor(d,id);if(!p||!owner)return;
  if(!owner.authKey){if(p.mode==='local'){setError('Ask '+owner.name+' to link their account again.');setStep({kind:'pick'});return;}setStep({kind:'link',id});return;}
  if(owner.legacyPending&&p.id===owner.id){
   try{const oldId=await getUserId(owner.authKey);migrateHistory(localStorage,oldId,p.id);d=completeMigration(d,p.id);await commit(d);}
   catch{setError('Existing history could not be migrated yet. The original records are retained; switch back to this profile later to retry.');d=model.current!;}
  }
  const selected=d.profiles.find(x=>x.id===id);const token=effectiveAuth(d,id);
  if(selected&&token){resetRoute();clearSessionProgress();setActive({profile:selected,token});setStep({kind:'pick'});setManage(false);}
 };
 const authorize=(p:Profile,action:'enter'|'edit')=>{setError('');if(p.pin){setStep({kind:'pin',id:p.id,action});return;}if(action==='edit')setStep({kind:'edit',id:p.id});else void run(()=>activate(p.id));};
 const switchProfile=()=>{resetRoute();setError('');setActive(null);setManage(false);setStep({kind:'pick'});};
 const disconnect=(expired:boolean)=>{
  if(!active)return;const current=active;const d=model.current;if(!d)return;
  const owner=ownerFor(d,current.profile.id);if(!owner||(!expired&&current.profile.mode!=='stremio'))return;
  void run(async()=>{const token=owner.authKey;await commit(setCredential(d,owner.id,null));switchProfile();setError(expired?'Account session expired. Relink '+owner.name+' to restore streaming.':'Signed out. Profile and local history retained.');if(!expired&&token&&!model.current!.profiles.some(x=>x.authKey===token))revokeSession(token).catch(()=>{});});
 };
 const saveDraft=(draft:Draft,owner:string|null)=>{if(step.kind!=='edit'||!model.current)return;const id=step.id;
  if(id){void run(async()=>{await commit(editProfile(model.current!,id,draft));setStep({kind:'pick'});});return;}
  if(!owner){setStep({kind:'link',id:null,draft});return;}
  void run(async()=>{const p=makeProfile(newProfileId(),draft,null,owner);await commit(addProfile(model.current!,p));await activate(p.id);});
 };
 const linked=async(token:string)=>{
  const target=currentStep.current;if(target.kind!=='link')return;
  await run(async()=>{let d=model.current!;let id=target.id;
   if(id)d=setCredential(d,id,token);
   else{const p=makeProfile(newProfileId(),target.draft!,token);id=p.id;d=addProfile(d,p);}
   await commit(d);await activate(id!);
  });
 };
 const remove=(id:string)=>{void run(async()=>{const d=model.current!;const p=d.profiles.find(x=>x.id===id);await commit(removeProfile(d,id));clearPlayerSettings(historyNamespace(id));try{deleteHistory(localStorage,id);}catch{setError('Profile removed, but local history cleanup failed.');}if(p?.mode==='stremio'&&p.authKey&&!model.current!.profiles.some(x=>x.authKey===p.authKey))revokeSession(p.authKey).catch(()=>{});setStep({kind:'pick'});});};
 useLayoutEffect(()=>{if(active||busy)return;const id=step.kind==='diagnostics'?'diagnostics-back':step.kind==='pin'?'unlock-1':step.kind==='edit'?'profile-name':step.kind==='link'?'retry-link':step.kind==='delete'?'delete-cancel':data?.profiles.length?'pick-'+data.profiles[0].id:'add-profile';jump(id);},[active,step,data,busy]);
 useEffect(()=>{if(active)return;const handler=(e:KeyboardEvent)=>{
  const target=e.target as HTMLElement,typing=target.tagName==='INPUT';
  if(isBack(e.key,e.keyCode)){if(step.kind!=='pick'){e.preventDefault();if(!lock.current)pick();}return;}
  const dir=directionFor(e.key,e.keyCode);if(!dir||typing&&dir!=='down')return;
  e.preventDefault();
  const items=Array.from(document.querySelectorAll<HTMLElement>('[data-focus]:not([disabled])')).filter(x=>x.getClientRects().length>0);
  const r=(el:HTMLElement)=>{const a=el.getBoundingClientRect();return {id:el.id,left:a.left,right:a.right,top:a.top,bottom:a.bottom};};
  const current=document.activeElement as HTMLElement;const next=items.includes(current)?nextFocus(r(current),items.map(r),dir):items[0]?.id;
  if(next)document.getElementById(next)?.focus();
 };document.addEventListener('keydown',handler);return()=>document.removeEventListener('keydown',handler);},[active,step]);
 if(active)return <>{renderApp(active.profile,active.token,historyNamespace(active.profile.id),()=>{if(!lock.current)switchProfile();},()=>disconnect(false),()=>disconnect(true),lenderTokens(model.current!,active.profile.id))}{error&&<div className="profile-alert" role="status">{error}<button type="button" id="profile-dismiss-alert" data-focus onClick={()=>setError('')}>Dismiss</button></div>}</>;
 const p=step.kind==='pin'||step.kind==='edit'||step.kind==='delete'?data?.profiles.find(p=>p.id===step.id):undefined;
 return <div className="app profile-app"><header><img className="brand" src="assets/lockup.svg" alt="Tarn"/><span className="dev">webOS • 0.4.0-dev.3 • Development</span></header>{error&&<p className="warn" role="status">{error}</p>}{busy&&<p role="status">Saving profile or migrating history…</p>}
 {!data?<section><p>{error?'Profile storage unavailable.':'Opening profiles…'}</p>{error&&btn('profile-retry','Retry',()=>setBoot(x=>x+1))}</section>:
 step.kind==='pick'?<section className="profile-picker"><h1>{manage?'Manage profiles':"Who's watching?"}</h1><div className="profile-grid">{data.profiles.map(p=><button key={p.id} id={'pick-'+p.id} data-focus type="button" className="profile-tile" disabled={busy} onClick={()=>authorize(p,manage?'edit':'enter')}><Portrait profile={p}/><strong>{p.name}{p.pin?' 🔒':''}</strong><small>{p.mode==='local'?'Local profile':'Stremio profile'}{!effectiveAuth(data,p.id)?' · Link required':''}</small></button>)}{data.profiles.length<MAX_PROFILES&&btn('add-profile',<><span className="profile-portrait profile-add">+</span><strong>Add profile</strong></>,()=>setStep({kind:'edit',id:null}),busy,'profile-tile')}</div><div className="controls">{data.profiles.length>0&&btn('manage-profiles',manage?'Done':'Manage profiles',()=>setManage(!manage),busy)}{btn('profile-diagnostics','Diagnostics',()=>setStep({kind:'diagnostics'}),busy)}</div></section>:
 step.kind==='diagnostics'?<section>{btn('diagnostics-back','‹ Back',pick)}{renderDiagnostics()}</section>:
 step.kind==='pin'&&p?<PinPrompt profile={p} onCancel={pick} onCorrect={()=>{if(lock.current)return;if(step.action==='edit')setStep({kind:'edit',id:p.id});else void run(()=>activate(p.id));}}/>:
 step.kind==='edit'?<ProfileEditor key={step.id||'new'} initial={p?{name:p.name,color:p.color,avatar:p.avatar,pin:p.pin,sharesStreams:!!p.sharesStreams}:freshDraft()} existing={p||null} owners={data.profiles.filter(x=>x.mode==='stremio'&&!!x.authKey)} onSave={saveDraft} onDelete={()=>{if(p)setStep({kind:'delete',id:p.id});}} onCancel={pick} busy={busy}/>:
 step.kind==='delete'&&p?<section><h1>Delete {p.name}?</h1><p>This removes the profile and its local progress and source memory. It does not delete the Stremio account.</p><div className="controls">{btn('delete-cancel','Cancel',pick,busy)}{btn('delete-confirm','Delete profile',()=>remove(p.id),busy)}</div></section>:
 step.kind==='link'?<SignIn onLinked={linked} onCancel={pick}/>:null}
 </div>;
}
