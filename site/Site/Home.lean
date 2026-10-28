import Site.Layout

namespace Site

open Ssg Html

def placeholderCode : String := "-- Lorem ipsum dolor sit amet.
def main : IO Unit := do
  IO.println \"Lorem ipsum\""

/-- A section's heading, with a small label above it. -/
def sectionHeading (label : String) (text : String) : Html :=
  div [cls "mb-6"] [
    p [cls "mb-2 font-mono text-xs font-semibold tracking-widest text-accent uppercase"] [label],
    h2 [cls "font-mono text-2xl font-bold tracking-tight"] [text]
  ]

def codeBlock (source : String) : Html :=
  pre [cls "overflow-x-auto rounded-sm border-l-4 border-highlight bg-code p-5 font-mono text-sm leading-relaxed text-on-code"] [
    code [] [source]
  ]

def feature (number : String) (heading : String) (description : String) : Html :=
  li [cls "border-t-2 border-ink pt-4"] [
    p [cls "mb-3 font-mono text-xs text-muted"] [number],
    h3 [cls "mb-2 font-mono font-semibold"] [heading],
    p [cls "text-sm leading-relaxed text-muted"] [description]
  ]

/--
A feature whose copy is still to be written. Bars stand in for its heading and description, under a
"Coming soon" banner.
-/
def comingSoon (number : String) : Html :=
  li [cls "relative border-t-2 border-ink pt-4"] [
    p [cls "mb-3 font-mono text-xs text-muted"] [number],
    div [cls "opacity-60", ("aria-hidden", "true")] [
      div [cls "mb-4 h-4 w-2/5 rounded-sm bg-rule"] [],
      div [cls "space-y-2.5"] [
        div [cls "h-2.5 rounded-sm bg-rule"] [],
        div [cls "h-2.5 rounded-sm bg-rule"] [],
        div [cls "h-2.5 w-11/12 rounded-sm bg-rule"] [],
        div [cls "h-2.5 w-3/5 rounded-sm bg-rule"] []
      ]
    ],
    div [cls "absolute inset-x-[-0.75rem] top-1/2 -translate-y-1/4 -rotate-3 caution-stripes py-1.5 text-center shadow-sm"] [
      span [cls "bg-highlight px-3 py-0.5 font-mono text-xs font-bold tracking-widest text-on-highlight uppercase"] [
        "Coming soon"
      ]
    ]
  ]

def home : Html :=
  layout "LeanScript" "Lorem ipsum dolor sit amet, consectetur adipiscing elit." [
    «section» [cls "py-20 sm:py-28"] [
      h1 [cls "mb-8 max-w-3xl font-mono text-4xl leading-tight font-bold tracking-tight sm:text-6xl"] [
        span [cls "bg-highlight px-2 text-on-highlight" ] ["Lean"],
        " into JavaScript"
      ],
      p [cls "mb-10 max-w-2xl text-lg leading-relaxed text-muted"] [
        "LeanScript compiles ",
        a [href "https://lean-lang.org/", cls "font-medium text-ink underline decoration-highlight decoration-2 underline-offset-4 hover:text-accent"] ["Lean"],
        " code into JavaScript.",
        " ",
        "Run your code in the browser, Node.js, Cloudflare Workers, or anywhere else you can run JavaScript."
      ],
      div [cls "flex flex-wrap gap-3 font-mono text-sm"] [
        a [href "#getting-started", cls "rounded-sm bg-ink px-5 py-2.5 font-semibold text-paper hover:bg-accent"] [
          "Get started"
        ],
        a [href repoUrl, cls "rounded-sm border border-ink px-5 py-2.5 font-semibold hover:border-accent hover:text-accent"] [
          "View on GitHub"
        ]
      ]
    ],
    «section» [cls "pb-20"] [
      ul [cls "grid gap-x-8 gap-y-10 sm:grid-cols-2"] [
        feature "01" "All the power of Lean"
          "LeanScript picks up where the Lean compiler leaves off, so your code is checked and optimized just as it is for a native build. Dependent types, proofs, and macros all work, and proofs are erased before any JavaScript is emitted.",
        comingSoon "02",
        comingSoon "03",
        comingSoon "04",
      ]
    ],
    «section» [cls "pb-20"] [
      sectionHeading "Lorem" "Ipsum dolor sit amet",
      codeBlock placeholderCode
    ],
    «section» [("id", "getting-started"), cls "pb-20"] [
      sectionHeading "Dolor" "Consectetur adipiscing",
      p [cls "mb-6 max-w-2xl leading-relaxed text-muted"] [
        "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque ",
        "laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis."
      ],
      codeBlock placeholderCode,
      p [cls "mt-6 max-w-2xl leading-relaxed text-muted"] [
        "Nemo enim ipsam voluptatem quia ",
        a [href repoUrl, cls "font-medium text-ink underline decoration-highlight decoration-2 underline-offset-4 hover:text-accent"] [
          "voluptas sit aspernatur"
        ],
        " aut odit aut fugit."
      ]
    ]
  ]

end Site
