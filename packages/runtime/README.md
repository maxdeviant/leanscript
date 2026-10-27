# @leanscript/runtime

The JavaScript runtime for programs compiled from Lean with [LeanScript](https://github.com/maxdeviant/leanscript).

Every compiled program imports this package, so a project that runs compiled programs depends on it, unless a bundler plugin such as [`@leanscript/vite-plugin`](https://www.npmjs.com/package/@leanscript/vite-plugin) provides it.

Its version must be the version of the LeanScript compiler that compiled the program. A program that runs on a runtime of another version throws an error when it loads.

The runtime has an implementation for browsers, and other runtimes with web APIs, such as Cloudflare Workers, and one for Node, which the `browser` and `node` export conditions select.
