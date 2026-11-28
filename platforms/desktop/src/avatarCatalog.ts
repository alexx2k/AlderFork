import netflix from '../../../app/src/main/assets/avatar_catalog.json';
import disney from '../../../app/src/main/assets/avatar_catalog_disney.json';
import hbo from '../../../app/src/main/assets/avatar_catalog_hbo.json';
import prime from '../../../app/src/main/assets/avatar_catalog_prime.json';
import crunchyroll from '../../../app/src/main/assets/avatar_catalog_crunchyroll.json';
import {validAvatar} from './profiles.mjs';
export type AvatarIcon={service:string;group:string;name:string;url:string};
const read=(pack:{icons:unknown[]},fallback:string)=>pack.icons.reduce<AvatarIcon[]>((out,value)=>{
 const v=value as Record<string,unknown>;
 if(v&&typeof v.url==='string'&&validAvatar(v.url)&&typeof v.name==='string'&&typeof v.group==='string')out.push({service:typeof v.service==='string'?v.service:fallback,group:v.group,name:v.name,url:v.url});
 return out;
},[]);
export const avatars=[...read(netflix,'Netflix'),...read(disney,'Disney+'),...read(hbo,'HBO'),...read(prime,'Prime Video'),...read(crunchyroll,'Crunchyroll')];
export const services=Array.from(new Set(avatars.map(a=>a.service)));
