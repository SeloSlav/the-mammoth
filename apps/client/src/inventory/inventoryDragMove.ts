/** Server `quantity_to_move`: 0 means move the entire stack. */
export function inventoryReducerQuantityArg(dragQuantity: number, stackQuantity: number): number {
  return dragQuantity < stackQuantity ? dragQuantity : 0;
}
