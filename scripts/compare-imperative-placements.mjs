import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import { transformSync } from '@babel/core';
import terser from '@rollup/plugin-terser';
import { rollup } from 'rollup';

const root = fileURLToPath(new URL('..', import.meta.url));
const baseline = 'ac0fc8e';
const peers = ['react', 'effector', 'effector-react', 'effector-react/scope'];
const common = `
import {createEvent,createStore} from 'effector';
import {createElement,useImperativeHandle,useRef} from 'react';
export const focus=createEvent();
const $value=createStore('text');
function View({events,value}) {
 const field=useRef(null);
 useImperativeHandle(events,()=>({focus(){field.current?.focus()}}),[]);
 return createElement('textarea',{value,readOnly:true,ref:field});
}
`;
const consumers = {
  pristine: {
    old: true,
    code:
      common +
      `import {reflect} from './src/index';export const Editor=reflect({view:View,bind:{value:$value}});`,
  },
  safe_baseline: {
    old: true,
    safe: true,
    code:
      common +
      `import {reflect} from './src/index';export const Editor=reflect({view:View,bind:{value:$value}});`,
  },
  base: {
    code:
      common +
      `import {reflect} from './src/index';export const Editor=reflect({view:View,bind:{value:$value}});`,
  },
  outer: {
    code:
      common +
      `import {reflect} from './src/index';import {withImperativeEvents} from './src/experiments/with-events';export const Editor=withImperativeEvents({focus})(reflect({view:View,bind:{value:$value}}));`,
  },
  inner: {
    code:
      common +
      `import {reflect} from './src/index';import {withImperativeEvents} from './src/experiments/with-events';export const Editor=reflect({view:withImperativeEvents({focus})(View),bind:{value:$value}});`,
  },
  field: {
    code:
      common +
      `import {reflect} from './src/experiments/integrated';export const Editor=reflect({view:View,bind:{value:$value},events:{focus}});`,
  },
  separate: {
    code:
      common +
      `import {reflectWithEvents} from './src/experiments/integrated';export const Editor=reflectWithEvents({view:View,bind:{value:$value},events:{focus}});`,
  },
  field_unused: {
    code:
      common +
      `import {reflect} from './src/experiments/integrated';export const Editor=reflect({view:View,bind:{value:$value}});`,
  },
  separate_unused: {
    code:
      common +
      `import {reflect} from './src/index';import {reflectWithEvents} from './src/experiments/integrated';export const Editor=reflect({view:View,bind:{value:$value}});`,
  },
};
function historical(file) {
  try {
    return execFileSync('git', ['show', `${baseline}:${path.relative(root, file)}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}
const isHistorical = (consumer, file) =>
  consumer.old ||
  (consumer.originalCore &&
    (file === path.join(root, 'src/index.ts') ||
      file.startsWith(path.join(root, 'src/core/'))));
async function buildCode(consumer) {
  const bundle = await rollup({
    input: '\0consumer',
    external: peers,
    plugins: [
      {
        name: 'isolated-consumer',
        async resolveId(id, importer) {
          if (id === '\0consumer') return id;
          if (peers.includes(id)) return { id, external: true };
          const base = path.resolve(
            importer === '\0consumer' ? root : path.dirname(importer),
            id,
          );
          for (const candidate of path.extname(base)
            ? [base]
            : [base + '.ts', path.join(base, 'index.ts')]) {
            const code = isHistorical(consumer, candidate)
              ? historical(candidate)
              : await readFile(candidate, 'utf8').catch(() => null);
            if (code !== null) return candidate;
          }
        },
        async load(id) {
          if (id === '\0consumer') return consumer.code;
          if (id.startsWith(root)) {
            let code = isHistorical(consumer, id)
              ? historical(id)
              : await readFile(id, 'utf8');
            if (consumer.safe && id.endsWith('/core/reflect.ts'))
              code = code
                .replace(
                  '      const fn = functions[key];',
                  '      const fn = functions[key];\n      if (!fn) continue;',
                )
                .replace(
                  'scope: scope || undefined, safe: true',
                  '...(scope ? {scope} : {}), safe: true',
                );
            return code;
          }
        },
        transform(code, id) {
          if (id.endsWith('.ts'))
            return transformSync(code, {
              filename: id,
              babelrc: false,
              configFile: false,
              presets: ['@babel/preset-typescript'],
            }).code;
        },
      },
    ],
  });
  try {
    const { output } = await bundle.generate({
      format: 'es',
      plugins: [terser({ module: true })],
    });
    return output[0].code;
  } finally {
    await bundle.close();
  }
}
consumers.hoc_unused = {
  originalCore: true,
  code:
    common +
    `import {reflect} from './src/index'; import {withImperativeEvents} from './src/experiments/with-events';export const Editor=reflect({view:View,bind:{value:$value}});`,
};
consumers.outer_pristine = { ...consumers.outer, originalCore: true };
consumers.inner_pristine = { ...consumers.inner, originalCore: true };
const results = {};
for (const [name, consumer] of Object.entries(consumers)) {
  const code = await buildCode(consumer);
  results[name] = {
    minified: Buffer.byteLength(code),
    gzip: gzipSync(code).length,
    brotli: brotliCompressSync(code, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
    includesImperative: code.includes('createWatch'),
  };
}
console.table(results);
if (
  results.base.includesImperative ||
  results.separate_unused.includesImperative ||
  results.hoc_unused.includesImperative
)
  throw new Error('Unused optional feature leaked into base consumer');
let minifiedTests;
if (process.argv.includes('--test')) {
  execFileSync('pnpm', ['exec', 'tsc', '-p', 'type-tests/minimal'], {
    cwd: root,
    stdio: 'inherit',
  });
  execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });
  for (const [file, code] of Object.entries({
    'experiment-with.mjs':
      "export {withImperativeEvents} from './src/experiments/with-events';",
    'experiment-integrated.mjs':
      "export {reflect,reflectWithEvents} from './src/experiments/integrated';",
  }))
    await writeFile(path.join(root, 'dist', file), await buildCode({ code }));
  await writeFile(
    path.join(root, 'dist/experiment.config.mts'),
    `
    // Generated by scripts/compare-imperative-placements.mjs.
    import base from '../vitest.config.mts';
    import {mergeConfig} from 'vitest/config';
    import {fileURLToPath} from 'node:url';
    export default mergeConfig(base,{resolve:{alias:[
      {find:'./with-events',replacement:fileURLToPath(new URL('./experiment-with.mjs',import.meta.url))},
      {find:'./integrated',replacement:fileURLToPath(new URL('./experiment-integrated.mjs',import.meta.url))},
    ]}});
  `,
  );
  execFileSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      'src/experiments',
      '--config',
      'dist/experiment.config.mts',
      '--maxWorkers=1',
      '--minWorkers=1',
      '--reporter=default',
      '--reporter=json',
      '--outputFile=dist/experiment-tests.json',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, CI: '1', EXPERIMENT_MINIFIED: '1' },
    },
  );
  const stats = JSON.parse(
    await readFile(path.join(root, 'dist/experiment-tests.json'), 'utf8'),
  );
  minifiedTests = {
    passed: stats.numPassedTests,
    failed: stats.numFailedTests,
    total: stats.numTotalTests,
  };
}
const report = {
  generatedBy: 'node scripts/compare-imperative-placements.mjs --test',
  baseline,
  peerDependenciesExternal: peers,
  brotliQuality: 11,
  node: process.version,
  results,
  ...(minifiedTests ? { minifiedTests } : {}),
};
await writeFile(
  path.join(root, 'src/experiments/bundle-results.json'),
  JSON.stringify(report, null, 2) + '\n',
);
