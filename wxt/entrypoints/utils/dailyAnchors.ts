// Daily-set links live in `div.grid > a`, mixed in with dashboard nav links
// (redeem, homepage). Every daily-set activity carries a `form`/`FORM` tracking
// code in its query string — search cards, quizzes, and non-search cards like the
// referral-style one alike — while the nav links don't. Filtering on that keeps
// all the real cards, drops the junk, doesn't assume a fixed card count, and
// stays empty until the cards render (so callers wait for the set, not the header).
export function matchDailyAnchors(root: ParentNode): HTMLAnchorElement[] {
    return [...root.querySelectorAll<HTMLAnchorElement>('div.grid > a')]
        .filter(isDailyActivityAnchor);
}

function isDailyActivityAnchor(anchor: HTMLAnchorElement): boolean {
    let url: URL;
    try {
        url = new URL(anchor.href);
    } catch {
        return false;
    }

    // Promotional sweepstakes/reward cards can live in the same grid and also
    // carry a `form` tracking parameter. They are redemption links rather than
    // Daily Set activities, so do not open them with the daily tasks.
    if (url.hostname === 'rewards.bing.com' && url.pathname.startsWith('/redeem/')) {
        return false;
    }

    // searchParams.has is case-sensitive and Bing uses both `form` and `FORM`.
    return url.searchParams.has('form') || url.searchParams.has('FORM');
}
