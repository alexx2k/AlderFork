import type {Title,Episode} from './liveCatalogue.ts';
export type Row={title:Title;videoId:string;position:number;duration:number;next:boolean;updatedAt:number;list:boolean;watched:string[];remoteWatched:string;unwatched?:string[];hidden:boolean};
export type Action={id:string;kind:'list'|'hide'|'unwatch'|'watched'|'progress';title:Title;at:number;videoId?:string;on?:boolean;position?:number;duration?:number;played?:number;ended?:boolean};
export type LibraryData={version:1;rows:Record<string,Row>;pending:Record<string,Action[]>};
export type Inflate=(base64:string)=>Uint8Array;
export type Deflate=(bytes:Uint8Array)=>string;
export const keyFor:(title:Pick<Title,'id'|'type'>)=>string;
export function libraryKey(namespace:string):string;
export function emptyLibrary():LibraryData;
export function titleSnapshot(title:Title):Title;
export function makeRow(title:Title):Row;
export function mergeTitle(old:Title,title:Title):Title;
export function isComplete(position:number,duration:number):boolean;
export function nextEpisode(title:Title,videoId:string,seen?:string[],now?:number):Episode|null;
export function watchedFromField(field:string,episodes:Episode[]|undefined,inflate:Inflate):string[];
export function watchedField(episodes:Episode[],seen:string[],deflate:Deflate):string|null;
export function seenIds(row:Row,inflate:Inflate):string[];
export function applyAction(row:Row,action:Action,inflate:Inflate):Row;
export function continueRows(rows:Record<string,Row>):Row[];
export function listRows(rows:Record<string,Row>):Row[];
export function fromRemote(raw:unknown,old?:Row):Row|null;
export function wireItem(title:Title,at:number):Record<string,unknown>;
export function applyWire(raw:Record<string,unknown>|undefined,action:Action,inflate:Inflate,deflate:Deflate):Record<string,unknown>;
export function reduceLibrary(data:LibraryData,action:Action,cloud:boolean,inflate:Inflate,inflight?:Set<string>):LibraryData;
export function importRemote(data:LibraryData,items:Record<string,unknown>[],inflate:Inflate):LibraryData;

export function applyQueue(raw:Record<string,unknown>|undefined,queue:Action[],inflate:Inflate,deflate:Deflate):Record<string,unknown>|undefined;

export function recoverLibrary(raw:unknown):{data:LibraryData;damaged:boolean};
