-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlayLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "platformId" INTEGER,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "stoppedAt" DATETIME,
    "notReturning" BOOLEAN NOT NULL DEFAULT false,
    "isReplay" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,
    "reviewText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayLog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlayLog" ("createdAt", "finishedAt", "gameId", "id", "isReplay", "platformId", "rating", "reviewText", "startedAt", "status", "updatedAt", "userId") SELECT "createdAt", "finishedAt", "gameId", "id", "isReplay", "platformId", "rating", "reviewText", "startedAt", "status", "updatedAt", "userId" FROM "PlayLog";
DROP TABLE "PlayLog";
ALTER TABLE "new_PlayLog" RENAME TO "PlayLog";
CREATE INDEX "PlayLog_userId_finishedAt_idx" ON "PlayLog"("userId", "finishedAt");
CREATE INDEX "PlayLog_userId_status_idx" ON "PlayLog"("userId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
