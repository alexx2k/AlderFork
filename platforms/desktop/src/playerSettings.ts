import {cleanPrefs,cleanChoice,prefsKey,trackKey,Prefs,Choices} from './playerPrefs.mjs';
const memory=new Map<string,string>();
function get(key:string):unknown{try{const raw=memory.get(key)||localStorage.getItem(key);return raw?JSON.parse(raw):null;}catch{return null;}}
function put(key:string,value:unknown){const raw=JSON.stringify(value);memory.set(key,raw);try{localStorage.setItem(key,raw);}catch{}}
export function readPrefs(namespace:string){return cleanPrefs(get(prefsKey(namespace)));}
export function savePrefs(namespace:string,prefs:Prefs){put(prefsKey(namespace),cleanPrefs(prefs));}
export function readChoices(namespace:string,title:string){return cleanChoice(get(trackKey(namespace,title)));}
export function saveChoices(namespace:string,title:string,choice:Choices){put(trackKey(namespace,title),cleanChoice(choice));}
export function clearPlayerSettings(namespace:string){const root=prefsKey(namespace);for(const k of memory.keys())if(k===root||k.startsWith(root+':'))memory.delete(k);}
