# Reference image assets

**These files are not in the repository yet.** Nothing has been attached to the
project, and `public/` currently contains only `favicon.svg` and `robots.txt`.
Drop the images in here with the exact filenames below and the world will pick
them up — no code change needed.

The code treats every one of these as optional. A missing file degrades to the
existing procedural visual rather than showing a broken texture, so the site is
never broken by an absent asset.

## Required files

| Filename | Where it is used | Notes |
| --- | --- | --- |
| `void-creation.jpg` | Opening sequence, while the world assembles | Wants a dark centre so the emerging point of light reads against it |
| `neural-city.jpg` | Liquid-metal city district | Architecture / neural-pathway art direction |
| `liquid-metal.jpg` | Assembly and disassembly transitions | Chrome / flowing metal surface |

## Format

- **JPG or WebP**, sRGB
- **Long edge 2048px** is plenty; larger costs GPU memory for no visible gain
- Keep the **native aspect ratio** — the shaders letterbox rather than stretch,
  so an odd ratio will letterbox rather than distort
- Under ~400 KB each if possible; these decode on the main thread

## How they get used

Not as full-bleed backgrounds. Each is sampled into the 3D world as:

- a fogged, parallaxed depth layer sitting behind the geometry
- a texture on holographic panels and project surfaces
- masked and displaced during transitions, so the image itself dissolves

They reveal progressively across the journey rather than all at once, and never
cover the reading column.

## If you have differently-named files

Rename them to match the table, or tell me the real filenames and I will point
the loader at them.
