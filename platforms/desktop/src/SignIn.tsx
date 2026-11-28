import React,{useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';
import {createLink,readLink,DeviceLink} from './stremio.ts';
export function SignIn({onLinked,onCancel}:{onLinked:(token:string)=>Promise<void>;onCancel:()=>void}){
 const [link,setLink]=useState<DeviceLink|null>(null);
 const [qr,setQr]=useState('');
 const [status,setStatus]=useState('Requesting a sign-in code…');
 const [retry,setRetry]=useState(0);
 const [busy,setBusy]=useState(true),[linking,setLinking]=useState(false);
 const callback=useRef(onLinked);callback.current=onLinked;
 useEffect(()=>{
  const controller=new AbortController(),signal=controller.signal;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const stop=()=>{controller.abort();if(timer!==undefined)clearTimeout(timer);};
  setLink(null);setQr('');setBusy(true);setLinking(false);setStatus('Requesting a sign-in code…');
  (async()=>{
   try{
    const data=await createLink(signal);
    if(signal.aborted)return;
    setLink(data);
    QRCode.toDataURL(data.url,{width:320,margin:3,errorCorrectionLevel:'M'}).then(value=>{if(!signal.aborted)setQr(value);}).catch(()=>{});
    setStatus('Waiting for you to approve sign-in…');
    const expires=Date.now()+5*60*1000;
    const poll=async()=>{
     if(signal.aborted)return;
     if(Date.now()>=expires){setStatus('Code expired. Request a new code.');setBusy(false);return;}
     try{
      const token=await readLink(data.code,signal);
      if(signal.aborted)return;
      if(token){
       setStatus('Account linked. Opening Tarn…');setLinking(true);
       try{await callback.current(token);}catch{if(!signal.aborted){setStatus('Account linked, but profile could not be saved. Request a new code to retry.');setBusy(false);setLinking(false);}}
       return;
      }
      setStatus('Waiting for you to approve sign-in…');
     }catch{if(!signal.aborted)setStatus('Could not check sign-in. Retrying…');}
     if(!signal.aborted)timer=setTimeout(poll,2500);
    };
    timer=setTimeout(poll,1800);
   }catch{if(!signal.aborted){setBusy(false);setStatus('Could not request a sign-in code. Check the connection and retry.');}}
  })();
  return stop;
 },[retry]);
 return <section className="sign-in"><p className="eyebrow">LINK YOUR ACCOUNT</p><h1>Welcome to Tarn</h1><p>Sign in to Stremio on your phone or computer. Tarn never asks for your password.</p>
 <div className="link-panel">{qr&&<img className="qr" src={qr} alt="Scan to link your Stremio account"/>}<div><p className="muted">Scan the QR code or visit</p><p className="link-url"><a href="https://link.stremio.com/" target="_blank" rel="noreferrer">Open Stremio sign-in in browser</a></p>{link&&<div className="device-code" aria-label={'Sign-in code '+link.code}>{link.code}</div>}</div></div>
 <p aria-live="polite">{status}</p><div className="controls"><button data-focus id="retry-link" disabled={linking} onClick={()=>setRetry(x=>x+1)}>{busy?'New code':'Retry'}</button><button data-focus id="cancel-link" disabled={linking} onClick={onCancel}>Cancel</button></div>
 </section>;
}
