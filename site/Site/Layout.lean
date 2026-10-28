import Site.Card

namespace Site

open Ssg Html

def repoUrl : String := "https://github.com/maxdeviant/leanscript"

/-- The URL of the site, for the links that have to be absolute, without a trailing slash. -/
def siteUrl : String := "https://leanscript.org"

def fontsUrl : String :=
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap"

/-- The site's name, with its mark. -/
def logo : Html :=
  a [href "/", cls "flex items-center gap-2 font-mono text-lg font-bold tracking-tight"] [
    mark [cls "size-7", ("aria-hidden", "true")],
    "LeanScript"
  ]

/--
Applies the theme that the theme switcher saved, if any. It runs in the `head`, so that the page
doesn't flash the system's theme first.
-/
def applySavedTheme : String := "try {
  const theme = localStorage.getItem(\"theme\");
  if (theme === \"light\" || theme === \"dark\") {
    document.documentElement.dataset.theme = theme;
  }
} catch {}"

/--
Shows the theme switcher, which is hidden without JavaScript, and switches between the light and
dark themes on clicks. Choosing the system's theme clears the saved theme, so that the page follows
the system again.
-/
def setUpThemeSwitcher : String := "const root = document.documentElement;
const systemDark = matchMedia(\"(prefers-color-scheme: dark)\");
const switcher = document.getElementById(\"theme-switcher\");
switcher.hidden = false;
switcher.addEventListener(\"click\", () => {
  const system = systemDark.matches ? \"dark\" : \"light\";
  const theme = (root.dataset.theme ?? system) === \"dark\" ? \"light\" : \"dark\";
  if (theme === system) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  try {
    if (theme === system) {
      localStorage.removeItem(\"theme\");
    } else {
      localStorage.setItem(\"theme\", theme);
    }
  } catch {}
});"

def sunIcon : String :=
  "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41\"/></svg>"

def moonIcon : String :=
  "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z\"/></svg>"

/-- A button that switches between the light and dark themes, which shows the theme it switches to. -/
def themeSwitcher : Html :=
  button [("id", "theme-switcher"), ("type", "button"), ("aria-label", "Switch theme"),
      ("title", "Switch theme"), ("hidden", ""), cls "grid size-8 place-items-center rounded-sm hover:text-accent"] [
    span [cls "dark:hidden"] [.raw moonIcon],
    span [cls "hidden dark:block"] [.raw sunIcon]
  ]

/-- A strip of caution tape across the top of the page, which says that LeanScript is experimental. -/
def experimentalNotice : Html :=
  div [cls "caution-stripes px-4 py-1.5 text-center"] [
    p [cls "inline-block bg-highlight px-3 py-0.5 font-mono text-xs text-on-highlight"] [
      strong [cls "block font-bold tracking-widest uppercase sm:inline"] ["Experimental"],
      span [cls "hidden sm:inline"] [" · "],
      "Expect bugs and breaking changes"
    ]
  ]

/-- What the pages need to know about the build, which isn't known until the site is built. -/
structure Context where
  /-- The URL of the stylesheet, which changes whenever its content does. -/
  stylesheet : String

/--
Wraps `content` in the markup that every page shares. `path` is the page's URL, relative to the
site, such as `/coverage/`, and `card` is the image that represents it when it's shared.
-/
def layout (ctx : Context) (pageTitle : String) (description : String) (path : String) (card : Card)
    (content : List Html) : Html :=
  html [("lang", "en")] [
    head [] [
      «meta» [("charset", "utf-8")],
      «meta» [("name", "viewport"), ("content", "width=device-width, initial-scale=1")],
      «meta» [("name", "description"), ("content", description)],
      title [] [pageTitle],
      «meta» [("property", "og:type"), ("content", "website")],
      «meta» [("property", "og:site_name"), ("content", "LeanScript")],
      «meta» [("property", "og:title"), ("content", pageTitle)],
      «meta» [("property", "og:description"), ("content", description)],
      «meta» [("property", "og:url"), ("content", siteUrl ++ path)],
      «meta» [("property", "og:image"), ("content", s!"{siteUrl}/{card.image.path}")],
      «meta» [("property", "og:image:width"), ("content", toString Card.width)],
      «meta» [("property", "og:image:height"), ("content", toString Card.height)],
      «meta» [("property", "og:image:alt"), ("content", card.alt)],
      «meta» [("name", "twitter:card"), ("content", "summary_large_image")],
      script [] [.raw applySavedTheme],
      link [("rel", "icon"), ("href", "/favicon.svg"), ("type", "image/svg+xml")],
      link [("rel", "preconnect"), ("href", "https://fonts.googleapis.com")],
      link [("rel", "preconnect"), ("href", "https://fonts.gstatic.com"), ("crossorigin", "")],
      link [("rel", "stylesheet"), ("href", fontsUrl)],
      link [("rel", "stylesheet"), ("href", ctx.stylesheet)]
    ],
    body [cls "bg-paper font-sans text-ink antialiased selection:bg-highlight selection:text-on-highlight"] [
      experimentalNotice,
      div [cls "mx-auto flex min-h-screen max-w-4xl flex-col px-4 sm:px-8"] [
        header [cls "flex items-center justify-between border-b border-rule py-5"] [
          logo,
          nav [cls "flex items-center gap-4 font-mono text-sm text-muted"] [
            a [href "/coverage/", cls "hover:text-accent"] ["Coverage"],
            a [href repoUrl, cls "hover:text-accent"] ["GitHub"],
            themeSwitcher
          ]
        ],
        main [cls "flex-1"] content,
        footer [cls "flex flex-col gap-2 border-t border-rule py-8 font-mono text-xs text-muted sm:flex-row sm:justify-between"] [
          p [] [
            "Nerd-sniped by ",
            a [href "https://bsky.app/profile/tonofcrates.bsky.social/post/3my3zodphxk2k", cls "hover:text-accent"] ["Will Crichton"],
            "."
          ],
          p [] [
            "Released under the ",
            a [href s!"{repoUrl}/blob/main/LICENSE", cls "hover:text-accent"] ["MIT License"],
            ". © 2026 ",
            a [href "https://maxdeviant.com", cls "hover:text-accent"] ["Marshall Bowers"],
            "."
          ]
        ]
      ],
      script [] [.raw setUpThemeSwitcher]
    ]
  ]

end Site
