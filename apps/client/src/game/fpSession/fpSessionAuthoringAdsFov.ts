/** True while the in-game FP viewmodel tool is in Aim (ADS) pose — main RAF snaps combat FOV. */
let authoringAdsFovPreview = false;

export function isFpAuthoringAdsFovPreview(): boolean {
  return authoringAdsFovPreview;
}

export function setFpAuthoringAdsFovPreview(active: boolean): void {
  authoringAdsFovPreview = active;
}

export function resetFpAuthoringAdsFovPreview(): void {
  authoringAdsFovPreview = false;
}
