import {
  MELEE_WEAPON_SWING_DEFAULT_STEM_GROUPS,
  meleeWeaponSwingOverrideStemPair,
} from "./meleeSwingSound";

type ResolveStem = (stem: string) => Promise<string | null>;
type DecodeMany = (ctx: AudioContext, urls: readonly string[]) => Promise<AudioBuffer[]>;

/**
 * Decode melee swing buffers per profile: profile 0 from default/legacy stem groups; profiles 1+
 * from optional `weapon-melee-swing-p{n}` pair when both files exist.
 */
export async function loadMeleeWeaponSwingBuffersByProfile(
  ctx: AudioContext,
  resolveStem: ResolveStem,
  decodeMany: DecodeMany,
): Promise<Map<number, AudioBuffer[]>> {
  const map = new Map<number, AudioBuffer[]>();

  for (const group of MELEE_WEAPON_SWING_DEFAULT_STEM_GROUPS) {
    const urls: string[] = [];
    for (const stem of group) {
      const u = await resolveStem(stem);
      if (!u) {
        urls.length = 0;
        break;
      }
      urls.push(u);
    }
    if (urls.length === group.length) {
      const buffers = await decodeMany(ctx, urls);
      if (buffers.length === group.length) {
        map.set(0, buffers);
        break;
      }
    }
  }

  for (let profileId = 1; profileId <= 8; profileId++) {
    const pair = meleeWeaponSwingOverrideStemPair(profileId);
    if (!pair) continue;
    const a = await resolveStem(pair[0]);
    const b = await resolveStem(pair[1]);
    if (!a || !b) continue;
    const buffers = await decodeMany(ctx, [a, b]);
    if (buffers.length === 2) {
      map.set(profileId, buffers);
    }
  }

  return map;
}
