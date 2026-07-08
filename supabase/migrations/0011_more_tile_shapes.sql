-- ---------------------------------------------------------------------------
-- 0011_more_tile_shapes: two more interlocking tile silhouettes for premium —
-- a rounded-dome jigsaw ('interlock-round') and a triangular tab
-- ('interlock-chevron'). Widen the grids.tile_shape check to allow them.
-- ---------------------------------------------------------------------------

alter table public.grids drop constraint if exists grids_tile_shape_check;
alter table public.grids add constraint grids_tile_shape_check
  check (
    tile_shape in (
      'square',
      'interlock-sharp',
      'interlock-curved',
      'interlock-round',
      'interlock-chevron'
    )
  );
