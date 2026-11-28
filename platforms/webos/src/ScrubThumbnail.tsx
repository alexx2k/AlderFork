import React,{useEffect,useState} from 'react';
import type {Thumbnail} from './viewingExperience.mjs';
export function ScrubThumbnail({frame,label,percent}:{frame:Thumbnail|null;label:string;percent:number}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[frame?.url]);
 const crop=frame?.crop;
 return <div className="scrub-preview" style={{left:Math.max(9,Math.min(91,percent))+'%'}} aria-hidden="true">
 {frame&&!failed&&<div className="scrub-preview-art" style={crop?{width:crop.w,height:crop.h,transform:'scale('+Math.min(1,160/crop.w,90/crop.h)+')',transformOrigin:'top left',marginBottom:-(crop.h-crop.h*Math.min(1,160/crop.w,90/crop.h)),marginRight:-(crop.w-crop.w*Math.min(1,160/crop.w,90/crop.h))}:undefined}>
 <img src={frame.url} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)} style={crop?{position:'absolute',left:-crop.x,top:-crop.y,maxWidth:'none',width:'auto',height:'auto'}:undefined}/>
 </div>}
 <span>{label}</span></div>;
}
