# Todo list

A todo list web app written in Lean. You can add items, check them off, remove them, and clear the completed ones.

The app is `App.lean`, which `index.html` loads directly, as `<script type="module" src="./App.lean">`. The LeanScript Vite plugin, which `vite.config.js` adds, compiles it for the browser. The app builds the list with the DOM bindings in `Js.Dom`, and handles the clicks on every item with one listener on the list.

## Running

Build LeanScript first, by running `lake build` in the repository root. Then:

```sh
pnpm install
pnpm dev
```

The dev server recompiles `App.lean` and reloads the page when you edit it, and shows compile errors in its error overlay.

`pnpm build` builds the app into `dist/`, and `pnpm preview` serves the build.

## Limitations

The plugin compiles each `.lean` file on its own, so the app can import the `Js` library, and the Lean standard library, but not other Lean modules of its own.
