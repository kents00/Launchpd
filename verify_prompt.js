
import { promptSecret } from './src/utils/prompt.js';

console.log('Testing promptSecret...');
console.log('Please type "test" and press Enter:');

try {
    const result = await promptSecret('Secret: ');
    if (result === 'test') {
        console.log('\nSUCCESS: Captured "test" correctly.');
        process.exit(0);
    } else {
        console.log(`\nFAILURE: Captured "${result}" instead of "test".`);
        process.exit(1);
    }
} catch (err) {
    console.error(err);
    process.exit(1);
}
