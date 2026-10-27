// Единая точка импорта UI-библиотек (Preact + htm лежат в vendor/, без сборщиков).
import { h, render, Fragment, createContext, Component } from './vendor/preact/src/index.js';
import htm from './vendor/htm/index.mjs';

export * from './vendor/preact/hooks/src/index.js';
export { h, render, Fragment, createContext, Component };

// Пропускает перерисовку, если свойства не изменились (поверхностное сравнение).
// ignore — свойства, которые не влияют на вид (их изменения учтены другими свойствами).
export function memo(C, ignore = []) {
  class Memo extends Component {
    shouldComponentUpdate(next) {
      const a = this.props, ka = Object.keys(a), kb = Object.keys(next);
      if (ka.length !== kb.length) return true;
      for (const k of ka) if (a[k] !== next[k] && !ignore.includes(k)) return true;
      return false;
    }
    render(props) { return h(C, props); }
  }
  Memo.displayName = `Memo(${C.name})`;
  return Memo;
}
export const html = htm.bind(h);
