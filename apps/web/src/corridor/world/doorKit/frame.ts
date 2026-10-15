/** Joinery around an opening, in metres. */
export const FRAME = {
  /** Timber lining inside the opening, each side and at the head. */
  lining: 0.035,
  /** Width of the architrave moulding around the opening. */
  architrave: 0.1,
  /** How deep the wall is behind the opening: the leaf sits at the bottom of this reveal. */
  reveal: 0.22,
  /** The leaf face sits this far behind the wall plane. */
  leafSetback: 0.1,
} as const;

/** The plaster fill overlaps the architrave's outer edge so a bake cannot open a raster seam. */
export const WALL_OVERLAP = 0.09;
