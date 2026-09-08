import { describe, it, expect } from 'vitest';
import { matchDailyAnchors } from './dailyAnchors';

describe('matchDailyAnchors', () => {
  it('keeps daily-set cards (form/FORM code) and skips nav links, regardless of host or path', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="grid">
        <a href="https://rewards.bing.com/redeem">skip-redeem</a>
        <a href="https://www.bing.com/">skip-home</a>
        <a href="https://rewards.bing.com/redeem/sku/000434000001?">skip-sku</a>
        <a href="https://rewards.bing.com/redeem/sku/000799036104?form=ML2Y26&amp;OCID=ML2Y26">skip-promotional-sweepstake</a>
        <a href="https://rewards.bing.com/refer?form=ML2XHD&rnoreward=1">refer</a>
        <a href="https://www.bing.com/search?q=Trip+to+Tokyo&FORM=tgrew4">tokyo</a>
        <a href="https://www.bing.com/search?q=Berlin+quiz&form=dsetqu">quiz</a>
      </div>
      <div class="other">
        <a href="https://www.bing.com/search?q=notgrid&form=x">skip-notgrid</a>
      </div>`;
    const anchors = matchDailyAnchors(root);
    expect(anchors.map((a) => a.textContent)).toEqual(['refer', 'tokyo', 'quiz']);
  });

  it('returns an empty array while only nav links (no form code) are present', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="grid">
        <a href="https://rewards.bing.com/redeem">x</a>
        <a href="https://www.bing.com/">y</a>
      </div>`;
    expect(matchDailyAnchors(root)).toEqual([]);
  });
});
