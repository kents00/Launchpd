import { describe, it, expect } from 'vitest';
import { formatSize } from '../src/utils/logger.js';

describe('logger utils', () => {
    describe('formatSize', () => {
        it('formats 0 bytes', () => {
            expect(formatSize(0)).toBe('0 Bytes');
        });

        it('formats bytes', () => {
            expect(formatSize(500)).toBe('500 Bytes');
        });

        it('formats kilobytes', () => {
            expect(formatSize(1024)).toBe('1 KB');
            expect(formatSize(1536)).toBe('1.5 KB');
        });

        it('formats megabytes', () => {
            expect(formatSize(1024 * 1024)).toBe('1 MB');
            expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
        });

        it('formats gigabytes', () => {
            expect(formatSize(1024 * 1024 * 1024)).toBe('1 GB');
        });

        it('respects decimal places parameter', () => {
            expect(formatSize(1536, 0)).toBe('2 KB');
            expect(formatSize(1536, 1)).toBe('1.5 KB');
            expect(formatSize(1536, 3)).toBe('1.5 KB');
        });
    });
});
