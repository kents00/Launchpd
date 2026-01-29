
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prompt, promptSecret } from '../src/utils/prompt.js';
import { createInterface } from 'node:readline';

vi.mock('node:readline', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createInterface: vi.fn(),
        emitKeypressEvents: vi.fn(),
    };
});

describe('prompt utils', () => {
    describe('prompt', () => {
        it('resolves with user input', async () => {
            const mockQuestion = vi.fn((q, cb) => cb('answer'));
            const mockClose = vi.fn();
            createInterface.mockReturnValue({
                question: mockQuestion,
                close: mockClose,
            });

            const result = await prompt('Question? ');

            expect(result).toBe('answer');
            expect(mockQuestion).toHaveBeenCalledWith('Question? ', expect.any(Function));
            expect(mockClose).toHaveBeenCalled();
        });
    });

    describe('promptSecret', () => {
        let mockStdin;
        let mockStdout;

        beforeEach(() => {
            mockStdin = {
                isTTY: true,
                setRawMode: vi.fn(),
                resume: vi.fn(),
                setEncoding: vi.fn(),
                pause: vi.fn(),
                removeListener: vi.fn(),
                on: vi.fn(),
            };
            mockStdout = {
                write: vi.fn(),
            };

            vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStdin);
            vi.spyOn(process, 'stdout', 'get').mockReturnValue(mockStdout);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('resolves with secret input on Enter', async () => {
            mockStdin.on.mockImplementation((event, handler) => {
                if (event === 'keypress') {
                    // Simulate typing 'abc' then Enter
                    handler('a', { name: 'a' });
                    handler('b', { name: 'b' });
                    handler('c', { name: 'c' });
                    handler('\r', { name: 'return' });
                }
            });

            const result = await promptSecret('Secret: ');

            expect(result).toBe('abc');
            expect(mockStdout.write).toHaveBeenCalledWith('Secret: ');
            expect(mockStdout.write).toHaveBeenCalledWith('*'); // Called 3 times
            expect(mockStdout.write).toHaveBeenCalledWith('\n');
        });
    });
});
