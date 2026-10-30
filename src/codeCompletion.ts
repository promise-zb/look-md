import { autocompletion } from '@codemirror/autocomplete'
import type { Completion, CompletionSource } from '@codemirror/autocomplete'
import {
  javascriptLanguage,
  jsxLanguage,
  typescriptLanguage,
  tsxLanguage,
} from '@codemirror/lang-javascript'
import { StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'

let nextSnippet = 0

/** 每个代码块一块虚拟文件，避免共用一个路径时互相覆盖。 */
const snippetPath = StateField.define<string>({
  create: () => `/snippet-${nextSnippet++}.tsx`,
  update: (path) => path,
})

function isJavaScript(state: EditorState, pos: number) {
  return (
    javascriptLanguage.isActiveAt(state, pos) ||
    typescriptLanguage.isActiveAt(state, pos) ||
    jsxLanguage.isActiveAt(state, pos) ||
    tsxLanguage.isActiveAt(state, pos)
  )
}

const TYPE_KEYWORDS = new Set([
  'string',
  'number',
  'boolean',
  'bigint',
  'any',
  'unknown',
  'void',
  'never',
  'object',
  'symbol',
  'undefined',
  'null',
])

function completionType(name: string, kind: string) {
  if (kind === 'keyword' && TYPE_KEYWORDS.has(name)) return 'type'
  switch (kind) {
    case 'keyword':
      return 'keyword'
    case 'method':
    case 'memberFunction':
      return 'method'
    case 'function':
    case 'localFunction':
      return 'function'
    case 'class':
    case 'localClass':
      return 'class'
    case 'interface':
      return 'interface'
    case 'enum':
    case 'enumMember':
      return 'enum'
    case 'type':
    case 'alias':
    case 'typeParameter':
      return 'type'
    case 'var':
    case 'let':
    case 'const':
    case 'localVariable':
      return 'variable'
    case 'property':
    case 'memberVariable':
      return 'property'
    case 'module':
      return 'namespace'
    default:
      return 'text'
  }
}

const languageSources: CompletionSource = async (context) => {
  const sources = context.state.languageDataAt<CompletionSource>('autocomplete', context.pos)
  let merged: Awaited<ReturnType<CompletionSource>> = null
  for (const source of sources) {
    const result = await source(context)
    if (!result) continue
    if (!merged) {
      merged = result
      continue
    }
    merged = {
      from: Math.min(merged.from, result.from),
      options: merged.options.concat(result.options),
      validFor: merged.validFor ?? result.validFor,
    }
  }
  return merged
}

const source: CompletionSource = async (context) => {
  if (!isJavaScript(context.state, context.pos)) return languageSources(context)
  try {
    const { typescriptCompletions } = await import('./tsService')
    const code = context.state.doc.toString()
    const result = await typescriptCompletions(context.state.field(snippetPath), code, context.pos)
    if (!result || result.entries.length === 0) return null
    const span = result.entries.find((entry) => entry.replacementSpan)?.replacementSpan
    const word = context.matchBefore(/[\w$]+$/)
    const from = span ? span.start : word ? word.from : context.pos
    const options: Completion[] = result.entries.map((entry) => ({
      label: entry.name,
      type: completionType(entry.name, entry.kind),
      apply: entry.insertText && !entry.isSnippet ? entry.insertText : undefined,
    }))
    return { from, options, validFor: /^[\w$]*$/ }
  } catch {
    return languageSources(context)
  }
}

export const codeCompletion = [snippetPath, autocompletion({ override: [source] })]
