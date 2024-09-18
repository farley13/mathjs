import './style.css'
import 'github-markdown-css/github-markdown.css'
import 'katex/dist/katex.min.css'
import { StreamLanguage, matchBrackets } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { showTooltip } from "@codemirror/view"
import {StateField} from "@codemirror/state"

import { basicSetup, EditorView } from 'codemirror'
import katex from 'katex'
import { all, create, re } from 'mathjs'
import getExpressions from './getExpressions'
import { mathjsLang } from './mathjs-lang.js'

const timeout = 250 // milliseconds
const digits = 14

const math = create(all)
const parser = math.parser()
const context = new Map();
const editorDOM = document.querySelector('#editor')
const resultsDOM = document.querySelector('#result')

let processedExpressions
let previousSelectedExpressionIndex
let timer

const doc = [
"round(e, 3)",
 "atan2(3, -3 / pi",
 "a = 2",
 "b = 3",
  "c = 4",
 // "log(10000, exp(10))",
 // "myFunc(a, b, c) = a * b + c",
  /*"sqrt(-4)",
  "derivative('x^2 + x', 'x')",
  "pow([[-1, 2], [3, 1]], 2)",
  "# expressions",
  "1.2 * (2 + 4.5)",
  "12.7 cm to inch",
  "sin(45 deg) ^ 2",
  "9 / 3 + 2i",
  "det([-1, 2; 3, 1])"*/
].join('\n')


//!cursorTooltipField


const cursorTooltipField = StateField.define({
  create: getCursorTooltips,

  update(tooltips, tr) {
    if (!tr.docChanged && !tr.selection) return tooltips
    return getCursorTooltips(tr.state)
  },

  provide: f => showTooltip.computeN([f], state => state.field(f))
})



//!getCursorTooltips


//import {EditorState} from "@codemirror/state"

function getCursorTooltips(state) {
  return state.selection.ranges
    .filter(range => range.empty)
    .map(range => {
      let line = state.doc.lineAt(range.head)
      let text ="";// line.number + ":" + (range.head - line.from)
      let start = range.head;
      let found = false
      while (start < range.head + 10000 && !found) {
        let textToLookAt = state.doc.slice(start, 10000);
        //let reversedText = textToLookAt.toString().split("").reverse().join("");
        // BUG!! We should look for the next closing parens and then find it's matching open parens
        // then find the function name before the open parens
        let parensMatch = textToLookAt.toString().match(/\)/); // look backwards for the first open paren
        if (parensMatch) {
          const parensIndex = start + parensMatch.index + 1;
          const match = matchBrackets(state, parensIndex, -1);
          if (match && match.matched) { 
            let reversedText = state.doc.slice(Math.max(start - 100, 0), match.end.to).toString().split("").reverse().join("");
            let reverseParensMatchPrefix = reversedText.match(/\w+/); // find the text before the open paren - this is the function name  
            if (reverseParensMatchPrefix) {
              let parensMatchPrefix = reverseParensMatchPrefix[0].split("").reverse().join("");
              if ((match.end.from - parensMatchPrefix.length) < range.head) {
                text = parensMatchPrefix;
                const options = mathJsLangInstance.generateBuiltInOptions(text);
                for (const entry of options) {
                  if (entry.label === text) {
                    text = entry.info;
                  }
                }
                found = true;
              }
            }
          }
          start = parensIndex;
        } else{
          start += 10000;
        }
      }
      if (!found) {
        return null
      }
      return {
        pos: range.head,
        above: true,
        strictSide: true,
        arrow: true,
        create: () => {
          let dom = document.createElement("div")
          dom.className = "cm-tooltip-cursor"
          dom.textContent = text
          return {dom}
        }
      }
    })
}

//!baseTheme

//import {EditorView} from "@codemirror/view"

const cursorTooltipBaseTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-tooltip-cursor": {
    backgroundColor: "#66b",
    color: "white",
    border: "none",
    padding: "2px 7px",
    borderRadius: "4px",
    "& .cm-tooltip-arrow:before": {
      borderTopColor: "#66b"
    },
    "& .cm-tooltip-arrow:after": {
      borderTopColor: "transparent"
    }
  }
})

//!cursorTooltip

export function cursorTooltip() {
  return [cursorTooltipField, cursorTooltipBaseTheme]
}

let mathJsLangInstance = mathjsLang(math, context);
mathJsLangInstance.addUserDocumentedFunctions([
  ({ label: "userAddedFunction",  type: 'function', 
    info: "userAddedFunction(x, y)",
    //info: "function(x, y)",
    boost: 10 })])

let startState = EditorState.create({
  doc,
  extensions: [
    basicSetup,
    StreamLanguage.define(mathJsLangInstance),
    cursorTooltip(),
    mathJsLangInstance.createLinter(),
    EditorView.lineWrapping,
    // setup https://github.com/codemirror/website/blob/8b30aec3ce78fb62de4021917fcc67d0affbb58c/site/examples/tooltip/tooltip.ts#L64
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        // if doc changed debounce and update results after a timeout
        clearTimeout(timer)
        timer = setTimeout(() => {
          updateResults()
          previousSelectedExpressionIndex = null
          updateSelection()
        }, timeout)
      } else if (update.selectionSet) {
        updateSelection()
      }
    })
  ],
})

let editor = new EditorView({
  state: startState,
  parent: editorDOM
})

/**
 * Evaluates a given expression using a parser.
 *
 * @param {string} expression - The expression to evaluate.
 * @returns {any} The result of the evaluation, or the error message if an error occurred.
*/
function calc(expression, scope) {
  let result
  try {
    result = parser.evaluate(expression)
    //scope.clear();
    for (const [key, value] of parser.getAllAsMap()) {
      scope.set(key, value)
    }
  } catch (error) {
    result = error.toString()
  }
  return result
}

/**
 * Formats result depending on the type of result
 *
 * @param {number, string, Help, any} result - The result to format
 * @returns {string} The string in HTML with the formated result
 */
const formatResult = math.typed({
  'number': result => math.format(result, { precision: digits }),
  'string': result => `<code>${result}</code>`,
  'Help': result => `<pre>${math.format(result)}</pre>`,
  'any': math.typed.referTo(
    'number',
    fnumber => result => katex.renderToString(math.parse(fnumber(result)).toTex())
  )
})

/**
 * Processes an array of expressions by evaluating them, formatting the results,
 * and determining their visibility.
 *
 * @param {Array<{from: number, to: number, source: string}>} expressions - An array of objects representing expressions,
 *   where each object has `from`, `to`, and `source` properties.
 * @returns {Array<{from: number, to: number, source: string, outputs: any, visible: boolean}>} An array of processed expressions,
 *   where each object has additional `outputs` and `visible` properties.
 */
function processExpressions(expressions, scope) {
  parser.clear()
  //scope.clear()
  return expressions.map(expression => {
    const result = calc(expression.source, scope)
    const outputs = formatResult(result)
    // Determine visibility based on the result type:
    // - Undefined results are hidden.
    // - Results with an `isResultSet` property are hidden when empty.
    // - All other results are visible.
    const visible = result === undefined ? false : (result.isResultSet && result.entries.length === 0) ? false : true
    return ({
      ...expression,
      outputs,
      visible
    })
  })
}

/**
 * Updates the displayed results based on the editor's current content.
 *
 * @function updateResults
 * @requires getExpressions, processExpressions, resultsToHTML
 *
 * @description
 * 1. Extracts expressions from the editor's content.
 * 2. Evaluates and analyzes the expressions.
 * 3. Generates HTML to display the processed results.
 * 4. Renders the generated HTML in the designated results container.
 */
function updateResults() {
  // Extract expressions from the editor's content.
  const expressions = getExpressions(editor.state.doc.toString());

  // Evaluate and analyze the expressions.
  processedExpressions = processExpressions(expressions, context);

  // Generate HTML to display the results.
  const resultsHtml = resultsToHTML(processedExpressions);

  // Render the generated HTML in the results container.
  resultsDOM.innerHTML = resultsHtml;
}

/**
* Updates the visual highlighting of results based on the current line selection in the editor.
*
* @function updateSelection
* @requires editor, processedExpressions
*
* @description
* 1. Determines the current line number in the editor's selection.
* 2. Finds the corresponding result (processed expression) that matches the current line.
* 3. If a different result is selected than before:
*   - Removes highlighting from the previously selected result.
*   - Highlights the newly selected result.
*   - Scrolls the newly selected result into view.
*/
function updateSelection() {
  const selectedLine = editor.state.doc.lineAt(
    editor.state.selection.ranges[editor.state.selection.mainIndex].from
  ).number - 1;

  let selectedExpressionIndex;

  processedExpressions.forEach((result, index) => {
    if ((selectedLine >= result.from) && (selectedLine <= result.to)) {
      selectedExpressionIndex = index;
    }
  });

  if (selectedExpressionIndex !== previousSelectedExpressionIndex) {
    const previouslyHighlightedResult = document.querySelector('#result').children[previousSelectedExpressionIndex];
    if (previouslyHighlightedResult !== undefined) {
      previouslyHighlightedResult.className = null;
    }

    const currentlySelectedResult = document.querySelector('#result').children[selectedExpressionIndex];
    if (currentlySelectedResult !== undefined) {
      currentlySelectedResult.className = 'highlighted';
      currentlySelectedResult.scrollIntoView({ block: 'nearest', inline: 'start' });
    }

    previousSelectedExpressionIndex = selectedExpressionIndex;
  }
}

/**
* Converts an array of processed results into HTML elements for display.
*
* @function resultsToHTML
* @param {Array<{from: number, to: number, source: string, outputs: any, visible: boolean}>} results - An array of processed results, where each object has:
*   - from: The starting line number of the expression.
*   - to: The ending line number of the expression.
*   - source: The original expression string.
*   - outputs: The formatted result of evaluating the expression.
*   - visible: A boolean indicating whether the result should be displayed or hidden.
* @returns {string} A string of HTML elements representing the results, where each result is enclosed in a <pre> tag with appropriate styling based on its visibility.
*/
function resultsToHTML(results) {
  return results.map(el => {
    const elementStyle = el.visible ? '' : 'style="display:none"'
    return `<pre ${elementStyle}>${el.outputs}</pre>`
  }
  ).join('')
}

updateResults()
