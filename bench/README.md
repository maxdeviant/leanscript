# Benchmarks

`pnpm bench` builds the compiler, then compiles each program in `programs/` natively, for Node, and for the browser, and
reports the median time of each on native Lean, Node, and Chrome, with how much slower each JS
target is than native. It also checks that each JS target prints what the native program prints.
See the comment at the top of `run.js` for what each time measures, and for its options.

To see whether a change helps, save the results before it, and compare against them after:

```sh
pnpm bench --json before.json
# ...make the change...
pnpm bench --compare before.json
```

The sizes in the `.args` files are chosen so that each program runs for about a tenth of a second
natively, which keeps a full run to a few minutes.

Chrome is driven by `playwright-core`, which doesn't download a browser, so the harness looks for
one on the `PATH`, or at `$CHROME_PATH`. `--targets native,node` skips it.

## Programs

Apart from `hello`, which measures the fixed cost of starting a program, the programs are copied
unchanged from [`tests/compile_bench`](https://github.com/leanprover/lean4/tree/v4.35.0/tests/compile_bench)
in Lean 4.35.0, the suite that Lean's own benchmarks track. They are under the Apache 2.0 license, in
`programs/LICENSE`. Changes from the originals:

- `binarytrees.st.lean` is renamed `binarytrees_st.lean`, and `liasolver.lean.ex-50-50-1.leq` is
  renamed `liasolver.leq`.
- The sizes they run at are smaller than those of Lean's suite.

Lean's `binarytrees` is left out, as it builds its trees in parallel natively, which LeanScript
can't do. `binarytrees_st` does the same work on one thread.
