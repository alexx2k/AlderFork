import React,{useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';
import {jsonRequest} from './stremio.ts';
import {AddonCollection} from './useAddonCollection.ts';
import {Catalog,browseCatalogs} from './liveCatalogue.ts';
import {Layout,addonInfo,normalizeManifestUrl,makeDescriptor,orderCatalogues,editLayout,PHONE_ADDONS_URL} from './addonManagement.mjs';
function btn(id:string,label:string,action:()=>void,disabled=false){return <button id={id} data-focus type="button" disabled={disabled} onClick={action}>{label}</button>;}
export function AddonManager({collection,owner,catalogs,layout,onLayout}:{collection:AddonCollection;owner:boolean;catalogs:Catalog[];layout:Layout;onLayout:(next:Layout)=>boolean}){
 const [tab,setTab]=useState<'installed'|'catalogues'>('installed');
 const [url,setUrl]=useState(''),[candidate,setCandidate]=useState<unknown>(null),[checking,setChecking]=useState(false),[note,setNote]=useState('');
 const [showUrl,setShowUrl]=useState(false);
 const [qrOpen,setQrOpen]=useState(false),[qr,setQr]=useState(''),[remove,setRemove]=useState<number|null>(null);
 const fetcher=useRef<AbortController|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;fetcher.current?.abort();};},[]);
 useEffect(()=>{setRemove(null);},[collection.addons]);
 useEffect(()=>{if(!qrOpen)return;let valid=true;QRCode.toDataURL(PHONE_ADDONS_URL,{width:280,margin:3,errorCorrectionLevel:'M'}).then(s=>{if(valid)setQr(s);}).catch(()=>{if(valid)setNote('Could not generate QR. Open the address manually.');});return()=>{valid=false;};},[qrOpen]);
 const inspect=async()=>{
  if(!owner||!collection.loaded||collection.busy||fetcher.current)return;
  setCandidate(null);setNote('');
  let normalized:string;try{normalized=normalizeManifestUrl(url,raw=>new URL(raw));}catch{setNote('Enter a valid HTTP(S) or stremio:// manifest URL.');return;}
  const c=new AbortController();fetcher.current=c;setChecking(true);
  try{
   const raw=await jsonRequest(normalized,{},c.signal);if(c.signal.aborted)return;
   const next=makeDescriptor(normalized,raw);
   if(collection.addons.some((d,i)=>addonInfo(d,i).url===normalized)){setNote('This add-on is already installed.');return;}
   setCandidate(next);setUrl('');setShowUrl(false);setNote('Review this manifest before installing. Only install add-ons you trust.');
   requestAnimationFrame(()=>document.getElementById('addon-install')?.focus());
  }catch{if(!c.signal.aborted)setNote('Could not read a valid manifest. Check the address, connection and add-on CORS support.');}
  finally{if(fetcher.current===c)fetcher.current=null;if(alive.current)setChecking(false);}
 };
 const install=async()=>{if(!owner||!candidate)return;const ok=await collection.edit({kind:'install',descriptor:candidate});if(alive.current&&ok){setCandidate(null);setNote('');requestAnimationFrame(()=>document.getElementById('addon-sync')?.focus());}};
 const move=async(index:number,delta:-1|1)=>{const ok=await collection.edit({kind:'move',index,delta});if(alive.current)requestAnimationFrame(()=>{const at=ok?index+delta:index;const up=document.getElementById('addon-row-'+at) as HTMLButtonElement|null;const down=document.getElementById('addon-down-'+at) as HTMLButtonElement|null;(up&&!up.disabled?up:down&&!down.disabled?down:document.getElementById('addon-sync'))?.focus();});};
 const deleteSelected=async()=>{if(remove===null)return;const i=remove;setRemove(null);await collection.edit({kind:'remove',index:i});if(alive.current)requestAnimationFrame(()=>document.getElementById('addon-sync')?.focus());};
 const browse=browseCatalogs(catalogs),ordered=orderCatalogues(browse,layout,true);
 const changeLayout=(key:string,kind:'toggle'|'move',delta=0)=>{setNote(onLayout(editLayout(layout,browse,key,kind,delta))?'Catalogue layout saved for this profile.':'Layout changed for this session; local storage unavailable.');};
 const blocked=!owner||!collection.loaded||collection.busy||checking;
 return <section className="addon-manager"><h1>My add-ons</h1><p>{owner?'Changes to installed add-ons are shared with other Stremio clients on this account.':'This local profile uses its owner’s installed add-ons. Only the owner can install, remove or reorder them.'}</p><p className="muted">Borrowed streaming providers remain managed by their own profiles; personal and official add-ons are not lent.</p>
 <div className="controls">{btn('addon-tab-installed','Installed add-ons',()=>{setTab('installed');setNote('');},checking)}{btn('addon-tab-catalogues','Catalogue layout',()=>{setTab('catalogues');setNote('');},checking)}{btn('addon-sync',collection.busy?'Synchronising…':'Sync now',()=>{setNote('');void collection.sync();},collection.busy||checking)}</div>
 <p role="status">{collection.status}</p>{note&&<p role="status">{note}</p>}
 {tab==='installed'?<>
 {owner&&<section className="addon-install"><h2>Install an add-on</h2><p>Enter a manifest address, or scan a QR code to install from your phone using the same Stremio account.</p><label htmlFor="addon-url">Manifest URL</label><input id="addon-url" data-focus type={showUrl?'text':'password'} autoComplete="off" maxLength={8192} value={url} disabled={blocked} onChange={e=>{setUrl(e.target.value);setCandidate(null);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void inspect();}}} placeholder="https://…/manifest.json"/>
 <div className="controls">{btn('addon-inspect',checking?'Checking…':'Review manifest',()=>void inspect(),blocked||!url.trim())}{btn('addon-url-visibility',showUrl?'Hide address':'Show address',()=>setShowUrl(!showUrl),checking)}{btn('addon-phone',qrOpen?'Close phone QR':'Install from phone',()=>setQrOpen(!qrOpen),checking)}</div>
 {qrOpen&&<div className="addon-qr">{qr&&<img src={qr} alt="QR code for Stremio web add-ons"/>}<div><strong>Install on your phone</strong><p>Scan the code, sign in to the same Stremio account and install your add-on there. Return here and select Sync now.</p><p className="muted">{PHONE_ADDONS_URL}</p><p className="muted">The QR contains no account token or configured manifest address.</p></div></div>}
 {candidate!==null&&<div className="addon-review"><h3>{addonInfo(candidate,0).name}</h3><p>{addonInfo(candidate,0).roles.join(' · ')}</p><p>{addonInfo(candidate,0).description.slice(0,400)}</p><div className="controls">{btn('addon-install','Install and sync',()=>void install(),blocked)}{btn('addon-cancel-install','Cancel',()=>{setCandidate(null);setNote('');},collection.busy)}</div></div>}</section>}
 <h2>Installed add-ons ({collection.addons.length})</h2>
 {!collection.addons.length&&<p>{collection.loaded?'No installed add-ons.':'Waiting for the account collection.'}</p>}
 {collection.addons.map((raw,i)=>{const a=addonInfo(raw,i);return <article className="addon-row" key={i}><div><h3>{i+1}. {a.name}{a.version?' · '+a.version:''}</h3><p className="muted">{a.roles.join(' · ')||'Unknown resources'}{a.official?' · Built-in':''}{a.locked?' · Protected':''}{a.shareable?' · Eligible for stream lending':''}</p></div><div className="controls">{btn('addon-row-'+i,'Move up',()=>void move(i,-1),blocked||i===0)}{btn('addon-down-'+i,'Move down',()=>void move(i,1),blocked||i===collection.addons.length-1)}{btn('addon-remove-'+i,remove===i?'Cancel removal':'Remove',()=>setRemove(remove===i?null:i),blocked||a.locked)}</div>{remove===i&&<div className="addon-review"><p>Remove {a.name} from the linked Stremio account?</p>{btn('addon-confirm-remove','Confirm removal',()=>void deleteSelected(),blocked)}</div>}</article>;})}
 </>:<><h2>Catalogue visibility and order</h2><p>These settings affect Home, Movies, Series and Discover only. Search, playback, metadata and installed add-ons are unchanged. Settings are specific to this profile.</p>{btn('addon-reset-layout','Reset catalogue layout',()=>{setNote(onLayout({hidden:[],order:[]})?'Default catalogue layout restored.':'Reset for this session only.');})}
 {!ordered.length&&<p>No browseable catalogues are available.</p>}
 {ordered.map((c,i)=>{const key=c.preferenceKey||c.key,hidden=layout.hidden.includes(key);return <article className="addon-row" key={c.key}><div><h3>{c.name}</h3><p className="muted">{c.addon} · {c.type} · {hidden?'Hidden':'Visible'}</p></div><div className="controls">{btn('catalog-toggle-'+i,hidden?'Show':'Hide',()=>changeLayout(key,'toggle'))}{btn('catalog-up-'+i,'Move up',()=>changeLayout(key,'move',-1),i===0)}{btn('catalog-down-'+i,'Move down',()=>changeLayout(key,'move',1),i===ordered.length-1)}</div></article>;})}</>}
 </section>;
}
