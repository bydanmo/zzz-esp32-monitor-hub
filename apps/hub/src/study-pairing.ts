import { timingSafeEqual } from "node:crypto";

/** Control is opt-in and paired; display-only device identification is separate. */
export function pairedStudyHello(raw: string, expected: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(expected)) return false;
  try {
    const message = JSON.parse(raw);
    const supplied = message?.device?.controlKey;
    return message.type === "hello" && typeof supplied === "string" && /^[0-9a-f]{64}$/.test(supplied) &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  } catch { return false; }
}
