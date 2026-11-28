import React from 'react';
import type {useReleaseUpdates} from './useReleaseUpdates.ts';
export function UpdateAction({model}:{model:ReturnType<typeof useReleaseUpdates>}){
 if(!model.release)return null;
 return <div className="desktop-update-actions">{model.canInstall&&<button type="button" data-focus disabled={model.installing} onClick={()=>void model.install()}>{model.installing?'Preparing update…':'Download & install'}</button>}<a href={model.release.page} target="_blank" rel="noreferrer">Release notes ↗</a>{model.installation.message&&<div className="desktop-update-progress" role="status"><span>{model.installation.message}</span>{model.installation.stage==='downloading'&&<progress max={100} value={model.installation.percent}/>}</div>}</div>;
}
