import Site.Layout

namespace Site

open Ssg Html

/-- The version of LeanScript that the getting started steps use. -/
def leanscriptVersion : String := "0.1.0"

def workerExample : String :=
  (include_str "../../examples/worker/Worker.lean").trimAsciiEnd.toString

def lakefileStep : String := s!"[[require]]
name = \"leanscript\"
git = \"https://github.com/maxdeviant/leanscript\"
rev = \"v{leanscriptVersion}\""

def installStep : String := s!"pnpm add -D @leanscript/vite-plugin@{leanscriptVersion} vite"

def viteConfigStep : String := "import { defineConfig } from \"vite\";
import leanscript from \"@leanscript/vite-plugin\";

export default defineConfig({
  plugins: [leanscript()],
});"

def indexHtmlStep : String := "<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <title>My app</title>
  </head>
  <body>
    <div id=\"app\"></div>
    <script type=\"module\" src=\"./Main.lean\"></script>
  </body>
</html>"

def mainStep : String := "import Js

open Js.Dom

def main : IO Unit := do
  let some app ← (← document).getElementById \"app\" | return
  app.setTextContent \"Hello from Lean!\""

/-- A section's heading, with a small label above it. -/
def sectionHeading (label : String) (text : String) : Html :=
  div [cls "mb-6"] [
    p [cls "mb-2 font-mono text-xs font-semibold tracking-widest text-accent uppercase"] [label],
    h2 [cls "font-mono text-2xl font-bold tracking-tight"] [text]
  ]

/-- A block of `source` in `language`, with the name of its file on a tab above it, if it has one. -/
def codeBlock (source : String) (language := "lean") (fileName : Option String := none) : Html :=
  let preCls := "overflow-x-auto rounded-sm bg-code p-5 font-mono text-sm leading-relaxed text-on-code"
  match fileName with
  | some name =>
    div [] [
      p [cls "w-fit rounded-t-sm bg-highlight px-3 py-1 font-mono text-xs font-semibold text-on-highlight"] [name],
      pre [cls s!"{preCls} rounded-tl-none"] [sourceCode language source]
    ]
  | none => pre [cls preCls] [sourceCode language source]

/-- A numbered step of a guide, with the code for it. -/
def step (number : String) (heading : String) (fileName : String) (language : String) (source : String) :
    Html :=
  li [] [
    h3 [cls "mb-3 font-mono font-semibold"] [span [cls "mr-3 text-muted"] [number], heading],
    codeBlock source language fileName
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

/-- The home page's card, with the headline from the top of the page. -/
def homeCard : Card where
  name := "home"
  alt := "LeanScript: Lean into JavaScript"
  svg := cardFrame (footerStart := "leanscript.org") [
    -- IBM Plex Mono's characters are 0.6 em wide, so "Lean" is 192 wide at this size, and the
    -- rest of the headline starts a character after its highlight. SVG drops the leading space.
    -- The highlight slants 9 degrees, like the italics, so its top is 16 to the right of its
    -- bottom.
    .element "polygon" [("points", "96,212 320,212 304,312 80,312"), ("fill", highlight)] [],
    monoText 100 288 80 700 onHighlight "Lean" (italic := true),
    monoText 352 288 80 700 ink "into JavaScript",
    sansLines 80 380 30 46 muted [
      "LeanScript compiles Lean code into JavaScript.",
      "Run your code in the browser, Node.js, Cloudflare Workers,",
      "or anywhere else you can run JavaScript."
    ]
  ]

def home (ctx : Context) : Html :=
  layout ctx "LeanScript" "LeanScript compiles Lean code into JavaScript that runs in the browser, Node.js, Cloudflare Workers, or anywhere else you can run JavaScript." "/" homeCard [
    «section» [cls "py-20 sm:py-28"] [
      h1 [cls "mb-8 max-w-3xl font-mono text-4xl leading-tight font-bold tracking-tight sm:text-6xl"] [
        -- The highlight is slanted like IBM Plex Mono's italics, which slant 9 degrees.
        span [cls "relative z-0 px-3 text-on-highlight italic before:absolute before:inset-0 before:-z-10 before:-skew-x-9 before:bg-highlight"] ["Lean"],
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
      ul [cls "grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2"] [
        feature "01" "All the power of Lean"
          "LeanScript picks up where the Lean compiler leaves off, so your code is checked and optimized just as it is for a native build. Dependent types, proofs, and macros all work, and proofs are erased before any JavaScript is emitted.",
        comingSoon "02",
        comingSoon "03",
        comingSoon "04",
      ]
    ],
    «section» [cls "pb-20"] [
      sectionHeading "Example 01" "Lean in Cloudflare Workers",
      p [cls "mb-6 max-w-2xl leading-relaxed text-muted"] [
        "Deploy your Lean code to Cloudflare's global edge network with ",
        a [href "https://www.cloudflare.com/products/workers/", cls "font-medium text-ink underline decoration-highlight decoration-2 underline-offset-4 hover:text-accent"] [
          "Cloudflare Workers"
        ],
        "."
      ],
      codeBlock workerExample (fileName := "Worker.lean")
    ],
    «section» [("id", "getting-started"), cls "pb-20"] [
      sectionHeading "Getting started" "Set up LeanScript in your project",
      p [cls "mb-6 max-w-2xl leading-relaxed text-muted"] [
        "LeanScript fits into your existing Lean project and JavaScript package manager.",
      ],
      ol [cls "grid grid-cols-1 gap-8"] [
        step "1" "Require LeanScript in your Lake package" "lakefile.toml" "toml" lakefileStep,
        step "2" "Install the Vite plugin" "Terminal" "bash" installStep,
        step "3" "Add the plugin to your Vite config" "vite.config.js" "javascript" viteConfigStep,
        step "4" "Load a Lean file on your page" "index.html" "html" indexHtmlStep,
        step "5" "Write some Lean" "Main.lean" "lean" mainStep
      ],
      p [cls "mt-8 max-w-2xl leading-relaxed text-muted"] [
        "Check out the ",
        a [href "https://github.com/maxdeviant/leanscript-template-web", cls "font-mono font-medium text-ink underline decoration-highlight decoration-2 underline-offset-4 hover:text-accent"] [
          "leanscript-template-web"
        ],
        " repository for a full example."
      ]
    ]
  ]

end Site
