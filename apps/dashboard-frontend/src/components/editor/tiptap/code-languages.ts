/**
 * Curated lowlight language imports for syntax highlighting.
 * Only 12 common languages to keep bundle size small on Jetson.
 */

import { common, createLowlight } from 'lowlight';

// common includes: bash, c, cpp, csharp, css, diff, go, graphql, ini,
// java, javascript, json, kotlin, less, lua, makefile, markdown,
// objectivec, perl, php, python, r, ruby, rust, scss, shell, sql,
// swift, typescript, vbnet, wasm, xml, yaml

export const lowlight = createLowlight(common);
