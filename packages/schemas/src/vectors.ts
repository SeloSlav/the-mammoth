import { z } from "zod";

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export type Vec3 = z.infer<typeof Vec3Schema>;

/** XYZW quaternion (Three.js order). */
export const QuatSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export type Quat = z.infer<typeof QuatSchema>;
