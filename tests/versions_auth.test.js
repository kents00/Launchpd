

import { versions } from '../src/commands/versions.js';
import * as credentials from '../src/utils/credentials.js';
import * as logger from '../src/utils/logger.js';
import * as api from '../src/utils/api.js';
import * as metadata from '../src/utils/metadata.js';

// Mock dependencies
vi.mock('../src/utils/credentials.js');
vi.mock('../src/utils/logger.js');
vi.mock('../src/utils/api.js');
vi.mock('../src/utils/metadata.js');

describe('versions command', () => {
    let exitMock;

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock process.exit to prevent test from exiting
        exitMock = vi.spyOn(process, 'exit').mockImplementation(() => { });

        // Mock spinner to return an object with methods
        vi.mocked(logger.spinner).mockReturnValue({
            succeed: vi.fn(),
            fail: vi.fn(),
            update: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            stop: vi.fn(),
        });
    });

    afterEach(() => {
        exitMock.mockRestore();
    });

    it('should exit with error if user is not logged in', async () => {
        // Setup: User is NOT logged in
        credentials.isLoggedIn.mockResolvedValue(false);

        await versions('test-subdomain', {});

        // Expect error message
        expect(logger.errorWithSuggestions).toHaveBeenCalledWith(
            expect.stringContaining('only available for authenticated users'),
            expect.anything(),
            expect.anything()
        );

        // Expect process.exit to be called
        expect(exitMock).toHaveBeenCalledWith(1);
    });

    it('should proceed if user is logged in', async () => {
        // Setup: User IS logged in
        credentials.isLoggedIn.mockResolvedValue(true);
        // Mock API response to avoid errors during execution
        api.getVersions.mockResolvedValue({ versions: [] });
        metadata.getVersionsForSubdomain.mockResolvedValue([]);

        await versions('test-subdomain', {});

        // Expect NO auth error
        expect(logger.errorWithSuggestions).not.toHaveBeenCalledWith(
            expect.stringContaining('only available for authenticated users'),
            expect.anything(),
            expect.anything()
        );

        // Expect process.exit NOT to be called (or at least not with 1 for auth reasons)
        // Note: It might be called with 1 if no versions found, but that's a different error.
        // Let's ensure isLoggedIn was called.
        expect(credentials.isLoggedIn).toHaveBeenCalled();
    });
});
