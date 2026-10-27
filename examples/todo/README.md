# Todo list

A todo list web app written in Lean. You can add items, check them off, remove them, and clear the completed ones.

The app is a Lake package, which requires LeanScript for its `Js` library:

- `Todo/Model.lean` has the app's state, and the updates to it.
- `Todo/View.lean` renders the state with the DOM bindings in `Js.Dom`.
- `App.lean` is the entry point, which handles the page's events. It handles the clicks on every item with one listener on the list.

`index.html` loads `App.lean` directly, as `<script type="module" src="./App.lean">`. The LeanScript Vite plugin, which `vite.config.js` adds, compiles it for the browser, and the compiler builds the modules it imports with Lake.

## Running

Build LeanScript first, by running `lake build` in the repository root. Then:

```sh
pnpm install
pnpm dev
```

The dev server recompiles the app and reloads the page when you edit any of its Lean files, and shows compile errors in its error overlay.

`pnpm build` builds the app into `dist/`, and `pnpm preview` serves the build.
