// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {fakeBrowser} from 'wxt/testing';
import {openDailyRewards} from './dailyRewards';
const BING_URL='https://www.bing.com/';
async function getTaskTab() {return (await fakeBrowser.tabs.query({})).find(t=>t.url===BING_URL)!;}
describe('Bing Rewards panel startup',()=>{
    beforeEach(()=>{fakeBrowser.reset();vi.restoreAllMocks();vi.useFakeTimers();});
    afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
    it('opens Bing, requests the top-frame header, then broadcasts only the iframe task command',async()=>{
        const create=vi.spyOn(fakeBrowser.tabs,'create');
        const send=vi.spyOn(fakeBrowser.tabs,'sendMessage').mockResolvedValue({accepted:true});
        const inject=vi.spyOn(fakeBrowser.scripting,'executeScript');
        await openDailyRewards();
        expect(create).toHaveBeenCalledWith({url:BING_URL,active:true});
        expect(send).toHaveBeenNthCalledWith(1,expect.any(Number),{action:'openRewardsPanel'},{frameId:0});
        expect(send).toHaveBeenNthCalledWith(2,expect.any(Number),{action:'openDaily'});
        expect(inject).not.toHaveBeenCalled();
    });
    it('retries separately when the header or iframe receiver is not yet installed',async()=>{
        let header=0,panel=0;
        const send=vi.spyOn(fakeBrowser.tabs,'sendMessage').mockImplementation(async(_id,request)=>{
            if((request as {action?:string}).action==='openRewardsPanel'){if(header++===0)throw new Error('No header receiver');}
            else {if(panel++===0)throw new Error('No iframe receiver');}
            return {accepted:true};
        });
        const run=openDailyRewards();await vi.advanceTimersByTimeAsync(2000);await run;
        expect(send).toHaveBeenCalledTimes(4);
    });
    it('records a missing iframe receiver and leaves Bing open without injecting restricted pages',async()=>{
        const send=vi.spyOn(fakeBrowser.tabs,'sendMessage').mockImplementation(async(_id,request)=>{
            if((request as {action?:string}).action==='openRewardsPanel')return {accepted:true};
            throw new Error('No iframe receiver');
        });
        const remove=vi.spyOn(fakeBrowser.tabs,'remove');
        const inject=vi.spyOn(fakeBrowser.scripting,'executeScript');
        const run=openDailyRewards();await vi.advanceTimersByTimeAsync(31000);await run;
        expect((await fakeBrowser.storage.local.get('dailyActivityStatus')).dailyActivityStatus)
            .toEqual(expect.objectContaining({phase:'failed',error:expect.stringContaining('iframe')}));
        expect(remove).not.toHaveBeenCalled();expect(inject).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalled();
    });
    it('keeps the overview for 15 seconds after iframe completion and ignores duplicate done messages',async()=>{
        vi.spyOn(fakeBrowser.tabs,'sendMessage').mockResolvedValue({accepted:true});
        const remove=vi.spyOn(fakeBrowser.tabs,'remove');await openDailyRewards();const tab=await getTaskTab();
        await fakeBrowser.runtime.onMessage.trigger({action:'dailyDone'},{tab,frameId:2});
        await vi.advanceTimersByTimeAsync(10000);expect(remove).not.toHaveBeenCalled();
        await fakeBrowser.runtime.onMessage.trigger({action:'dailyDone'},{tab,frameId:2});
        await vi.advanceTimersByTimeAsync(4999);expect(remove).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);expect(remove).toHaveBeenCalledWith(tab.id);
    });
    it('keeps task tabs for 10 seconds minimum after loading',async()=>{
        vi.spyOn(fakeBrowser.tabs,'sendMessage').mockResolvedValue({accepted:true});
        vi.spyOn(Math,'random').mockReturnValue(0);
        const remove=vi.spyOn(fakeBrowser.tabs,'remove');await openDailyRewards();const tab=await getTaskTab();
        const child=await fakeBrowser.tabs.create({url:'https://www.bing.com/search?q=task'});
        await fakeBrowser.tabs.onCreated.trigger({...child,openerTabId:tab.id});
        await fakeBrowser.tabs.onUpdated.trigger(child.id!,{status:'complete'},child);
        await vi.advanceTimersByTimeAsync(9999);expect(remove).not.toHaveBeenCalledWith(child.id);
        await vi.advanceTimersByTimeAsync(1);expect(remove).toHaveBeenCalledWith(child.id);
    });
    it('ignores completion messages from unrelated tabs',async()=>{
        vi.spyOn(fakeBrowser.tabs,'sendMessage').mockResolvedValue({accepted:true});
        const remove=vi.spyOn(fakeBrowser.tabs,'remove');await openDailyRewards();
        await fakeBrowser.runtime.onMessage.trigger({action:'dailyDone'},{tab:{...await getTaskTab(),id:9876}});
        await vi.advanceTimersByTimeAsync(16000);expect(remove).not.toHaveBeenCalled();
    });
    it('leaves Bing available for manual use after a content-script error',async()=>{
        vi.spyOn(fakeBrowser.tabs,'sendMessage').mockResolvedValue({accepted:true});
        const remove=vi.spyOn(fakeBrowser.tabs,'remove');await openDailyRewards();const tab=await getTaskTab();
        await fakeBrowser.runtime.onMessage.trigger({action:'dailyError'},{tab,frameId:2});
        await vi.advanceTimersByTimeAsync(181000);expect(remove).not.toHaveBeenCalled();
        expect((await fakeBrowser.storage.local.get('trackedTabs')).trackedTabs).toEqual({});
    });
});
