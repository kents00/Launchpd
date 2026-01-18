let display = document.getElementById('display');

/**
 * Append a number to the display
 */
function appendNumber(num) {
    if (display.value === '0' && num !== '.') {
        display.value = num;
    } else if (num === '.' && display.value.includes('.')) {
        return;
    } else {
        display.value += num;
    }
}

/**
 * Append an operator to the display
 */
function appendOperator(op) {
    const currentValue = display.value;

    if (currentValue === '') return;

    // Prevent multiple operators in a row
    const lastChar = currentValue[currentValue.length - 1];
    if (['+', '-', '*', '/', '%'].includes(lastChar)) {
        return;
    }

    display.value += op;
}

/**
 * Delete the last character
 */
function deleteLast() {
    display.value = display.value.slice(0, -1);
}

/**
 * Clear the display
 */
function clearDisplay() {
    display.value = '';
}

/**
 * Calculate the result
 */
function calculate() {
    try {
        const result = eval(display.value);
        display.value = result;
    } catch (error) {
        display.value = 'Error';
        setTimeout(() => {
            display.value = '';
        }, 1500);
    }
}

// Allow keyboard input
document.addEventListener('keydown', (event) => {
    const key = event.key;

    if (key >= '0' && key <= '9') {
        appendNumber(key);
    } else if (key === '.') {
        appendNumber('.');
    } else if (key === '+' || key === '-' || key === '*' || key === '/') {
        appendOperator(key);
    } else if (key === 'Enter' || key === '=') {
        event.preventDefault();
        calculate();
    } else if (key === 'Backspace') {
        event.preventDefault();
        deleteLast();
    } else if (key === 'Escape') {
        event.preventDefault();
        clearDisplay();
    }
});
