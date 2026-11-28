import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/desktop.css',import.meta.url),'utf8');
test('Search is a permanent first navigation destination, with exclusive selected state',()=>{
 assert.ok(src.indexOf('id="search" type="button"')<src.indexOf('{tabs.map(n=>'));
 assert.match(src,/aria-current=\{showSearch\?'page':undefined\}/);
 assert.match(src,/!showSearch&&shelf===n/);
 assert.match(src,/onClick=\{openSearch\}/);
});
test('Search has one labelled form, explicit submit and focus restoration',()=>{
 assert.equal((src.match(/id="query"/g)||[]).length,1);
 assert.match(src,/role="search" aria-label="Search movies and series"/);
 assert.match(src,/id="search-submit" type="submit"/);
 assert.match(src,/const openSearch=.*setPending\('query'\)/);
 assert.match(src,/const closeSearch=.*setPending\('search'\)/);
 assert.match(src,/const clearSearch=.*setSearchTerm\(''\)/);
 assert.match(src,/role="status" aria-live="polite" aria-atomic="true"/);
});
test('Search uses existing add-on query and poster pagination, independent of Home preferences',()=>{
 assert.match(src,/useRemoteSearch\(addons,!!auth&&showSearch,searchTerm,cache\)/);
 assert.match(src,/search\.items\.slice\(0,searchLimit\)/);
 assert.match(src,/id="more-search"/);
 assert.match(src,/search-keys/);
 assert.match(css,/\.search-field:focus-within/);
});
test('desktop keeps the search form above browse content and guards Ctrl+K from playback',()=>{
 assert.match(src,/\{auth&&<div className="desktop-search-bar">\{searchForm\}<\/div>\}/);
 assert.match(src,/auth&&!playing&&route\.kind==='home'&&!continueMenu&&!confirmSignOut&&\(e\.ctrlKey\|\|e\.metaKey\)/);
});
