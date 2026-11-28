import React,{useEffect,useState} from 'react';
import type {Thumbnail} from './viewingExperience.mjs';
export function ScrubThumbnail({frame,label,percent}:{frame:Thumbnail|null;label:string;percent:number}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[frame?.url]);
 const crop=frame?.crop,scale=crop?Math.min(1,160/crop.w,90/crop.h):1;
 return <div className="scrub-preview" style={{left:Math.max(9,Math.min(91,percent))+'%'}} aria-hidden="true">
 {frame&&!failed&&<div className="scrub-preview-art" style={crop?{width:crop.w*scale,height:crop.h*scale}:undefined}>
 <img src={frame.url} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)} style={crop?{position:'absolute',left:-crop.x*scale,top:-crop.y*scale,maxWidth:'none',maxHeight:'none',width:'auto',height:'auto',transform:'scale('+scale+')',transformOrigin:'top left'}:undefined}/>
 </div>}
 <span>{label}</span></div>;
}
