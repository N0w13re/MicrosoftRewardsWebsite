// Offline smoke test of the packaged Bing parent + Rewards iframe content script.
// Browser APIs are simulated; real DOM click events are observed, with navigation prevented.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';

const bundle=readFileSync(new URL('../dist/chrome-mv3/content-scripts/rewards.js',import.meta.url),'utf8');
const fixture=readFileSync(new URL('../entrypoints/utils/fixtures/bingRewardsPanel.html',import.meta.url),'utf8');
const messages=[],statuses=[];
function environment(url) {
    const win=new Window({url,settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
    const receivers=new Set();
    win.chrome={
        runtime:{
            id:'offline-smoke-test',
            getURL:path=>`chrome-extension://offline-smoke-test/${path}`,
            onMessage:{addListener:fn=>receivers.add(fn),removeListener:fn=>receivers.delete(fn)},
            sendMessage:async message=>{messages.push(message);},
        },
        storage:{local:{set:async values=>{statuses.push(values.dailyActivityStatus);}}},
    };
    return {win,receivers};
}
function send(env,action) {
    const responses=[];
    for(const receiver of env.receivers)receiver({action},{},value=>responses.push(value));
    return responses;
}
const header=environment('https://cn.bing.com/');
const panel=environment('https://cn.bing.com/rewards/panelflyout?channel=bingflyout');
try {
    header.win.document.body.innerHTML='<a id="id_rh_w" href="#" aria-expanded="false">Rewards</a><div id="rewid-f"></div>';
    let headerClicks=0;
    header.win.document.querySelector('#id_rh_w').addEventListener('click',event=>{
        event.preventDefault();headerClicks++;
        header.win.document.querySelector('#id_rh_w').setAttribute('aria-expanded','true');
        header.win.document.querySelector('#rewid-f').innerHTML='<iframe src="about:blank" title="Microsoft Rewards"></iframe>';
    });
    await header.win.eval(bundle);
    assert.equal(send(header,'openDaily').length,0,'the parent must not acknowledge iframe work');
    assert.equal(send(header,'openRewardsPanel')[0]?.accepted,true);
    await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(headerClicks,1);
    assert.ok(header.win.document.querySelector('#rewid-f iframe'));

    panel.win.document.body.innerHTML=fixture;
    const anchors=[...panel.win.document.querySelectorAll('a.block')];
    const clicks=anchors.map(()=>0);
    anchors.forEach((a,i)=>a.addEventListener('click',event=>{event.preventDefault();clicks[i]++;}));
    await panel.win.eval(bundle);
    await panel.win.eval(bundle);
    assert.equal(panel.receivers.size,1,'WXT reload must not duplicate receivers');
    assert.equal(send(panel,'openRewardsPanel').length,0,'the iframe must not handle header commands');
    assert.equal(send(panel,'openDaily')[0]?.accepted,true);
    const deadline=Date.now()+22000;
    while(!messages.some(m=>m.action==='dailyDone')&&Date.now()<deadline)
        await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(clicks.reduce((n,c)=>n+c,0),8);
    assert.ok(clicks.every(c=>c<=1));
    assert.equal(statuses.at(-1)?.phase,'clicked');
    assert.equal(statuses.at(-1)?.clicked,8);
    console.log('PASS: packaged parent clicks the Rewards button; only the Bing-origin iframe handles task commands.');
    console.log('PASS: 8 pending point-bearing cards dispatch native DOM click events, once each.');
    console.log('SKIP: actual Edge injection, task tab navigation and Microsoft points crediting (not tested offline).');
} finally {
    await header.win.happyDOM.abort();
    await panel.win.happyDOM.abort();
}
