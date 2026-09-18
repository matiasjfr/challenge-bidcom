/**
 * Why a stock movement happened. The reason is a label: it does not decide the
 * direction of the movement, the sign of `quantity` does. That way a manual
 * adjustment can go both ways without needing an extra field.
 */
export enum MovementReason {
  /** A customer bought the variant. */
  PURCHASE = 'PURCHASE',
  /** A customer returned the variant. */
  RETURN = 'RETURN',
  /** New units arrived from the supplier. */
  RESTOCK = 'RESTOCK',
  /** Manual correction, for example after a physical count. */
  ADJUSTMENT = 'ADJUSTMENT',
}
