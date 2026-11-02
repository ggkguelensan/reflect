import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import terser from '@rollup/plugin-terser';
import { rollup } from 'rollup';

const root = fileURLToPath(new URL('..', import.meta.url));
const entries = {
  '@effector/reflect': path.join(root, 'dist/index.mjs'),
  '@effector/reflect/imperative': path.join(root, 'dist/imperative.mjs'),
};
const cases = {
  reflect: "export { reflect } from '@effector/reflect';",
  imperative: "export { withImperativeEvents } from '@effector/reflect/imperative';",
  combined:
    "export { reflect } from '@effector/reflect'; export { withImperativeEvents } from '@effector/reflect/imperative';",
};
const measurements = {};
for (const [name, code] of Object.entries(cases)) {
  const bundle = await rollup({
    input: '\0consumer',
    external: ['react', 'effector', 'effector-react', 'effector-react/scope'],
    plugins: [
      {
        name: 'consumer-fixture',
        resolveId(id) {
          return id === '\0consumer' ? id : entries[id];
        },
        load(id) {
          return id === '\0consumer' ? code : null;
        },
      },
    ],
  });
  try {
    const { output } = await bundle.generate({ format: 'es' });
    const chunk = output[0];
    if (name === 'reflect') {
      assert.ok(
        !Object.hasOwn(chunk.modules, entries['@effector/reflect/imperative']),
      );
      assert.ok(
        !chunk.code.includes('createWatch'),
        'Reflect must not include imperative delivery',
      );
      assert.ok(!chunk.code.includes('withImperativeEvents'));
    }
    if (name === 'imperative') {
      assert.ok(!Object.hasOwn(chunk.modules, entries['@effector/reflect']));
    }
    const minified = await bundle.generate({ format: 'es', plugins: [terser()] });
    const result = minified.output[0].code;
    measurements[name] = {
      minifiedBytes: Buffer.byteLength(result),
      gzipBytes: gzipSync(result).length,
    };
  } finally {
    await bundle.close();
  }
}

// Exercise the actual published entry point, not just test-runner aliases.
// The generated dist manifest has no lifecycle scripts.
const fixture = path.join(root, 'dist/.imperative-package-check');
await mkdir(fixture, { recursive: true });
try {
  const packed = execFileSync('pnpm', ['pack', '--pack-destination', fixture], {
    cwd: path.join(root, 'dist'),
    encoding: 'utf8',
  });
  const archive = (await readdir(fixture)).find((name) => name.endsWith('.tgz'));
  assert.ok(archive, packed);
  execFileSync('tar', ['-xzf', path.join(fixture, archive), '-C', fixture]);
  const modules = path.join(fixture, 'node_modules/@effector');
  await mkdir(modules, { recursive: true });
  await symlink(path.join(fixture, 'package'), path.join(modules, 'reflect'));
  const require = createRequire(path.join(fixture, 'consumer.cjs'));
  assert.equal(
    typeof require('@effector/reflect/imperative').withImperativeEvents,
    'function',
  );
  await writeFile(
    path.join(fixture, 'consumer.mjs'),
    `
    import assert from 'node:assert/strict';
    import { withImperativeEvents } from '@effector/reflect/imperative';
    assert.equal(typeof withImperativeEvents, 'function');
  `,
  );
  execFileSync(process.execPath, [path.join(fixture, 'consumer.mjs')]);
  const typeConsumer = `
    import { withImperativeEvents } from '@effector/reflect/imperative';
    import { createEvent } from 'effector';
    import type { Ref } from 'react';
    const focus = createEvent<void>();
    const View = (_props: { events: Ref<{ focus(): void }>; label: string }) => null;
    const Connected = withImperativeEvents({ focus })(View);
    const props: Parameters<typeof Connected>[0] = { label: 'Packed types' };
  `;
  for (const extension of ['mts', 'cts']) {
    await writeFile(path.join(fixture, `types.${extension}`), typeConsumer);
  }
  const packageRequire = createRequire(path.join(root, 'package.json'));
  execFileSync(
    process.execPath,
    [
      packageRequire.resolve('typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2020',
      path.join(fixture, 'types.mts'),
      path.join(fixture, 'types.cts'),
    ],
    { stdio: 'pipe' },
  );
  const pkg = JSON.parse(
    await readFile(path.join(fixture, 'package/package.json'), 'utf8'),
  );
  assert.ok(pkg.exports['./imperative']);
} finally {
  await rm(fixture, { recursive: true, force: true });
}

console.log(
  'Peer dependencies external; bytes measure the library code retained by each consumer.',
);
console.table(measurements);
console.log(
  'Reflect-only excludes imperative delivery; imperative-only excludes the base Reflect entry. Packed ESM/CJS imports and NodeNext types passed.',
);
