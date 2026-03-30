# Sitio

Sitio is an opinionated static site system built on Bun, Vite, Liquid, UnoCSS, and a small set of integrated conventions.

It is designed for people who want:
- a shared web toolchain for many sites
- minimal project setup inside each site folder
- HTML-first development with reusable components
- a system that is easy to teach, inspect, and fork

The core idea is simple:

Your actual site project can stay small and clean.
The build system, plugins, and conventions can live in one shared Sitio install somewhere else.

If you want a heavily customized setup, the intended path is to fork Sitio and maintain your own version.

## What Sitio Is For

Sitio is a good fit when you want:
- personal websites
- campaign or event sites
- brochure pages
- content-driven sites with YAML data
- static projects that still benefit from modern tooling

Sitio projects are intentionally meant to avoid having their own `package.json` and `node_modules` whenever possible.

## Requirements

- Bun

## Installation

### Global install from npm

```bash
bun i -g @ezequielschw/sitio
```

### Local clone + Bun link

```bash
git clone https://github.com/zequez/sitio
cd sitio
bun i
bun link
```

After that, run `sitio` inside any site folder.

## Quick Start

Create a folder like this:

```text
my-site/
  pages/
  components/
  data/
  images/
  public/
  lib/
```

Then run:

```bash
cd my-site
sitio
```

That starts the dev server.

If you want a starter `AGENTS.md` file in the current folder:

```bash
sitio init
```

## Site Folder Conventions

When Sitio runs, the current working directory is treated as the site root.

Sitio looks for these directories:
- `pages/`
- `components/`
- `data/`
- `images/`
- `public/`
- `lib/`

If `pages/` does not exist, Sitio treats the root folder itself as the page root.

## Commands

### Development

- `sitio`
  Starts dev mode. Same as `sitio dev`.
- `sitio dev`
  Starts the Vite dev server.
- `sitio dev --network-access`
- `sitio dev --na`
  Binds the dev server to `0.0.0.0` so it is reachable from other devices on the local network.

### Build and preview

- `sitio build`
  Builds the site into `www/`.
- `sitio preview`
  Serves the built `www/` folder as a static site.

### Publishing

- `sitio pu`
  Publishes the existing `www/` folder to Netlify.
- `sitio pub`
  Builds first, then publishes.

### Utilities

- `sitio init`
  Copies a starter `AGENTS.md` into the current folder.
- `sitio install`
  Installs the operating-system-level Sitio folder context menu integration.
- `sitio uninstall`
  Removes that context menu integration.

## How Pages Work

Pages are `.html` files processed through Liquid.

Rules:
- Sitio discovers pages recursively
- files and directories starting with `_` are ignored as page entrypoints
- nested pages are supported
- if `404.html` exists, it is used as the custom not-found page

In development, routes like these work:
- `/foo.html`
- `/foo`
- `/foo/`

In builds, HTML output is written into `www/`, and non-root pages become directory-style routes:
- `about.html` becomes `www/about/index.html`
- root `index.html` remains `www/index.html`

## Liquid Templates

Page HTML is rendered with [LiquidJS](https://liquidjs.com/).

Behavior:
- `pages/` is the main Liquid root
- page templates can `include` or `render` other templates from `pages/`
- components are resolved from `components/`

Available built-in Liquid filters:
- `markdown`
- `normal_srcset`
- `thumb_srcset`

Each page also receives:
- `page.path`

## Components

Put reusable HTML components in `components/`.

You can use them directly as HTML-like tags:

```html
<Layout title="Hello">...</Layout>
<MyButton />
```

Internally, Sitio rewrites them into Liquid component renders.

Component behavior:
- component names come from filenames
- nested component paths become dash-separated names
- child content is passed as `content`

### Built-in preset components

Sitio ships with a few preset components already available:
- `<StandardLayout>`
- `<Markdown>`
- `<ImgSet>`

## Data

Anything in `data/` with `.yml` or `.yaml` becomes available to Liquid.

Example:

```text
data/
  uno.yml
  dos.yml
  tres/
    bob.yml
    mike.yml
```

Becomes:

```liquid
{{ uno }}
{{ dos }}
{{ tres.bob }}
{{ tres.mike }}
```

## Images

Put source images in:
- `images/`

Sitio processes them into:
- `public/images/`

Behavior:
- uses Sharp
- outputs `.webp`
- generates multiple normal and thumbnail sizes
- does not copy the original source image
- regenerates changed images automatically
- removes stale generated outputs automatically

Generated image data is exposed to Liquid as:
- `images`
- `imagesSizes`

Low-quality preview variants are exposed as data URIs.
Higher-quality variants are exposed as `/images/...` URLs.

For responsive image output, use:
- `<ImgSet src="{{images.some_image}}" />`

## Markdown

Use the built-in `<Markdown>` component.

It renders Markdown using Bun’s native Markdown support and preserves embedded HTML blocks.

## Styling

Sitio uses UnoCSS with the Tailwind 4 preset.

Features:
- utility classes
- attributify mode
- web fonts through `fonts.yml`
- Font Awesome 7 solid and brand icon collections

Example UnoCSS usage:

```html
<div size-full bg-gray-500 text-white></div>
```

To include UnoCSS in page HTML:

```html
<link rel="stylesheet" href="virtual:uno.css" />
```

Sitio rewrites that into the form Vite expects.

## Icons

Font Awesome 7 icons are available through UnoCSS.

Examples:
- `i-fa-house`
- `i-fa-trash-can`
- `i-fa-brands-github`

## Fonts

Create a `fonts.yml` file in the site root.

Example:

```yml
sans: Arimo:400,700
serif: Andada Pro:400,700
mono: Fira Code:400,700
bitcount: Bitcount Grid Double Ink:400
```

Those font keys become available as UnoCSS font utilities:

```html
<div font-serif>Hey</div>
<div font-bitcount>Nice</div>
```

## `lib/` and Aliases

Use `lib/` for site-specific frontend code such as TypeScript, JavaScript, or Svelte entry files.

Available aliases:
- `/@lib`
  Resolves to the current site’s `lib/`
- `/@fonts`
  Resolves to generated local font assets

## Svelte Support

Sitio includes the Svelte Vite plugin.

That means a site can mount Svelte components from its own `lib/` code when needed.

## Public Files

Anything in `public/` is copied through as static output.

## Netlify Publishing

Publishing is currently set up for Netlify.

Relevant `.env` values:
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_ACCOUNT_ID`
- `NETLIFY_SITE_ID`

Behavior:
- if the auth token is missing, Sitio prompts for it and stores it
- if the account id is missing, Sitio fetches it and stores it
- if the site id is missing, Sitio creates a new Netlify site, deploys `www/`, and stores the id
- later publishes reuse the stored site id

The goal is simple folder-based deployment, without requiring each site owner to understand Git hosting workflows.

## Examples

See:
- `examples/`

There are examples for:
- icons
- fonts
- image processing
- landing pages
- Svelte-powered interactive tools

## Development Notes

Project progress is tracked here:

[TLDraw development board](https://www.tldraw.com/f/Nf8eEwBmFgqbnmYroa_w2?d=v-2956.101.2751.1616.page)

## License

Open source, copyleft, and intended to stay broadly shareable.

## AI Use

This project is actively developed with AI assistance.

That is not hidden and not treated as a purity problem.
The point is to move faster, reason at a higher level, and use the tools that help.

## Contributing

If you want to build on Sitio, the preferred model is:
- fork it
- shape it to your own practice
- share improvements if you want

Whether a change lands in this upstream repo matters less than whether your fork serves your users well.
