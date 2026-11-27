export type Direction = 'left'|'right'|'up'|'down';
export type FocusRect = {id:string;left:number;top:number;right:number;bottom:number};
export function directionFor(key:string, code:number):Direction|undefined {
  const keys:Record<string,Direction>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
  const codes:Record<number,Direction>={37:'left',38:'up',39:'right',40:'down'};
  return keys[key] || codes[code];
}
export function isBack(key:string,code:number):boolean {
  return key==='Escape'||key==='BrowserBack'||code===461;
}
export function nextFocus(from:FocusRect,items:FocusRect[],dir:Direction):string|undefined {
  const horizontal=dir==='left'||dir==='right',sign=dir==='left'||dir==='up'?-1:1;
  const cx=(r:FocusRect)=>(r.left+r.right)/2,cy=(r:FocusRect)=>(r.top+r.bottom)/2;
  let best:string|undefined,score=Infinity;
  for(const item of items){
    if(item.id===from.id) continue;
    const main=sign*(horizontal?cx(item)-cx(from):cy(item)-cy(from));
    if(main<=1) continue;
    const cross=Math.abs(horizontal?cy(item)-cy(from):cx(item)-cx(from));
    const overlap=horizontal?Math.min(from.bottom,item.bottom)-Math.max(from.top,item.top):Math.min(from.right,item.right)-Math.max(from.left,item.left);
    const value=main+cross*2+(overlap<=0?10000:0);
    if(value<score){score=value;best=item.id;}
  }
  return best;
}
export type Route={kind:'home'}|{kind:'details';id:string}|{kind:'diagnostics'}|{kind:'settings'};
export function routeFromHash(hash:string):Route{
  if(hash==='#diagnostics')return {kind:'diagnostics'};
  if(hash==='#settings')return {kind:'settings'};
  if(/^#details\/[a-z0-9-]+$/.test(hash))return {kind:'details',id:hash.slice(9)};
  return {kind:'home'};
}
