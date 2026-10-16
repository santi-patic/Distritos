// Configuración de ESLint (flat config).
// Lo importante está en el bloque «paquete sim»: la simulación compartida tiene que ser
// determinista bit a bit entre máquinas, así que dentro de packages/sim/src se prohíben
// la coma flotante, el reloj de pared, el azar del sistema y las iteraciones sin orden.
// Ver «Esquema del paquete sim — F0», §6.5.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** Reglas propias del proyecto, definidas en línea para no mantener un plugin aparte. */
const distritos = {
  rules: {
    'no-float-literal': {
      meta: {
        type: 'problem',
        docs: { description: 'Solo literales numéricos enteros y seguros (sin punto ni exponente).' },
        schema: [],
      },
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value !== 'number') return;
            const raw = node.raw ?? '';
            const prefixed = /^0[xXoObB]/.test(raw);
            const decimalOrExponent = !prefixed && /[.eE]/.test(raw);
            if (decimalOrExponent || !Number.isSafeInteger(node.value)) {
              context.report({
                node,
                message: `Literal «${raw}»: en sim solo se permiten enteros seguros, sin punto ni exponente.`,
              });
            }
          },
        };
      },
    },
  },
};

const mathBanned = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'sqrt',
  'cbrt',
  'hypot',
  'random',
  'fround',
  'round',
  'sign',
  'ceil',
  'floor',
  'trunc',
  'abs',
  'min',
  'max',
  'imul',
  'clz32',
].map((property) => ({
  object: 'Math',
  property,
  message: 'Math.* está prohibido en sim salvo en arith.ts, rng.ts y hash.ts.',
}));

const simRestrictedProperties = [
  ...mathBanned,
  { object: 'Number', property: 'parseFloat', message: 'Sin coma flotante en sim.' },
  { object: 'JSON', property: 'parse', message: 'JSON.parse solo en serialize.ts, que valida enteros.' },
  { object: 'Object', property: 'keys', message: 'Itera con iter.ts, que ordena las claves.' },
  { object: 'Object', property: 'values', message: 'Itera con iter.ts, que ordena las claves.' },
  { object: 'Object', property: 'entries', message: 'Itera con iter.ts, que ordena las claves.' },
];

const simRestrictedSyntax = [
  { selector: "BinaryExpression[operator='/']", message: 'División solo en arith.ts (fdiv, tdiv, ceilDiv).' },
  { selector: "BinaryExpression[operator='%']", message: 'Módulo solo en arith.ts (fmod).' },
  { selector: "BinaryExpression[operator='**']", message: 'Potencia prohibida en sim.' },
  {
    selector: 'AssignmentExpression[operator=/^(\\/=|%=|\\*\\*=)$/]',
    message: 'División, módulo y potencia solo en arith.ts.',
  },
  { selector: 'ForInStatement', message: 'for…in no tiene orden garantizado; usa iter.ts.' },
  {
    selector: 'NewExpression[callee.name=/^(Map|Set|WeakMap|WeakSet|Date)$/]',
    message: 'El estado es JSON plano; sin Map, Set ni Date en sim.',
  },
  {
    selector: "CallExpression[callee.property.name='sort'][arguments.length=0]",
    message: 'sort() siempre con comparador.',
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(toFixed|toPrecision|toLocaleString|toLocaleDateString|toLocaleTimeString)$/]',
    message: 'Formateo de números prohibido en sim.',
  },
];

const simRestrictedGlobals = [
  'Date',
  'performance',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'requestAnimationFrame',
  'crypto',
  'parseFloat',
  'Intl',
  'fetch',
  'process',
  'console',
  'localStorage',
  'sessionStorage',
].map((name) => ({
  name,
  message: `«${name}» está prohibido en sim: sin reloj de pared, azar del sistema ni efectos.`,
}));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // En las pruebas se permite indexar con `!`: los datos son fijos y conocidos.
    files: ['**/test/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
    },
  },

  // ---- paquete sim: determinismo por lint ----------------------------------------
  {
    files: ['packages/sim/src/**/*.ts'],
    plugins: { distritos },
    rules: {
      'distritos/no-float-literal': 'error',
      'no-restricted-globals': ['error', ...simRestrictedGlobals],
      'no-restricted-properties': ['error', ...simRestrictedProperties],
      'no-restricted-syntax': ['error', ...simRestrictedSyntax],
      'no-bitwise': 'error',
    },
  },
  {
    // arith.ts es el único sitio con división, módulo y Math.floor/trunc/abs/min/max.
    files: ['packages/sim/src/arith.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...simRestrictedProperties.filter(
          (r) => !(r.object === 'Math' && ['floor', 'trunc', 'abs', 'min', 'max'].includes(r.property)),
        ),
      ],
      'no-restricted-syntax': [
        'error',
        ...simRestrictedSyntax.filter((r) => !/operator='[/%]'/.test(r.selector)),
      ],
    },
  },
  {
    // rng.ts y hash.ts trabajan con palabras de 32 bits a propósito.
    files: ['packages/sim/src/rng.ts', 'packages/sim/src/hash.ts'],
    rules: {
      'no-bitwise': 'off',
      'no-restricted-properties': [
        'error',
        ...simRestrictedProperties.filter((r) => !(r.object === 'Math' && r.property === 'imul')),
      ],
    },
  },
  {
    // serialize.ts es el único sitio que parsea JSON, y valida que todo número sea entero seguro.
    files: ['packages/sim/src/serialize.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...simRestrictedProperties.filter((r) => !(r.object === 'JSON' && r.property === 'parse')),
      ],
    },
  },
  {
    // iter.ts es el único sitio que lee claves de objetos, y las ordena.
    files: ['packages/sim/src/iter.ts'],
    rules: {
      'no-restricted-properties': ['error', ...simRestrictedProperties.filter((r) => r.object !== 'Object')],
    },
  },
);
