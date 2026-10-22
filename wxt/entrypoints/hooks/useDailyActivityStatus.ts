import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

interface DailyActivityStatus {
    phase: string;
    selected?: number;
    clicked?: number;
    error?: string;
    updatedAt?: string;
}

function readStatus(value: unknown): DailyActivityStatus | null {
    if (!value || typeof value !== 'object' || !('phase' in value) || typeof value.phase !== 'string') return null;
    const record = value as Record<string, unknown>;
    return {
        phase: value.phase,
        selected: typeof record.selected === 'number' ? record.selected : undefined,
        clicked: typeof record.clicked === 'number' ? record.clicked : undefined,
        error: typeof record.error === 'string' ? record.error : undefined,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
    };
}

export function useDailyActivityStatus(): DailyActivityStatus | null {
    const [status, setStatus] = useState<DailyActivityStatus | null>(null);
    useEffect(() => {
        let disposed = false;
        let changed = false;
        const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
            if (area !== 'local' || !changes.dailyActivityStatus) return;
            changed = true;
            if (!disposed) setStatus(readStatus(changes.dailyActivityStatus.newValue));
        };
        browser.storage.onChanged.addListener(listener);
        void browser.storage.local.get('dailyActivityStatus').then(values => {
            if (!disposed && !changed) setStatus(readStatus(values.dailyActivityStatus));
        }).catch(() => {});
        return () => {
            disposed = true;
            browser.storage.onChanged.removeListener(listener);
        };
    }, []);
    return status;
}
