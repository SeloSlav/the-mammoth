/**
 * Marks thin BoxGeometry placeholders that should contribute **horizontal** FP blocker collision
 * (owned-apartment partition slabs + interior-doc placement blockouts).
 *
 * Static baked collision (`GENERATED_COLLISION_BLOCKER_AABBS`) does not include these runtime meshes —
 * the client samples world AABBs from tagged meshes each resolve step (small sets).
 */
export const MAMMOTH_FP_INTERIOR_PARTITION_SOLID = "mammothFpInteriorPartitionSolid" as const;
