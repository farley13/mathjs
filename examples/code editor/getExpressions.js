import { parse } from 'mathjs'

/**
 * Extracts parsable expressions from a multiline string.
 *
 * @param {string} str - The multiline string containing expressions.
 * @returns {Array<{from: number, to: number, source: string}>} An array of objects,
 *   where each object represents a parsable expression and contains:
 *   - from: The starting line number of the expression within the original string.
 *   - to: The ending line number of the expression within the original string.
 *   - source: The actual string content of the expression.
 */
export default function getExpressions(str) {
    const lines = str.split('\n');
    let nextLineToParse = 0;
    let lastError = null;
    //let nextLineAfterError = 0; // maybbe the duplicative with next line...
    const result = [];
    let currentStartChar = 0;

    for (let lineID = 0; lineID < lines.length; lineID++) {
        const linesToTest = lines.slice(nextLineToParse, lineID + 1).join('\n');
        lastError = parsedOrError(linesToTest);
        if (lastError == null) {
            if (!isEmptyString(linesToTest)) {
                result.push({ from: nextLineToParse, to: lineID, source: linesToTest, error: null });
            }
            // Start the next parsing attempt from the line after the successfully parsed expression.
            nextLineToParse = lineID + 1;
            currentStartChar += linesToTest.length;
        }
    }

    const lastErrorBeforeBackwards = lastError;
    const lastErrorLine = nextLineToParse;
    const startCharOfErrorBeforeBackwards = currentStartChar;
    nextLineToParse = lines.length;

    // then go backwords to find the last error
    let currentEndChar = str.length;
    for (let lineID = lines.length - 1; lineID > lastErrorLine; lineID--) {
        const linesToTest = lines.slice(lineID, nextLineToParse).join('\n');
        lastError = parsedOrError(linesToTest)
        if (lastError == null) {
            if (!isEmptyString(linesToTest)) {
                result.push({ from: lineID, to: nextLineToParse, source: linesToTest, error: null });
            }
            // Start the next parsing attempt from the line after the successfully parsed expression.
            nextLineToParse = lineID;
            currentEndChar -= linesToTest.length;
        }
    }

    const lastErrorAfterBackwards = lastError;
    const lastErrorLineAfterBackwards = nextLineToParse;
    const endCharOfErrorAfterBackwards = currentEndChar;

    // Handle any remaining lines that couldn't be parsed as expressions.
    const end = Math.max(lastErrorLineAfterBackwards - lastErrorLine, 1); // make sure if we found the same line backwards and forwards we catch it
    const linesToTest = lines.slice(lastErrorLine, lastErrorLineAfterBackwards + end).join('\n');
    if (!isEmptyString(linesToTest)) {
        result.push({ from: startCharOfErrorBeforeBackwards, to: endCharOfErrorAfterBackwards, source: linesToTest, error: lastErrorBeforeBackwards });
    }
    result.sort((a, b) => a.from - b.from);
    return result;
}

/**
 * Determines whether a given expression can be successfully parsed.
 *
 * @param {string} expression - The expression to parse.
 * @returns {boolean} True if the expression can be parsed, false otherwise.
 */
function parsedOrError(expression) {
    try {
        parse(expression)
        return null
    } catch (error) {
        return error
    }
}

/**
 * Checks if a given string is empty or only contains whitespace characters.
 *
 * @param {string} str - The string to check.
 * @returns {boolean} True if the string is empty or only contains whitespace, false otherwise.
 */
function isEmptyString(str) {
    return str.trim() === ""
}