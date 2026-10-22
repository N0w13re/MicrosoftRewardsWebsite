import { defineContentScript } from '#imports';
import { browser } from 'wxt/browser';
import { getRndInteger, wait } from '@/entrypoints/utils/helpers';
import { DAILY_ACTIVITIES_SELECTOR, isRewardsPanelUrl, matchDailyAnchors } from '@/entrypoints/utils/dailyAnchors';

const RENDER_TIMEOUT_MS = 30000;
const CARDS_SETTLE_MS = 1500;

export default defineContentScript({
    matches: [
        'https://www.bing.com/', 'https://cn.bing.com/',
        'https://www.bing.com/search*', 'https://cn.bing.com/search*',
        'https://www.bing.com/rewards/panelflyout*',
        'https://cn.bing.com/rewards/panelflyout*',
    ],
    allFrames: true,
    main(ctx) {
        const panel = isRewardsPanelUrl(location.href);
        let running = false;
        let invalidated = false;
        const listener: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (request: {action?: string}, _sender, respond) => {
            if (request.action === 'dailyPing') {
                respond({ready: true, role: panel ? 'panel' : 'header'});
                return false;
            }
            // Only the iframe acknowledges openDaily. The parent must not win
            // a broadcast response race and falsely claim the tasks have started.
            if (request.action !== (panel ? 'openDaily' : 'openRewardsPanel')) return;
            respond({accepted: true});
            if (running) return false;
            running = true;
            const work = panel
                ? openDailyActivities(() => invalidated)
                : openRewardsPanel(() => invalidated);
            void work.catch(async error => {
                if (invalidated) return;
                console.error('[Bing Rewards]', error);
                await recordStatus('failed', {error: String(error)});
                await browser.runtime.sendMessage({action: 'dailyError'}).catch(() => {});
            }).finally(() => { running = false; });
            return false;
        };
        browser.runtime.onMessage.addListener(listener);
        ctx.onInvalidated(() => {
            invalidated = true;
            browser.runtime.onMessage.removeListener(listener);
        });
    },
});

async function recordStatus(phase: string, details: Record<string, unknown> = {}): Promise<void> {
    await browser.storage.local.set({dailyActivityStatus: {
        phase, updatedAt: new Date().toISOString(), ...details,
    }}).catch(() => {});
}

async function openRewardsPanel(cancelled: () => boolean): Promise<void> {
    await recordStatus('opening_panel');
    const deadline = Date.now() + RENDER_TIMEOUT_MS;
    let nextClick = 0;
    while (Date.now() < deadline && !cancelled()) {
        const button = document.querySelector<HTMLElement>('#id_rh_w');
        if (button) {
            if (button.getAttribute('aria-expanded') !== 'true' && Date.now() >= nextClick) {
                button.click();
                nextClick = Date.now() + 2000;
            }
            if (button.getAttribute('aria-expanded') === 'true' &&
                document.querySelector('#rewid-f iframe')) return;
        }
        await wait(250);
    }
    if (!cancelled()) throw new Error('Bing Rewards button or panel did not appear. Check Bing sign-in and regional layout.');
}

async function openDailyActivities(cancelled: () => boolean): Promise<void> {
    await recordStatus('waiting_panel_tasks');
    const anchors = await waitForDailyAnchors(cancelled);
    let clicked = 0;
    await recordStatus('clicking', {selected: anchors.length, clicked});
    for (const original of anchors) {
        if (cancelled()) return;
        const anchor = matchDailyAnchors(document).find(a => a.href === original.href);
        if (!anchor?.isConnected) continue;
        anchor.click();
        clicked++;
        await recordStatus('clicking', {selected: anchors.length, clicked});
        await wait(1000 + getRndInteger(0, 1000));
    }
    if (cancelled()) return;
    await recordStatus('clicked', {selected: anchors.length, clicked});
    await browser.runtime.sendMessage({action: 'dailyDone'}).catch(() => {});
}

// Polling ignores the flyout's continuously animating SVGs. Only task-link and
// reward-badge changes reset the settling interval; there is no fixed task count.
async function waitForDailyAnchors(cancelled: () => boolean): Promise<HTMLAnchorElement[]> {
    const deadline = Date.now() + RENDER_TIMEOUT_MS;
    let signature: string | undefined;
    let stableSince = Date.now();
    let loaded = false;
    while (Date.now() < deadline && !cancelled()) {
        const cards = [...document.querySelectorAll<HTMLAnchorElement>(
            `${DAILY_ACTIVITIES_SELECTOR} .promo_cont a.block[href]`
        )];
        loaded = cards.length > 0;
        if (loaded) {
            const next = JSON.stringify(cards.map(a => [
                a.href, a.querySelector('.point_cont')?.textContent,
                !!a.querySelector('.point_cont .rw-si.add'),
            ]));
            if (next !== signature) { signature = next; stableSince = Date.now(); }
            if (Date.now() - stableSince >= CARDS_SETTLE_MS) break;
        }
        await wait(250);
    }
    if (cancelled()) return [];
    if (!loaded) throw new Error('Bing Rewards panel tasks did not render within 30 seconds');
    return [...new Map(matchDailyAnchors(document).map(a => [a.href, a])).values()];
}
