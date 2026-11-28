export function clampVolume(value:number):number;
export function seekAt(x:number,left:number,width:number,duration:number):number|null;
export function clockTime(value:number):string;
export function trackLanguage(lang:unknown,label:unknown):string;
export function chooseTrack(list:{length:number;[index:number]:{enabled:boolean}}|undefined,index:number):boolean;
