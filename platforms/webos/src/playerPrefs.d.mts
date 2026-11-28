export type AudioCodec='aac'|'mp3'|'ac3'|'eac3'|'dts'|'truehd'|'opus'|'unknown';
export type Prefs={autoHide:boolean;autoplay:boolean;creditsFallback:number;quality:number;audioMode:'auto'|'compatible';audioLanguage:string;subtitleLanguage:string;size:number;color:string;background:boolean;delay:number;fit:'fit'|'zoom'|'stretch'};
export type TrackChoice={lang:string;label:string;provider:string;key?:string};
export type Choices={audio?:TrackChoice;subtitle?:TrackChoice|'off'};
export const colors:Record<string,string>;
export const defaults:Prefs;
export function language(value:unknown):string;
export function cleanPrefs(raw:unknown):Prefs;
export function prefsKey(namespace:string):string;
export function trackKey(namespace:string,title:string):string;
export function cleanChoice(raw:unknown):Choices;
export function matchTrack(tracks:{lang:string;label:string;provider?:string;key?:string}[],wanted?:Partial<TrackChoice>):number;
export function audioCodec(label:unknown):AudioCodec;
export function audioScore(codec:AudioCodec,support:Partial<Record<AudioCodec,boolean>>|undefined,mode:string):number;
export function qualityScore(height:number,target:number,deviceHeight:number):number;
export function scrubTarget(position:number,duration:number,delta:number):number;
export function scrubStep(repeat:number):number;
export function captionTime(time:number,delay:number):number;
export function objectFit(fit:string):'cover'|'fill'|'contain';

export function trackFingerprint(value:unknown):string;

export function shouldAutoHide(enabled:boolean,paused:boolean,panel:string|null,preview:number|null,attempt:unknown,status:string):boolean;
