export function clampVolume(value){return Number.isFinite(value)?Math.max(0,Math.min(1,value)):1;}
export function seekAt(x,left,width,duration){
 if(![x,left,width,duration].every(Number.isFinite)||width<=0||duration<=0)return null;
 return Math.max(0,Math.min(Math.max(0,duration-1),(x-left)/width*duration));
}
export function clockTime(value){
 const n=Math.max(0,Math.floor(Number.isFinite(value)?value:0)),h=Math.floor(n/3600),m=Math.floor(n/60)%60,s=n%60;
 return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(s).padStart(2,'0');
}
export function trackLanguage(lang,label){
 const v=String(lang||'').toLowerCase().split('-')[0],l=String(label||'').toLowerCase();
 if(['en','eng'].includes(v)||(!v||v==='und')&&/\b(?:english|eng)\b/.test(l))return 'en';
 if(['es','spa'].includes(v)||(!v||v==='und')&&/\b(?:spanish|español|castellano)\b/.test(l))return 'es';
 return v==='und'?'':v;
}
export function chooseTrack(list,index){
 if(!list||!Number.isInteger(index)||index<0||index>=list.length)return false;
 try{list[index].enabled=true;for(let i=0;i<list.length;i++)if(i!==index)list[i].enabled=false;
 return Array.from({length:list.length},(_,i)=>!!list[i].enabled===(i===index)).every(Boolean);}catch{return false;}
}
