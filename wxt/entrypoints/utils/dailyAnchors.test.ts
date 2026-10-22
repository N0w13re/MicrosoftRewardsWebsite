import {beforeEach, describe, it, expect} from 'vitest';
import fixture from './fixtures/bingRewardsPanel.html?raw';
import {isRewardsPanelUrl, matchDailyAnchors} from './dailyAnchors';

function card(name: string, points = '15', icon = 'add', href = `https://www.bing.com/search?q=${name}&FORM=daily`): string {
    return `<div class="promo_cont"><a class="block" href="${href}"><p class="promo-title">${name}</p><div class="point_cont"><svg class="rw-si ${icon}"></svg><div class="point">${points}</div></div></a></div>`;
}
describe('Bing Rewards flyout matching', () => {
    beforeEach(() => {document.body.innerHTML = '';});
    it('selects all eight pending point-bearing tasks in the sanitized saved iframe', () => {
        document.body.innerHTML = fixture;
        const anchors = matchDailyAnchors(document);
        expect(anchors).toHaveLength(8);
        expect(anchors.map(a => a.querySelector('.point')?.textContent)).toEqual(['10','10','10','15','15','5','5','5']);
    });
    it('requires the point badge plus SVG, not arbitrary numbers or plain +text', () => {
        document.body.innerHTML = `<div id="gb_fo_content">
            ${card('pending')}${card('complete', '15', 'check')}${card('zero', '0')}
            <div class="promo_cont"><a class="block" href="https://www.bing.com/search?form=x">Win +7500 points</a></div>
        </div>`;
        expect(matchDailyAnchors(document).map(a=>a.querySelector('.promo-title')?.textContent)).toEqual(['pending']);
    });
    it('ignores redemption, referral, untracked and external links even with a points badge', () => {
        document.body.innerHTML = `<div id="gb_fo_content">
            ${card('redeem','15','add','https://rewards.bing.com/redeem/sku/1?form=x')}
            ${card('refer','7500','add','https://rewards.bing.com/referandearn?form=x')}
            ${card('external','15','add','https://example.com/search?form=x')}
            ${card('untracked','15','add','https://www.bing.com/search?q=x')}
        </div>`;
        expect(matchDailyAnchors(document)).toEqual([]);
    });
    it('does not click page-level search results outside the Rewards panel', () => {
        document.body.innerHTML = card('outside') + `<div id="gb_fo_content">${card('inside')}</div>`;
        expect(matchDailyAnchors(document)).toHaveLength(1);
    });
    it('accepts regional Bing task URLs and both form parameter cases', () => {
        document.body.innerHTML = `<div id="gb_fo_content">
            ${card('cn','10','add','https://cn.bing.com/search?form=x')}
            ${card('quiz','5','add','https://www.bing.com/search?FORM=x')}
        </div>`;
        expect(matchDailyAnchors(document)).toHaveLength(2);
    });
    it('recognizes only normal Bing-origin flyouts, never the restricted Rewards origin', () => {
        expect(isRewardsPanelUrl('https://cn.bing.com/rewards/panelflyout?channel=bingflyout')).toBe(true);
        expect(isRewardsPanelUrl('https://www.bing.com/rewards/panelflyout')).toBe(true);
        expect(isRewardsPanelUrl('https://rewards.bing.com/earn')).toBe(false);
        expect(isRewardsPanelUrl('https://www.bing.com/')).toBe(false);
        expect(isRewardsPanelUrl('https://example.com/rewards/panelflyout')).toBe(false);
    });
});
