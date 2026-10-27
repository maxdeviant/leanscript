import Site.Layout

namespace Site

open Ssg Html

def workerExample : String := "import Js

open Std.Async
open Js.Fetch

/-- Responds to `req` with a greeting, echoing the body of a `POST` request. -/
def handle (req : Request) : Async Response := do
  let body ←
    if req.method == \"POST\" then
      pure s!\"Hello from Lean! You sent: {← req.text}\\n\"
    else
      pure s!\"Hello from Lean! You requested {req.url}\\n\"
  Response.new body { headers := #[(\"Content-Type\", \"text/plain; charset=utf-8\")] }

/-- The Worker's `fetch` handler. -/
@[export default.fetch]
def fetch (req : Request) (_env _ctx : JsValue) : BaseIO JsValue :=
  JsValue.ofAsync (handle req)"

def viteExample : String := "<script type=\"module\" src=\"./Main.lean\"></script>"

def sectionHeading (text : String) : Html :=
  h2 [cls "mb-4 text-2xl font-semibold tracking-tight"] [text]

def codeBlock (source : String) : Html :=
  pre [cls "overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm leading-relaxed text-slate-100 dark:ring-1 dark:ring-slate-800"] [
    code [] [source]
  ]

def feature (heading : String) (description : String) : Html :=
  li [cls "rounded-lg border border-slate-200 p-5 dark:border-slate-800"] [
    h3 [cls "mb-2 font-semibold"] [heading],
    p [cls "text-sm text-slate-600 dark:text-slate-400"] [description]
  ]

def home : Html :=
  layout "LeanScript: Lean to JavaScript" "LeanScript compiles Lean 4 programs to JavaScript." [
    «section» [cls "py-16 sm:py-24"] [
      h1 [cls "mb-6 text-4xl font-bold tracking-tight sm:text-5xl"] ["Lean to JavaScript"],
      p [cls "mb-8 max-w-2xl text-lg text-slate-600 dark:text-slate-400"] [
        "LeanScript compiles Lean 4 programs to JavaScript, so that you can run them in the browser, ",
        "on Node, and on Cloudflare Workers."
      ],
      div [cls "flex flex-wrap gap-3"] [
        a [href repoUrl, cls "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"] [
          "View on GitHub"
        ],
        a [href "#getting-started", cls "rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"] [
          "Get started"
        ]
      ]
    ],
    «section» [cls "pb-16"] [
      ul [cls "grid gap-4 sm:grid-cols-2"] [
        feature "Lean in the browser" "Use the DOM, events, and fetch from Lean, with bindings in the Js library.",
        feature "Workers and Node" "Compile a module to a library whose exports are your Lean functions.",
        feature "Vite plugin" "Load a .lean file as a module, with recompilation and error overlays in the dev server.",
        feature "Lake workspaces" "Programs import their modules from Lake packages, which LeanScript builds as needed."
      ]
    ],
    «section» [cls "pb-16"] [
      sectionHeading "A Cloudflare Worker in Lean",
      codeBlock workerExample
    ],
    «section» [("id", "getting-started"), cls "pb-16"] [
      sectionHeading "Getting started",
      p [cls "mb-4 text-slate-600 dark:text-slate-400"] [
        "Add ", code [cls "font-mono text-sm"] ["@leanscript/vite-plugin"],
        " to a Vite project in a Lake workspace that requires LeanScript, and load your Lean module from a page:"
      ],
      codeBlock viteExample,
      p [cls "mt-4 text-slate-600 dark:text-slate-400"] [
        "The ",
        a [href "https://github.com/maxdeviant/leanscript-template-web", cls "font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400"] [
          "web app template"
        ],
        " has everything set up."
      ]
    ]
  ]

end Site
