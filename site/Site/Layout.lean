import Ssg

namespace Site

open Ssg Html

def repoUrl : String := "https://github.com/maxdeviant/leanscript"

/-- Wraps `content` in the markup that every page shares. -/
def layout (pageTitle : String) (description : String) (content : List Html) : Html :=
  html [("lang", "en")] [
    head [] [
      «meta» [("charset", "utf-8")],
      «meta» [("name", "viewport"), ("content", "width=device-width, initial-scale=1")],
      «meta» [("name", "description"), ("content", description)],
      title [] [pageTitle],
      link [("rel", "icon"), ("href", "/favicon.svg"), ("type", "image/svg+xml")],
      link [("rel", "stylesheet"), ("href", "/style.css")]
    ],
    body [cls "bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"] [
      div [cls "mx-auto flex min-h-screen max-w-3xl flex-col px-4 sm:px-6"] [
        header [cls "flex items-center justify-between py-6"] [
          a [href "/", cls "font-mono text-lg font-bold tracking-tight"] ["leanscript"],
          nav [cls "flex gap-6 text-sm text-slate-600 dark:text-slate-400"] [
            a [href repoUrl, cls "hover:text-slate-900 dark:hover:text-white"] ["GitHub"]
          ]
        ],
        main [cls "flex-1"] content,
        footer [cls "border-t border-slate-200 py-8 text-sm text-slate-500 dark:border-slate-800"] [
          "Built with Lean, and released under the MIT license."
        ]
      ]
    ]
  ]

end Site
