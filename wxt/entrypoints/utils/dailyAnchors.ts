// Bing's Rewards flyout is a Bing-origin iframe, not rewards.bing.com.
export const DAILY_ACTIVITIES_SELECTOR = '#gb_fo_content';
export const BING_HOSTS = ['www.bing.com', 'cn.bing.com'];

export function isRewardsPanelUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && BING_HOSTS.includes(url.hostname) &&
            /^\/rewards\/panelflyout\/?$/.test(url.pathname);
    } catch { return false; }
}

export function matchDailyAnchors(root: ParentNode): HTMLAnchorElement[] {
    return [...root.querySelectorAll<HTMLAnchorElement>(`${DAILY_ACTIVITIES_SELECTOR} .promo_cont a.block[href]`)]
        .filter(isPendingDailyActivity);
}

export function isPendingDailyActivity(anchor: HTMLAnchorElement): boolean {
    if (anchor.matches('[aria-disabled="true"], [data-disabled]')) return false;
    let url: URL;
    try { url = new URL(anchor.href); } catch { return false; }
    if (url.protocol !== 'https:' || !BING_HOSTS.includes(url.hostname)) return false;
    if (!['/search', '/spotlight/imagepuzzle'].includes(url.pathname)) return false;
    if (!url.searchParams.has('form') && !url.searchParams.has('FORM')) return false;
    // In this flyout the plus sign is an SVG (.rw-si.add), not text "+15".
    // Completed cards lose it; never interpret any number in a title as points.
    const badge = anchor.querySelector('.point_cont');
    if (!badge?.querySelector('.rw-si.add') || badge.querySelector('.rw-si.check, .rw-si.complete')) return false;
    const points = badge.querySelector('.point')?.textContent?.trim() ?? '';
    return /^\d+$/.test(points) && Number(points) > 0;
}
