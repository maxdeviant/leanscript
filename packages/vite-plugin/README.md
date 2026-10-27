# @leanscript/vite-plugin

A [Vite](https://vite.dev) plugin that compiles Lean to JavaScript with [LeanScript](https://github.com/maxdeviant/leanscript), so that a page can load a `.lean` file as a module:

```html
<script type="module" src="./Main.lean"></script>
```

```js
// vite.config.js
import { defineConfig } from "vite";
import leanscript from "@leanscript/vite-plugin";

export default defineConfig({
  plugins: [leanscript()],
});
```

Each `.lean` file must be in a Lake workspace that requires LeanScript, with the same version as this plugin. The plugin compiles it with that workspace's `leanscript` executable, through `lake exe`, which builds the executable and the modules that the file imports as needed. The `compiler` option sets the path of a `leanscript` executable to use instead.

The dev server shows compile errors in its error overlay, and reloads the page when any `.lean` file changes.

[`leanscript-template-web`](https://github.com/maxdeviant/leanscript-template-web) is a template for apps that use the plugin.
