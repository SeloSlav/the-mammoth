import { z } from "zod";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  OwnedApartmentBuiltinsDocSchema,
  type OwnedApartmentBuiltinsDoc,
} from "./ownedApartmentBuiltins.js";

const APARTMENT_UNIT_KEY_RE = /^[a-zA-Z0-9_.-]+\|\d+\|[a-zA-Z0-9_.-]+$/u;
const PROFILE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/u;

export const ApartmentUnitLayoutProfileSchema = z.object({
  id: z.string().min(1).max(80).regex(PROFILE_ID_RE),
  name: z.string().min(1).max(120),
  layout: OwnedApartmentBuiltinsDocSchema,
});

export type ApartmentUnitLayoutProfile = z.infer<
  typeof ApartmentUnitLayoutProfileSchema
>;

export const ApartmentUnitLayoutAssignmentSchema = z.object({
  /** Server `ApartmentUnit.unit_key`, e.g. `floor_mamutica_typical|18|unit_e_004`. */
  unitKey: z.string().min(1).max(180).regex(APARTMENT_UNIT_KEY_RE),
  profileId: z.string().min(1).max(80).regex(PROFILE_ID_RE),
});

export type ApartmentUnitLayoutAssignment = z.infer<
  typeof ApartmentUnitLayoutAssignmentSchema
>;

export const ApartmentUnitLayoutProfilesDocSchema = z
  .object({
    version: z.literal(1),
    profiles: z.array(ApartmentUnitLayoutProfileSchema).default([]),
    assignments: z.array(ApartmentUnitLayoutAssignmentSchema).default([]),
  })
  .transform((doc) => {
    const seenProfiles = new Set<string>();
    const profiles: ApartmentUnitLayoutProfile[] = [];
    for (const profile of doc.profiles) {
      if (seenProfiles.has(profile.id)) continue;
      seenProfiles.add(profile.id);
      profiles.push(profile);
    }

    const knownProfiles = new Set(profiles.map((p) => p.id));
    const seenAssignments = new Set<string>();
    const assignments: ApartmentUnitLayoutAssignment[] = [];
    for (const assignment of doc.assignments) {
      if (!knownProfiles.has(assignment.profileId)) continue;
      if (seenAssignments.has(assignment.unitKey)) continue;
      seenAssignments.add(assignment.unitKey);
      assignments.push(assignment);
    }

    return { ...doc, profiles, assignments };
  });

export type ApartmentUnitLayoutProfilesDoc = z.infer<
  typeof ApartmentUnitLayoutProfilesDocSchema
>;

export const DEFAULT_APARTMENT_UNIT_LAYOUT_PROFILES_DOC: ApartmentUnitLayoutProfilesDoc =
  ApartmentUnitLayoutProfilesDocSchema.parse({
    version: 1,
    profiles: [],
    assignments: [],
  });

export function apartmentUnitLayoutProfileIdForUnitKey(
  doc: ApartmentUnitLayoutProfilesDoc | null | undefined,
  unitKey: string,
): string | null {
  return doc?.assignments.find((a) => a.unitKey === unitKey)?.profileId ?? null;
}

export function apartmentUnitLayoutProfileForUnitKey(
  doc: ApartmentUnitLayoutProfilesDoc | null | undefined,
  unitKey: string,
): ApartmentUnitLayoutProfile | null {
  const profileId = apartmentUnitLayoutProfileIdForUnitKey(doc, unitKey);
  if (!profileId) return null;
  return doc?.profiles.find((p) => p.id === profileId) ?? null;
}

export function apartmentLayoutDocForUnitKey(
  profilesDoc: ApartmentUnitLayoutProfilesDoc | null | undefined,
  unitKey: string,
  ownedDefault: OwnedApartmentBuiltinsDoc | null | undefined,
): OwnedApartmentBuiltinsDoc | null {
  return (
    apartmentUnitLayoutProfileForUnitKey(profilesDoc, unitKey)?.layout ??
    ownedDefault ??
    null
  );
}

export function createApartmentUnitLayoutProfile(
  doc: ApartmentUnitLayoutProfilesDoc,
  input: {
    id: string;
    name: string;
    layout?: OwnedApartmentBuiltinsDoc;
  },
): ApartmentUnitLayoutProfilesDoc {
  return ApartmentUnitLayoutProfilesDocSchema.parse({
    ...doc,
    profiles: [
      ...doc.profiles,
      {
        id: input.id,
        name: input.name,
        layout: input.layout ?? DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      },
    ],
  });
}

export function assignApartmentUnitLayoutProfile(
  doc: ApartmentUnitLayoutProfilesDoc,
  unitKey: string,
  profileId: string,
): ApartmentUnitLayoutProfilesDoc {
  return ApartmentUnitLayoutProfilesDocSchema.parse({
    ...doc,
    assignments: [
      ...doc.assignments.filter((a) => a.unitKey !== unitKey),
      { unitKey, profileId },
    ],
  });
}
