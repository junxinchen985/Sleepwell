function fitStarfield(width, height) {
  const scale = Math.min(width / 390, height / 844);
  const imageWidth = 390 * scale;
  const imageHeight = 844 * scale;
  return `left:${(width-imageWidth)/2}px;top:${(height-imageHeight)/2}px;width:${imageWidth}px;height:${imageHeight}px;`;
}

module.exports = { fitStarfield };
