# Sitio

Sitio just means "site" in Spanish.

Sitio is my personal web system builder; an opinionated teaching-oriented static site system
optimized for personal websites, community autonomy and learnable
infrastructure.

It's meant to be used as it is without configuration. An opinionated
preset with the latest web technology humming in harmony hidden behind a curtain.

One configuration for all your web projects.

If you want your own customization, you are meant to fork the repository and maintain your own.

If you want to use my personal preset for building websites, you can just install ~~`@ezequielschw/sitio`~~ (not yet, clone this repo and run `bun link`) and use the `sitio` utility.

Sitio projects are not meant to even have a `package.json` or a `node_modules` folder.
Just a blissfully clean folder with your project files, while the configuration for the
build system lives somewhere else on some far away folder, shared by all your projects.

If you want to install a library or have any customization at all, clone this project and modify it.

## Development

[Follow up development progress at my personal TLDraw dashboard.](https://www.tldraw.com/f/Nf8eEwBmFgqbnmYroa_w2?d=v-2956.101.2751.1616.page)

I've tried Kanban, and spreadsheets, and todo lists, and Jira, and Notion, and all the
project management tools under the sun, and you know what? I'm choose a TLDraw infinite canvas for this. It works for me, I love it, and that's sufficient.

And it's in Spanish, so also get a free programming-themed Spanish practice.

## Requirements

- Bun

## Installation

```
git clone https://github.com/zequez/sitio
cd sitio
bun i
bun link
```

Then run the `sitio` utility at any folder you want and you are set.

## Examples

At the `/examples` folder

## Features

### Commands

- `sitio` | `sitio dev`: runs the development server
- `sitio build`: builds the files
- `sitio preview`: starts a static server on the built files
- `sitio pu`: publishes the currently built files
- `sitio pub`: builds and then publishes the files

### Dev Server

- Uses Vite and plugins
- Every project is run at a deterministic port based on the pathname

### Pages

HTML files with sitio are processed with the [Liquid templating language](https://liquidjs.com/)

- If there is no `/pages` directory then it just takes `.html` files from the root
- At `/pages` you can put .html files
- Nested pages

### Liquid Components

- At `/components` you can put things like Layout.html and just use them anywhere like `<Layout title="Hi">Hey<Layout>` or `MyImage.html` and use `<MyImage/>` internally it just translates them to Liquid imports

#### Preset Components

There are preset components available by default:

  - `<StandardLayout></StandardLayout>`
  - `<Markdown></Markdown>`
  - `<ImgSet/>`


### Images

- At `/images` you can put images and they are procesed into `/public/images/<file>/<0|1|2|3|0_thumb|1_thumb|2_thumb>.webp`
- All images are available as Liquid data on the `images.<image_name>.<0,1,2,3,etc>` variable
- You can use `<ImgSrc src="{{images.<image_name>}}"/>` for optimized srcset images with a low quality image as dataURI that exists while the higher quality image loads
- `/examples/images`

### Markdown

- Just use the `<Markdown></Markdown>` component. It uses Bun-native `Bun.markdown`

### Atomic CSS

- Set up with UnoCSS with the Tailwind 4 preset
- Attributify mode you can do `<div size-full bg-gray-500 text-white text-50px></div>`

### Icons

- Icons preset with UnoCSS and Font Awesome 7 solid and brands
- Just use `<div i fa-user></div>`
- `/examples/icons`

### Fonts

- Create a `fonts.yml` file at the root of the project you are working on:

Example:
```
sans: Arimo:400,700
serif: Andada Pro:400,700
mono: Fira Code:400,700
bitcount: Bitcount Grid Double Ink:400
merriweather: Merriweather:400,700
```

- Provider is Google Fonts
- Fonts become available as UnoCSS utilities `<div font-serif>Hey</div><div font-bitcount>Nice</div>`
- `/examples/fonts`

### Data

- Anything `.yml` on the `/data` directory becomes available as a Liquid variable
- Subdirectories are merged as you would expect
- `/examples/data`


### Public

- Anything on the `/public` directory just gets copied as it is to the output

### Publishing

- Set up for Netlify
- Why not Github pages? Because I don't want clients to need to create a Github account or even know what a Github repository, or a branch, or a Git repo are. Netlify allows you to freely publish plain folders without Git. It's enough that they need to learn how to configure a domain name.
- The building is meant to be done in-situ and then shipped, no build process on a corporate server here (how did that became even a thing?)
- Extra points for leveraging free Patriarchal Empire corporate infrastructure for your own personal mission in service of Gaia (I'm just thumbing up to myself here)

## License

It's open source free software copyleft creative commons available for free for every person on Gaia.

## AI Use

I received a free month of ChatGPT Codex for VSCode, and I've been using it shamelessly, and
it's been a blast. I love having this super smart robot helper that can work out the implementation
details of anything I have in mind. And it can also asses bugs I find and solve them. It's great. I'm no purist. I notice that now I can just go faster, and I focus on higher level architectural. It amplifies my power. Gone  are the days of scouring the web for documentation details on how to use a library correctly.

## Contribution

If you want to contribute code, clone it and make your own fork. Then just share it with me as you
would share this new cool thing you made, and if I like your cool thing I will celebrate it and maybe implement it into this repo also.

But wether I integrate it here or not, it does not matter, if you are a learned programmer you are meant to maintain your own fork of sitio, and your non-technical clients are meant to use your version, not mine, they trust you, not me, you are responsible for what your clients run on their computer.