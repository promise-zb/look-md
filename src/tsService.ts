import * as ts from 'typescript'
import { createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import type { VirtualTypeScriptEnvironment } from '@typescript/vfs'

/**
 * 离线补全用的标准库。这是 `lib.es2022` 和 `lib.dom` 的引用链，
 * 构建时打进包里，不从 CDN 拉取。
 */
const rawLibs = import.meta.glob(
  [
    '../node_modules/typescript/lib/lib.decorators.d.ts',
    '../node_modules/typescript/lib/lib.decorators.legacy.d.ts',
    '../node_modules/typescript/lib/lib.dom.d.ts',
    '../node_modules/typescript/lib/lib.dom.iterable.d.ts',
    '../node_modules/typescript/lib/lib.es5.d.ts',
    '../node_modules/typescript/lib/lib.es2015.collection.d.ts',
    '../node_modules/typescript/lib/lib.es2015.core.d.ts',
    '../node_modules/typescript/lib/lib.es2015.d.ts',
    '../node_modules/typescript/lib/lib.es2015.generator.d.ts',
    '../node_modules/typescript/lib/lib.es2015.iterable.d.ts',
    '../node_modules/typescript/lib/lib.es2015.promise.d.ts',
    '../node_modules/typescript/lib/lib.es2015.proxy.d.ts',
    '../node_modules/typescript/lib/lib.es2015.reflect.d.ts',
    '../node_modules/typescript/lib/lib.es2015.symbol.d.ts',
    '../node_modules/typescript/lib/lib.es2015.symbol.wellknown.d.ts',
    '../node_modules/typescript/lib/lib.es2016.array.include.d.ts',
    '../node_modules/typescript/lib/lib.es2016.d.ts',
    '../node_modules/typescript/lib/lib.es2016.intl.d.ts',
    '../node_modules/typescript/lib/lib.es2017.arraybuffer.d.ts',
    '../node_modules/typescript/lib/lib.es2017.d.ts',
    '../node_modules/typescript/lib/lib.es2017.date.d.ts',
    '../node_modules/typescript/lib/lib.es2017.intl.d.ts',
    '../node_modules/typescript/lib/lib.es2017.object.d.ts',
    '../node_modules/typescript/lib/lib.es2017.sharedmemory.d.ts',
    '../node_modules/typescript/lib/lib.es2017.string.d.ts',
    '../node_modules/typescript/lib/lib.es2017.typedarrays.d.ts',
    '../node_modules/typescript/lib/lib.es2018.asyncgenerator.d.ts',
    '../node_modules/typescript/lib/lib.es2018.asynciterable.d.ts',
    '../node_modules/typescript/lib/lib.es2018.d.ts',
    '../node_modules/typescript/lib/lib.es2018.intl.d.ts',
    '../node_modules/typescript/lib/lib.es2018.promise.d.ts',
    '../node_modules/typescript/lib/lib.es2018.regexp.d.ts',
    '../node_modules/typescript/lib/lib.es2019.array.d.ts',
    '../node_modules/typescript/lib/lib.es2019.d.ts',
    '../node_modules/typescript/lib/lib.es2019.intl.d.ts',
    '../node_modules/typescript/lib/lib.es2019.object.d.ts',
    '../node_modules/typescript/lib/lib.es2019.string.d.ts',
    '../node_modules/typescript/lib/lib.es2019.symbol.d.ts',
    '../node_modules/typescript/lib/lib.es2020.bigint.d.ts',
    '../node_modules/typescript/lib/lib.es2020.d.ts',
    '../node_modules/typescript/lib/lib.es2020.date.d.ts',
    '../node_modules/typescript/lib/lib.es2020.intl.d.ts',
    '../node_modules/typescript/lib/lib.es2020.number.d.ts',
    '../node_modules/typescript/lib/lib.es2020.promise.d.ts',
    '../node_modules/typescript/lib/lib.es2020.sharedmemory.d.ts',
    '../node_modules/typescript/lib/lib.es2020.string.d.ts',
    '../node_modules/typescript/lib/lib.es2020.symbol.wellknown.d.ts',
    '../node_modules/typescript/lib/lib.es2021.d.ts',
    '../node_modules/typescript/lib/lib.es2021.intl.d.ts',
    '../node_modules/typescript/lib/lib.es2021.promise.d.ts',
    '../node_modules/typescript/lib/lib.es2021.string.d.ts',
    '../node_modules/typescript/lib/lib.es2021.weakref.d.ts',
    '../node_modules/typescript/lib/lib.es2022.array.d.ts',
    '../node_modules/typescript/lib/lib.es2022.d.ts',
    '../node_modules/typescript/lib/lib.es2022.error.d.ts',
    '../node_modules/typescript/lib/lib.es2022.intl.d.ts',
    '../node_modules/typescript/lib/lib.es2022.object.d.ts',
    '../node_modules/typescript/lib/lib.es2022.regexp.d.ts',
    '../node_modules/typescript/lib/lib.es2022.string.d.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  lib: ['ES2022', 'DOM'],
  strict: false,
  jsx: ts.JsxEmit.React,
  allowJs: true,
  noEmit: true,
}

function libMap() {
  const map = new Map<string, string>()
  for (const [file, text] of Object.entries(rawLibs)) {
    const name = file.slice(file.lastIndexOf('/') + 1)
    map.set(`/${name}`, text)
  }
  return map
}

let environment: Promise<VirtualTypeScriptEnvironment> | null = null

function getEnvironment() {
  if (!environment) {
    environment = Promise.resolve().then(
      () => createVirtualTypeScriptEnvironment(createSystem(libMap()), [], ts, compilerOptions),
    )
  }
  return environment
}

export async function typescriptCompletions(path: string, code: string, pos: number) {
  const env = await getEnvironment()
  if (env.getSourceFile(path)) env.updateFile(path, code)
  else env.createFile(path, code)
  return env.languageService.getCompletionsAtPosition(path, pos, {
    includeCompletionsForModuleExports: false,
    includeCompletionsWithInsertText: true,
  })
}
