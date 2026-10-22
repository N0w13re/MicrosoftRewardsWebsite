import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fixture from './fixtures/bingRewardsPanel.html?raw';
const messaging = vi.hoisted(() => ({
    listener: undefined as undefined | ((request: {action?: string}, sender: object, respond: (value: unknown)=>void)=>void),
    sendMessage: vi.fn(async()=>undefined),
    status: vi.fn(async(_items: unknown)=>undefined),
    removeListener: vi.fn(),
}));
vi.mock('#imports',()=>({defineContentScript:(definition:unknown)=>definition}));
vi.mock('wxt/browser',()=>({browser:{
    runtime:{onMessage:{addListener:(listener:typeof messaging.listener)=>{messaging.listener=listener;},removeListener:messaging.removeListener},sendMessage:messaging.sendMessage},
    storage:{local:{set:messaging.status}},
}}));
import contentScript from '../rewards.content';
function install(url = 'https://cn.bing.com/rewards/panelflyout'): void {
    vi.stubGlobal('location',new URL(url));
    (contentScript.main as unknown as (ctx:{onInvalidated:(fn:()=>void)=>void})=>void)({onInvalidated:vi.fn()});
}
function send(action = 'openDaily'): ReturnType<typeof vi.fn> {
    const respond = vi.fn(); messaging.listener?.({action},{},respond); return respond;
}
function card(name:string):string {
    return `<div class="promo_cont"><a class="block" href="https://www.bing.com/search?q=${name}&FORM=daily"><div class="point_cont"><svg class="rw-si add"></svg><div class="point">15</div></div></a></div>`;
}
function watchClicks() {
    return [...document.querySelectorAll('a')].map(a=>vi.spyOn(a,'click').mockImplementation(()=>{}));
}
describe('Bing header and Rewards iframe click flow',()=>{
    beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();document.body.innerHTML='';});
    afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();document.body.innerHTML='';});
    it('clicks all eight positive-point tasks from the saved panel',async()=>{
        document.body.innerHTML=fixture;const clicks=watchClicks();install();
        expect(send()).toHaveBeenCalledWith({accepted:true});
        await vi.advanceTimersByTimeAsync(22000);
        expect(clicks.reduce((n,s)=>n+s.mock.calls.length,0)).toBe(8);
        expect(messaging.status).toHaveBeenLastCalledWith({dailyActivityStatus:expect.objectContaining({phase:'clicked',selected:8,clicked:8})});
        expect(messaging.sendMessage).toHaveBeenCalledWith({action:'dailyDone'});
    });
    it('the parent opens #id_rh_w but never acknowledges or executes the iframe task command',async()=>{
        document.body.innerHTML='<a id="id_rh_w" aria-expanded="false"></a><div id="rewid-f"></div>';
        const button=document.querySelector<HTMLAnchorElement>('#id_rh_w')!;
        const click=vi.spyOn(button,'click').mockImplementation(()=>{
            button.setAttribute('aria-expanded','true');
            document.querySelector('#rewid-f')!.innerHTML='<iframe title="Microsoft Rewards" src="about:blank"></iframe>';
        });
        install('https://cn.bing.com/');
        expect(send()).not.toHaveBeenCalled();
        expect(send('openRewardsPanel')).toHaveBeenCalledWith({accepted:true});
        await vi.advanceTimersByTimeAsync(1000);
        expect(click).toHaveBeenCalledOnce();
        expect(messaging.sendMessage).not.toHaveBeenCalledWith({action:'dailyDone'});
    });
    it('does not toggle an already open panel closed',async()=>{
        document.body.innerHTML='<a id="id_rh_w" aria-expanded="true"></a><div id="rewid-f"><iframe src="about:blank"></iframe></div>';
        const click=vi.spyOn(document.querySelector<HTMLElement>('#id_rh_w')!,'click');
        install('https://www.bing.com/search?q=test');
        send('openRewardsPanel');await vi.advanceTimersByTimeAsync(1000);
        expect(click).not.toHaveBeenCalled();
    });
    it('ignores header-opening commands in the iframe',()=>{
        install();expect(send('openRewardsPanel')).not.toHaveBeenCalled();
    });
    it('includes task cards rendered in batches without requiring a fixed count',async()=>{
        document.body.innerHTML=`<div id="gb_fo_content">${card('one')}</div>`;
        const first=watchClicks()[0];install();send();
        await vi.advanceTimersByTimeAsync(500);expect(first).not.toHaveBeenCalled();
        document.querySelector('#gb_fo_content')!.insertAdjacentHTML('beforeend',card('two'));
        const second=vi.spyOn(document.querySelectorAll('a')[1],'click').mockImplementation(()=>{});
        await vi.advanceTimersByTimeAsync(10000);
        expect(first).toHaveBeenCalledOnce();expect(second).toHaveBeenCalledOnce();
    });
    it('does not launch a duplicate loop on retried messages',async()=>{
        document.body.innerHTML=`<div id="gb_fo_content">${card('one')}</div>`;
        const first=watchClicks()[0];install();send();send();
        await vi.advanceTimersByTimeAsync(6000);expect(first).toHaveBeenCalledOnce();
    });
    it('skips completed cards and finishes with zero clicks',async()=>{
        document.body.innerHTML=`<div id="gb_fo_content">${card('done').replace('rw-si add','rw-si check')}</div>`;
        const first=watchClicks()[0];install();send();await vi.advanceTimersByTimeAsync(6000);
        expect(first).not.toHaveBeenCalled();
        expect(messaging.status).toHaveBeenLastCalledWith({dailyActivityStatus:expect.objectContaining({phase:'clicked',clicked:0})});
    });
    it('reports missing panel tasks instead of silently hanging',async()=>{
        vi.spyOn(console,'error').mockImplementation(()=>{});
        install();send();await vi.advanceTimersByTimeAsync(31000);
        expect(messaging.sendMessage).toHaveBeenCalledWith({action:'dailyError'});
    });
    it('reports a missing Rewards header without inventing a selector',async()=>{
        vi.spyOn(console,'error').mockImplementation(()=>{});
        install('https://www.bing.com/');send('openRewardsPanel');await vi.advanceTimersByTimeAsync(31000);
        expect(messaging.sendMessage).toHaveBeenCalledWith({action:'dailyError'});
    });
});
