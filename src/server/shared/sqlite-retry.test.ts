import { describe, expect, it } from "vitest";
import { isSqliteBusyError } from "./sqlite-retry";

describe("isSqliteBusyError", () => {
  it("распознаёт типичные сообщения блокировки", () => {
    expect(isSqliteBusyError(new Error("database is locked (5)"))).toBe(true);
    expect(isSqliteBusyError(new Error("SQLITE_BUSY"))).toBe(true);
    expect(isSqliteBusyError(new Error("unique constraint"))).toBe(false);
  });
});
