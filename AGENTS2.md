# Sitio Project Guide

This file describes the features available to any project directory where the `sitio` CLI is executed.

The intended audience is:
- humans starting a new `sitio` site
- AI coding agents working inside a `sitio` project

## Runtime Model

When `sitio` runs, the current working directory is treated as the site root.

Sitio looks for these directories inside that work directory:
- `pages/`
- `components/`
- `data/`
- `images/`
- `public/`
- `lib/`

If `pages/` does not exist, the work directory itself is treated as the pages root.

## Commands

Available CLI commands:
- `sitio`
  Starts dev mode. This is the same as `sitio dev`.
- `sitio dev`
  Starts the Vite dev server for the current site.
- `sitio build`
  Builds the site into `www/`.
- `sitio preview`
  Serves the generated `www/` directory as a static site.
- `sitio pub`
  Builds the site and publishes it to Netlify.
- `sitio pu`
  Publishes the existing `www/` directory to Netlify.

## Output

Build output goes to:
- `www/`

HTML output is directory-style:
- `about.html` becomes `/about/index.html`
- root `index.html` remains `www/index.html`

## Pages

Pages are discovered from `pages/` recursively:
- only `.html` files are treated as pages
- files and directories starting with `_` are ignored for page entrypoints

These page routes work in development:
- `/foo.html`
- `/foo`
- `/foo/`

If a `404.html` page exists, it is used as the custom not-found page.

## Liquid Templates

Page HTML is processed as Liquid before Vite serves or builds it.

Liquid behavior:
- `pages/` is the main Liquid root
- pages can `include` or `render` other page templates from `pages/`
- component templates are resolved from `components/`

Built-in Liquid filters:
- `markdown`
  Renders Markdown to HTML while preserving embedded HTML blocks
- `normal_srcset`
  Builds a normal-image `srcset` from an image object in `images`
- `thumb_srcset`
  Builds a thumbnail-image `srcset` from an image object in `images`

Each page also receives:
- `page.path`
  The path of the current page relative to `pages/`

## Components

`components/` contains reusable HTML Liquid components.

Components are used from page/component HTML as custom tags and are converted into Liquid `render` calls automatically.

Examples:
- `<Layout title="Hello">...</Layout>`
- `<MyButton />`

Current component behavior:
- component names come from file paths in `components/`
- nested component paths become dash-separated names
- components can be used from Liquid as `component-<name>`
- child content is passed into components as `content`

There is also a preset components directory bundled with Sitio itself for framework-level reusable components.

## Data

YAML files in `data/` become Liquid data automatically.

Examples:
- `data/uno.yml` becomes `uno`
- `data/dos.yml` becomes `dos`
- `data/tres/bob.yml` becomes `tres.bob`
- `data/tres/mike.yml` becomes `tres.mike`

Files are parsed recursively and exposed as nested objects based on folder structure.

## Images

Source images live in:
- `images/`

Generated optimized images are written to:
- `public/images/`

Image pipeline behavior:
- source images are processed with Sharp
- output format is `.webp`
- multiple sizes are generated automatically
- original source files are not copied to `public/images/`
- missing generated files are created on startup/build
- stale generated files are removed automatically
- source image changes trigger regeneration

Current generated size keys:
- `0`
- `1`
- `2`
- `3`
- `4`
- `thumb_0`
- `thumb_1`
- `thumb_2`

Quality behavior:
- keys ending in `_0` are low-quality preview variants
- thumbnail keys starting with `thumb_` are square crops using Sharp entropy positioning

Generated image data is exposed to Liquid as:
- `images`
- `imagesSizes`

`images` mirrors the folder structure under `public/images/`.

Low-quality preview variants are exposed as data URIs.
Higher-quality variants are exposed as `/images/...` URLs.

## Styling and Assets

Sitio uses UnoCSS in Vite.

Projects can include UnoCSS in page HTML by using:

```html
<link rel="stylesheet" href="virtual:uno.css" />
```

Sitio rewrites that into the import form Vite expects.

Available styling-related features:
- UnoCSS utility classes
- attributify preset
- web fonts from `fonts.yml`
- local font asset caching
- Font Awesome 7 solid icons under the `fa` collection
- Font Awesome 7 brands icons under the `fa-brands` collection

Examples:
- `i-fa-house`
- `i-fa-trash-can`
- `i-fa-brands-github`

## Aliases

Available aliases from the site root:
- `/@lib`
  Resolves to `<workDir>/lib`
- `/@fonts`
  Resolves to the generated local font assets cache used by UnoCSS

Use `lib/` for project-specific TypeScript or JavaScript modules imported by the site.

## Svelte Support

Sitio includes the Svelte Vite plugin.

This means a site can use Svelte components and Svelte entry code from its own project files, typically from `lib/` or other imported modules.

## Dev Server Behavior

In dev mode, Sitio automatically watches and reacts to changes in:
- page templates
- component templates
- YAML data files
- generated image output
- `fonts.yml`

Depending on the kind of change, Sitio triggers either:
- a browser full reload
- a server restart
- an asset/data regeneration step

## Netlify Publishing

Publishing uses Netlify's API and stores state in the site's `.env`.

Relevant values:
- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_ACCOUNT_ID`
- `NETLIFY_SITE_ID`

Behavior:
- if `.env` or `NETLIFY_AUTH_TOKEN` is missing, Sitio prompts for it and stores it
- if `NETLIFY_ACCOUNT_ID` is missing, Sitio fetches it from the auth token and stores it
- if `NETLIFY_SITE_ID` is missing, Sitio creates a new Netlify site, deploys `www/`, and stores the resulting site id
- later publishes reuse the stored site id

## Practical Conventions

Recommended project structure:

```text
my-site/
  pages/
  components/
  data/
  images/
  public/
  lib/
  fonts.yml
  .env
```

Recommended usage:
- keep route entry pages in `pages/`
- keep reusable view fragments in `components/`
- keep structured site content in YAML inside `data/`
- keep project scripts and browser modules in `lib/`
- keep original source images in `images/`
- let Sitio generate optimized outputs into `public/images/`

## Notes for Agents

When working inside a Sitio project:
- assume the current working directory is the site root
- prefer using Liquid pages/components over ad-hoc HTML duplication
- treat `data/` as the source of structured content
- treat `images` Liquid data as generated output from the image pipeline
- prefer UnoCSS utility classes for styling
- prefer Font Awesome 7 icon utilities through UnoCSS icon classes
