# Cloudflare Worker

A minimal [Cloudflare Worker](https://developers.cloudflare.com/workers/) written in Lean. It greets `GET` requests, and echoes the body of `POST` requests.

The Lean module, `Worker.lean`, compiles to a library whose default export is an object with the Worker's `fetch` handler, as Workers expect: `@[export default.fetch]` makes `fetch` a property of the default export.

## Running

Build LeanScript first, by running `lake build` in the repository root. Then:

```sh
pnpm install
pnpm dev
```

Wrangler compiles `Worker.lean` before it starts. Then:

```sh
curl http://localhost:8787/
curl -X POST --data 'hi there' http://localhost:8787/
```

`pnpm run deploy` deploys the Worker to your Cloudflare account.
