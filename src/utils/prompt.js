
import { createInterface, emitKeypressEvents } from 'node:readline';

/**
 * Prompt for user input
 */
export function prompt(question) {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            // Small delay to allow Windows handles to cleanup before process.exit might be called
            // Increased to 100ms to be safer against UV_HANDLE_CLOSING assertion on Windows
            setTimeout(() => resolve(answer.trim()), 100);
        });
    });
}

/**
 * Prompt for secret user input (masks with *)
 */
export function promptSecret(question) {
    return new Promise((resolve) => {
        const { stdin, stdout } = process;

        stdout.write(question);

        // Prepare stdin
        if (stdin.isTTY) {
            stdin.setRawMode(true);
        }
        stdin.resume();
        stdin.setEncoding('utf8');

        // Enable keypress events
        emitKeypressEvents(stdin);

        let secret = '';

        const handler = (str, key) => {
            key = key || {};

            // Check for Ctrl+C
            if (key.ctrl && key.name === 'c') {
                cleanup();
                stdout.write('\n'); // Newline before exit
                process.exit();
            }

            // Check for Enter
            if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                stdout.write('\n');
                resolve(secret.trim());
                return;
            }

            // Check for Backspace
            if (key.name === 'backspace') {
                if (secret.length > 0) {
                    secret = secret.slice(0, -1);
                    // Move cursor back, overwrite with space, move back again
                    stdout.write('\b \b');
                }
                return;
            }

            // Printable characters (exclude control keys)
            if (str && str.length === 1 && str.match(/[ -~]/) && !key.ctrl && !key.meta) {
                secret += str;
                stdout.write('*');
            }
        };

        function cleanup() {
            if (stdin.isTTY) {
                stdin.setRawMode(false);
            }
            stdin.pause();
            stdin.removeListener('keypress', handler);
        }

        stdin.on('keypress', handler);
    });
}

/**
 * Prompt for confirmation (y/N)
 * @param {string} question
 * @returns {Promise<boolean>}
 */
export async function confirm(question) {
    const answer = await prompt(`${question} (y/N): `);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}
