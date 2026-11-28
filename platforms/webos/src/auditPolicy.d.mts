export function cloudWriteAllowed(cloud:boolean,bound:string,verified:string):boolean;
export function withinSeekRange(ranges:Pick<TimeRanges,'length'|'start'|'end'>|null|undefined,target:number):boolean;
export function mediaSnapshot(position:number,duration:number):{position:number;duration:number}|null;
export function protectedFlag(v:unknown):boolean;
export function boundedBody(response:Response,limit:number):Promise<Uint8Array>;
