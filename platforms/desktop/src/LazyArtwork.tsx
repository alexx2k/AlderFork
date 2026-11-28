import React,{useEffect,useRef,useState} from 'react';
// Chromium 68 ignores loading="lazy". One observer per app, with unobserve on unmount.
let observer:IntersectionObserver|null=null;
const waiting=new Map<Element,()=>void>();
function watch(el:Element,ready:()=>void){
 if(typeof IntersectionObserver==='undefined'){ready();return ()=>{};}
 try{
  if(!observer)observer=new IntersectionObserver(entries=>{
   for(const e of entries){if(e.isIntersecting||e.intersectionRatio>0){const fn=waiting.get(e.target);waiting.delete(e.target);observer?.unobserve(e.target);fn?.();}}
  },{rootMargin:'240px'});
  waiting.set(el,ready);observer.observe(el);
  return ()=>{waiting.delete(el);observer?.unobserve(el);if(!waiting.size){observer?.disconnect();observer=null;}};
 }catch{waiting.delete(el);ready();return ()=>{};}
}
export function LazyArtwork(props:React.ImgHTMLAttributes<HTMLImageElement>){
 const native=typeof HTMLImageElement!=='undefined'&&'loading' in HTMLImageElement.prototype;
 const [ready,setReady]=useState(native);
 const node=useRef<HTMLImageElement>(null);
 useEffect(()=>{if(ready||!node.current)return;return watch(node.current,()=>setReady(true));},[ready]);
 return <img {...props} ref={node} src={ready?props.src:undefined} loading={native?'lazy':undefined}/>;
}
