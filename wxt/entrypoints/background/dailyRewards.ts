import { browser } from 'wxt/browser';
import { getRndInteger } from '@/entrypoints/utils/helpers';
import { trackTab, untrackTab } from './tabCleanup';

const DAILY_TAB_MAX_LIFETIME_MS = 180000;
const DAILY_OVERVIEW_LINGER_MS = 15000;
const DAILY_LINK_MIN_LINGER_MS = 10000;
const DAILY_LINK_MAX_LINGER_MS = 15000;
const DAILY_LINK_HARD_CLOSE_MS = 60000;
const MESSAGE_TIMEOUT_MS = 30000;
const MESSAGE_RETRY_MS = 500;

// All DOM work uses the normal Bing header and its Bing-origin Rewards iframe.
// No /earn navigation, restricted-origin injection, or scripting permission.
export async function openDailyRewards(): Promise<void> {
    const previousActiveTabId = await getActiveTabId();
    const tab = await browser.tabs.create({url: 'https://www.bing.com/', active: true});
    const tabId = tab.id!;
    await trackTab(tabId, DAILY_TAB_MAX_LIFETIME_MS);

    let done = false;
    let failed = false;
    let lifetimeTimer: ReturnType<typeof setTimeout>;
    let lingerTimer: ReturnType<typeof setTimeout> | undefined;
    function finish(keepPage = false): void {
        if (done) return;
        done = true;
        clearTimeout(lifetimeTimer);
        clearTimeout(lingerTimer);
        browser.runtime.onMessage.removeListener(doneListener);
        browser.tabs.onCreated.removeListener(onCreated);
        if (!keepPage) browser.tabs.remove(tabId).catch(() => {});
        void untrackTab(tabId);
        if (!keepPage && previousActiveTabId != null)
            browser.tabs.update(previousActiveTabId, {active: true}).catch(() => {});
    }
    function onCreated(created: {id?: number; openerTabId?: number}): void {
        if (done || created.openerTabId !== tabId || created.id == null) return;
        browser.tabs.update(tabId, {active: true}).catch(() => {});
        closeDailyTabAfterLoad(created.id);
    }
    function doneListener(message: {action?: string}, sender: {tab?: {id?: number}}): void {
        if (sender.tab?.id !== tabId) return;
        if (message.action === 'dailyDone' && !done && lingerTimer == null)
            lingerTimer = setTimeout(() => finish(), DAILY_OVERVIEW_LINGER_MS);
        else if (message.action === 'dailyError') {
            failed = true;
            finish(true);
        }
    }
    browser.tabs.onCreated.addListener(onCreated);
    browser.runtime.onMessage.addListener(doneListener);
    lifetimeTimer = setTimeout(() => finish(), DAILY_TAB_MAX_LIFETIME_MS);

    try {
        await sendWhenReady(tabId, 'openRewardsPanel', () => done, {frameId: 0});
        if (!done) await sendWhenReady(tabId, 'openDaily', () => done);
    } catch (error) {
        // A content-script error has already recorded a more specific failure.
        if (!failed) await browser.storage.local.set({dailyActivityStatus: {
            phase: 'failed', error: String(error), updatedAt: new Date().toISOString(),
        }}).catch(() => {});
        finish(true);
    }
}

async function sendWhenReady(
    tabId: number,
    action: 'openRewardsPanel' | 'openDaily',
    cancelled: () => boolean,
    options?: {frameId: number}
): Promise<void> {
    const deadline = Date.now() + MESSAGE_TIMEOUT_MS;
    let lastError = 'No acknowledgement';
    await browser.storage.local.set({dailyActivityStatus: {
        phase: action === 'openDaily' ? 'connecting_panel' : 'connecting_header',
        updatedAt: new Date().toISOString(),
    }}).catch(() => {});
    while (Date.now() < deadline && !cancelled()) {
        try {
            const reply = options
                ? await browser.tabs.sendMessage(tabId, {action}, options)
                : await browser.tabs.sendMessage(tabId, {action});
            if (reply?.accepted === true) return;
        } catch (error) { lastError = String(error); }
        await new Promise<void>(resolve => setTimeout(resolve, MESSAGE_RETRY_MS));
    }
    if (!cancelled()) throw new Error(
        `Bing Rewards ${action === 'openDaily' ? 'iframe' : 'header'} did not acknowledge within 30 seconds: ${lastError}`
    );
}

async function getActiveTabId(): Promise<number | undefined> {
    try {
        return (await browser.tabs.query({active: true, lastFocusedWindow: true}))[0]?.id;
    } catch { return undefined; }
}

function closeDailyTabAfterLoad(tabId: number): void {
    void trackTab(tabId, DAILY_LINK_HARD_CLOSE_MS);
    let closed = false;
    function close(): void {
        if (closed) return;
        closed = true;
        browser.tabs.onUpdated.removeListener(loadListener);
        browser.tabs.get(tabId).then(() => browser.tabs.remove(tabId)).catch(() => {});
        void untrackTab(tabId);
    }
    function loadListener(updatedId: number, changeInfo: {status?: string}): void {
        if (updatedId === tabId && changeInfo.status === 'complete') {
            browser.tabs.onUpdated.removeListener(loadListener);
            setTimeout(close, getRndInteger(DAILY_LINK_MIN_LINGER_MS, DAILY_LINK_MAX_LINGER_MS));
        }
    }
    browser.tabs.onUpdated.addListener(loadListener);
    setTimeout(close, DAILY_LINK_HARD_CLOSE_MS);
}
