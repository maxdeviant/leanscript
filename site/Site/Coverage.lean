import Site.Layout

namespace Site

open Ssg Html

/-- A target of the runtime, by its ID in the coverage data, and its name. -/
structure Target where
  id : String
  label : String

def runtimeTargets : List Target := [⟨"node", "Node"⟩, ⟨"browser", "Browser"⟩]

/-- The libraries whose externs make up the standard library. -/
def libraries : List String := ["Init", "Std", "Lean"]

/-- An extern of the standard library, and the IDs of the targets whose runtime implements it. -/
structure Extern where
  name : String
  module : String
  targets : List String

namespace Extern

def library (e : Extern) : String :=
  (e.module.splitOn ".").headD ""

/-- The name of `e`, without the `_private.<module>.0.` prefix of a private declaration. -/
def userName (e : Extern) : String :=
  match e.name.splitOn "." with
  | "_private" :: rest => ".".intercalate ((rest.dropWhile (· != "0")).drop 1)
  | _ => e.name

/-- The namespace of `e`, or the empty string for a top-level name. -/
def ns (e : Extern) : String :=
  ".".intercalate (e.userName.splitOn ".").dropLast

/-- Whether every target, some targets, or no target implements `e`. -/
def status (e : Extern) : String :=
  if e.targets.length == runtimeTargets.length then "all"
  else if e.targets.isEmpty then "none"
  else "some"

def statusLabel (e : Extern) : String :=
  match e.status with
  | "all" => "every target"
  | "none" => "no target"
  | _ =>
    let labels := runtimeTargets.filter (e.targets.contains ·.id) |>.map (·.label)
    s!"{", ".intercalate labels} only"

end Extern

/-- The coverage data that `scripts/stdlib-coverage.js` writes. -/
structure Coverage where
  toolchain : String := ""
  /-- The date that the data was generated, such as `2026-10-28`. -/
  generated : String := ""
  externs : Array Extern := #[]
  /-- Externs that the runtime implements, but that aren't externs in the toolchain. -/
  stale : Array String := #[]

def Coverage.parse (data : String) : Coverage :=
  (data.splitOn "\n").foldl (init := {}) fun coverage line =>
    if let some toolchain := line.dropPrefix? "# toolchain " then
      { coverage with toolchain := toolchain.toString }
    else if let some generated := line.dropPrefix? "# generated " then
      { coverage with generated := generated.toString }
    else if line.isEmpty || line.startsWith "#" then
      coverage
    else
      match line.splitOn "\t" with
      | [name, "", _] => { coverage with stale := coverage.stale.push name }
      | [name, module, ids] =>
        let targets := if ids.isEmpty then [] else ids.splitOn ","
        { coverage with externs := coverage.externs.push { name, module, targets } }
      | _ => coverage

def coverage : Coverage :=
  .parse (include_str "../data/stdlib-coverage.tsv")

/-- The number of `externs` that `target` implements. -/
def count (externs : Array Extern) (target : Target) : Nat :=
  (externs.filter (·.targets.contains target.id)).size

/-- `n` as a percentage of `total`, to one decimal place. -/
def percent (n total : Nat) : String :=
  if total == 0 then "0.0"
  else
    let tenths := (n * 1000 + total / 2) / total
    s!"{tenths / 10}.{tenths % 10}"

def statusColor : String → String
  | "all" => "bg-covered"
  | "some" => "bg-highlight"
  | _ => "bg-rule"

def bar (n total : Nat) : Html :=
  div [cls "h-2 overflow-hidden rounded-full bg-rule", ("role", "img"), ("aria-label", s!"{percent n total}%")] [
    div [cls "h-full bg-covered", ("style", s!"width: {percent n total}%")] []
  ]

def summaryRow (label : String) (externs : Array Extern) (total := false) : Html :=
  tr [cls (if total then "border-t-2 border-ink font-semibold" else "border-t border-rule")] (
    th [("scope", "row"), cls "py-3 pr-6 text-left font-mono"] [label] ::
    runtimeTargets.map fun target =>
      let n := count externs target
      td [cls "py-3 pr-6"] [
        div [cls "grid grid-cols-[minmax(5rem,1fr)_3.5rem_5.5rem] items-center gap-3 tabular-nums"] [
          bar n externs.size,
          span [cls "text-right"] [s!"{percent n externs.size}%"],
          span [cls "text-sm font-normal text-muted"] [s!"{n} / {externs.size}"]
        ]
      ])

def summaryTable (externs : Array Extern) : Html :=
  div [cls "overflow-x-auto"] [
    table [cls "w-full min-w-lg border-collapse"] [
      thead [] [
        tr [cls "font-mono text-xs tracking-widest text-muted uppercase"] (
          th [("scope", "col"), cls "pb-2 text-left font-normal"] ["Library"] ::
          runtimeTargets.map fun target => th [("scope", "col"), cls "pb-2 text-left font-normal"] [target.label])
      ],
      tbody [] (
        libraries.map (fun library => summaryRow library (externs.filter (·.library == library))) ++
        [summaryRow "Total" externs (total := true)])
    ]
  ]

/-- A square for `e`, colored by its status, which the filter matches by `data-name`. -/
def cell (e : Extern) : Html :=
  i [cls s!"size-3 rounded-[2px] {statusColor e.status}", ("title", s!"{e.userName}: {e.statusLabel}"),
    ("data-name", e.userName.toLower)] []

def legend : Html :=
  div [cls "flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted"] (
    [("all", "Every target"), ("some", "Some targets"), ("none", "Not implemented")].map fun (status, label) =>
      span [cls "inline-flex items-center gap-1.5"] [
        i [cls s!"inline-block size-3 rounded-[2px] {statusColor status}"] [],
        label
      ])

/-- `externs` grouped by namespace, with the largest namespaces first. -/
def byNamespace (externs : Array Extern) : Array (String × Array Extern) :=
  let sorted := externs.qsort fun a b => a.ns < b.ns || (a.ns == b.ns && a.name < b.name)
  let groups := sorted.foldl (init := (#[] : Array (String × Array Extern))) fun groups e =>
    match groups.back? with
    | some (ns, es) => if ns == e.ns then groups.pop.push (ns, es.push e) else groups.push (e.ns, #[e])
    | none => #[(e.ns, #[e])]
  groups.qsort fun (a, x) (b, y) => x.size > y.size || (x.size == y.size && a < b)

def namespaceBlock (ns : String) (externs : Array Extern) : Html :=
  let missing := externs.filter (·.status != "all")
  div [cls "grid min-w-0 gap-2 border-t border-rule py-3", ("data-namespace", "")] [
    div [cls "flex flex-wrap justify-between gap-x-4 gap-y-1"] [
      code [cls "font-mono text-sm font-semibold break-all"] [if ns.isEmpty then "(top level)" else ns],
      span [cls "flex gap-3 font-mono text-xs text-muted tabular-nums"] (runtimeTargets.map fun target =>
        span [] [s!"{target.label} {count externs target}/{externs.size}"])
    ],
    div [cls "flex flex-wrap gap-[3px]"] (externs.toList.map cell),
    if missing.isEmpty then .fragment []
    else
      details [] [
        summary [cls "cursor-pointer font-mono text-xs text-accent"] [s!"{missing.size} not on every target"],
        ul [cls "mt-2 columns-2xs gap-6"] (missing.toList.map fun e =>
          li [cls "break-inside-avoid py-px break-all"] [
            code [cls "font-mono text-xs"] [e.userName],
            " ",
            span [cls "text-xs text-muted"] [e.statusLabel]
          ])
      ]
  ]

def libraryHeading (heading : String) (note : String) : Html :=
  h2 [cls "mb-3 flex flex-wrap items-baseline gap-x-3 font-mono text-xl font-bold"] [
    heading,
    span [cls "text-sm font-normal text-muted"] [note]
  ]

def librarySection (library : String) (externs : Array Extern) : Html :=
  let externs := externs.filter (·.library == library)
  let note := " · ".intercalate (runtimeTargets.map fun target => s!"{target.label} {count externs target}/{externs.size}")
  «section» [cls "mt-12"] (libraryHeading library note :: (byNamespace externs).toList.map fun (ns, es) =>
    namespaceBlock ns es)

def staleSection (coverage : Coverage) : Html :=
  «section» [cls "mt-12 pb-20"] [
    libraryHeading "Not externs in this toolchain" (toString coverage.stale.size),
    p [cls "mb-3 max-w-2xl text-sm leading-relaxed text-muted"] [
      s!"The runtime implements these, but no program compiled with {coverage.toolchain} can call them, because the toolchain has no extern by that name."
    ],
    details [] [
      summary [cls "cursor-pointer font-mono text-xs text-accent"] [s!"Show {coverage.stale.size} names"],
      ul [cls "mt-2 columns-2xs gap-6"] (coverage.stale.toList.map fun (name : String) =>
        li [cls "break-inside-avoid py-px break-all"] [code [cls "font-mono text-xs"] [name]])
    ]
  ]

/-- Dims the squares whose names don't contain the filter's text, and hides namespaces without any. -/
def filterScript : String := "
const filter = document.getElementById(\"coverage-filter\");
filter.addEventListener(\"input\", () => {
  const query = filter.value.trim().toLowerCase();
  for (const ns of document.querySelectorAll(\"[data-namespace]\")) {
    let any = false;
    for (const cell of ns.querySelectorAll(\"[data-name]\")) {
      const match = !query || cell.dataset.name.includes(query);
      cell.classList.toggle(\"opacity-15\", !match);
      any ||= match;
    }
    ns.hidden = !any;
  }
});
"

def coveragePage : Html :=
  layout "Standard library coverage · LeanScript"
    "How much of Lean's standard library the LeanScript runtime implements, on each target." ([
      «section» [cls "pt-16 pb-10"] [
        h1 [cls "mb-3 font-mono text-3xl font-bold tracking-tight sm:text-4xl"] ["Standard library coverage"],
        p [cls "mb-6 font-mono text-xs text-muted"] [s!"{coverage.toolchain} · generated {coverage.generated}"],
        p [cls "max-w-2xl leading-relaxed text-muted"] [
          s!"Of the {coverage.externs.size} externs in ",
          code [cls "font-mono text-sm"] ["Init"], ", ",
          code [cls "font-mono text-sm"] ["Std"], ", and ",
          code [cls "font-mono text-sm"] ["Lean"],
          " that a program can call, these are the ones that the runtime implements on each target. Externs that a Lean declaration implements through ",
          code [cls "font-mono text-sm"] ["@[export]"],
          " aren't counted, since the compiler calls that declaration instead."
        ]
      ],
      summaryTable coverage.externs,
      div [cls "mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"] [
        legend,
        input [("type", "search"), ("id", "coverage-filter"), ("placeholder", "Filter by name"),
          ("aria-label", "Filter externs by name"),
          cls "w-full max-w-72 rounded-sm border border-rule bg-paper px-3 py-1.5 font-mono text-sm focus-visible:outline-2 focus-visible:outline-accent"]
      ]
    ] ++ libraries.map (librarySection · coverage.externs) ++ [
      staleSection coverage,
      script [] [.raw filterScript]
    ])

end Site
