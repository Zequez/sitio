// hotImport.ts
//
// Usage:
//
// import value from "./hotImport"
//
// The imported module below will hot-update itself without invalidating
// modules that imported *this* wrapper.
//
// Caveat:
// - Consumers must read updated values dynamically from this module.
// - If you destructure exports once at module init time, you freeze references.
//
// Example:
//
// import { api } from "./hotImport"
//
// setInterval(() => {
//   api.doSomething()
// }, 1000)

import * as importedModule from "./text.txt?raw";

// Mutable live reference
let currentModule = importedModule;

// Re-export live bindings through getters
export const moduleRef = new Proxy(
  {},
  {
    get(_, key) {
      return (currentModule as any)[key];
    },
    has(_, key) {
      return key in currentModule;
    },
    ownKeys() {
      return Reflect.ownKeys(currentModule);
    },
    getOwnPropertyDescriptor() {
      return {
        enumerable: true,
        configurable: true,
      };
    },
  },
) as typeof importedModule;

// Optional default export passthrough
export default moduleRef;

// Optional named passthrough helper
export function getModule(): typeof importedModule {
  return currentModule;
}

// HOT reload handling
if (import.meta.hot) {
  import.meta.hot.accept("./target", (newModule) => {
    if (newModule) {
      currentModule = newModule;
    }
  });

  // Prevent propagation upward
  import.meta.hot.accept();
}
