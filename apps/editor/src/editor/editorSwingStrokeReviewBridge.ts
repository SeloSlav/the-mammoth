/**
 * FP swing stroke "review" step lives in {@link mountEditorScene}; React confirms/cancels via this bridge.
 */
type Api = { confirm: () => void; cancel: () => void };

let api: Api | null = null;

export function registerEditorSwingStrokeReview(next: Api | null): void {
  api = next;
}

export function confirmEditorSwingStrokeReview(): void {
  api?.confirm();
}

export function cancelEditorSwingStrokeReview(): void {
  api?.cancel();
}
