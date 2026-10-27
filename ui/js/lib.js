// Единая точка импорта UI-библиотек (Preact + htm лежат в vendor/, без сборщиков).
import { h, render, Fragment, createContext } from './vendor/preact/src/index.js';
import htm from './vendor/htm/index.mjs';

export * from './vendor/preact/hooks/src/index.js';
export { h, render, Fragment, createContext };
export const html = htm.bind(h);
