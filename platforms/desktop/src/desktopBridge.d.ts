interface Window { tarnDesktop?: { getFullscreen():Promise<boolean>; setFullscreen(value:boolean):Promise<boolean>; onFullscreenChanged(listener:(value:boolean)=>void):()=>void; }; }
