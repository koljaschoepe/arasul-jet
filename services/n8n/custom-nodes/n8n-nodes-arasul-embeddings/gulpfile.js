const { src, dest } = require('gulp');

/**
 * Gulp task to copy icon files to dist directory
 * n8n custom nodes can include SVG icons for visual identification
 */
function buildIcons() {
  return src('nodes/**/*.{png,svg}')
    .pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;
