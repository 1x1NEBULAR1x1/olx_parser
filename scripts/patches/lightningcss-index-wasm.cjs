/**
 * Патч lightningcss/node/index.js — вместо нативного .node использует lightningcss-wasm.
 * Генерируется setup-linux-build.mjs на Linux VPS, где lightningcss-linux-* даёт Bus error.
 */
const wasm = require("lightningcss-wasm");

function wrap(call) {
  return (options) => {
    if (typeof options.visitor === "function") {
      const deps = [];
      options.visitor = options.visitor({
        addDependency(dep) {
          deps.push(dep);
        },
      });

      let result = call(options);
      if (result instanceof Promise) {
        result = result.then((res) => {
          if (deps.length) {
            res.dependencies ??= [];
            res.dependencies.push(...deps);
          }
          return res;
        });
      } else if (deps.length) {
        result.dependencies ??= [];
        result.dependencies.push(...deps);
      }
      return result;
    }
    return call(options);
  };
}

module.exports.transform = wrap(wasm.transform.bind(wasm));
module.exports.transformStyleAttribute = wrap(wasm.transformStyleAttribute.bind(wasm));
module.exports.bundle = wrap(wasm.bundle.bind(wasm));
module.exports.bundleAsync = wrap(wasm.bundleAsync.bind(wasm));
module.exports.browserslistToTargets = require("./browserslistToTargets");
module.exports.composeVisitors = require("./composeVisitors");
module.exports.Features = require("./flags").Features;
