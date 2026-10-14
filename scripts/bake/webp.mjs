/** Preserve the dark transfer curve while bounding atlas download size. */
export function webpArgs(input, output) {
  return ['-lossless', '-near_lossless', '80', '-z', '9', input, '-o', output];
}
