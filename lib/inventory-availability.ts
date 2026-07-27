export function inventoryNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function calculateAvailable(
  input?: {
    onHand?: unknown;
    reserved?: unknown;
    hold?: unknown;
  } | null,
) {
  return Math.max(
    inventoryNumber(input?.onHand) -
      inventoryNumber(input?.reserved) -
      inventoryNumber(input?.hold),
    0,
  );
}

export function inventoryPosition(
  input?: {
    onHand?: unknown;
    reserved?: unknown;
    hold?: unknown;
    incoming?: unknown;
    inTransit?: unknown;
  } | null,
) {
  const onHand = inventoryNumber(input?.onHand);
  const reserved = inventoryNumber(input?.reserved);
  const hold = inventoryNumber(input?.hold);
  return {
    onHand,
    reserved,
    hold,
    available: calculateAvailable({ onHand, reserved, hold }),
    incoming: inventoryNumber(input?.incoming),
    inTransit: inventoryNumber(input?.inTransit),
  };
}
