# Sitio

Sitio is an opinionated teaching-oriented static site system
optimized for personal websites, community autonomy and learnable
infrastructure.

## Sitio projects architecture

```
my-site
│
├ pages
│   ├ index.html
│   └ about.html
│
├ components
│   ├ Layout.html
│   └ Button.svelte
│
├ public
│   ├ icon.png
│   └ style.css
│
└ out
```

## Running

There are 4 commands:

```
bunx sitio init
bunx sitio dev
bunx sitio build
bunx sitio publish
```

## Featuring

### Layout using frontmatter

```
---
layout: default
---

<div>Hello world</div>
```

### UnoCSS with Tailwind 4 preset, attributify and Iconify with Font Awesome 6

```
---
layout: default
---

<h1 class="bg-green-500">Hey this is green</h1>
<p flex-cc bg="red-500" h-20 text="white 3xl">Esto es un sitio web</p>
<div class="i-fa-user text-2xl"></div>
```

### Automatic components importing

Just add a Svelte component to /components and you can embed it; no imports.

```
my-site
│
├ pages
│   └ index.html
│
└components
    └ my-component.svelte
```

```
---
layout: default
---

<my-component></my-component>
```