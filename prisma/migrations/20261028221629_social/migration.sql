-- AlterTable
ALTER TABLE "User" ADD COLUMN "followersSeenAt" DATETIME;

-- CreateTable
CREATE TABLE "Follow" (
    "followerId" TEXT NOT NULL,
    "followeeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("followerId", "followeeId"),
    CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Follow_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Block" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("blockerId", "blockedId"),
    CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playLogId" TEXT NOT NULL,
    "backfill" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Activity_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Activity_playLogId_fkey" FOREIGN KEY ("playLogId") REFERENCES "PlayLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "startedPrecision" TEXT,
    "finishedAt" DATETIME,
    "finishedPrecision" TEXT,
    "stoppedAt" DATETIME,
    "stoppedPrecision" TEXT,
    "notReturning" BOOLEAN NOT NULL DEFAULT false,
    "isReplay" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,
    "reviewText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "containsSpoilers" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PlayLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayLog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlayLog" ("createdAt", "finishedAt", "finishedPrecision", "gameId", "id", "isReplay", "notReturning", "platformId", "rating", "reviewText", "startedAt", "startedPrecision", "status", "stoppedAt", "stoppedPrecision", "updatedAt", "userId") SELECT "createdAt", "finishedAt", "finishedPrecision", "gameId", "id", "isReplay", "notReturning", "platformId", "rating", "reviewText", "startedAt", "startedPrecision", "status", "stoppedAt", "stoppedPrecision", "updatedAt", "userId" FROM "PlayLog";
DROP TABLE "PlayLog";
ALTER TABLE "new_PlayLog" RENAME TO "PlayLog";
CREATE INDEX "PlayLog_userId_finishedAt_idx" ON "PlayLog"("userId", "finishedAt");
CREATE INDEX "PlayLog_userId_status_idx" ON "PlayLog"("userId", "status");
CREATE INDEX "PlayLog_gameId_userId_idx" ON "PlayLog"("gameId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Follow_followeeId_createdAt_idx" ON "Follow"("followeeId", "createdAt");

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");

-- CreateIndex
CREATE INDEX "Activity_actorId_createdAt_idx" ON "Activity"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_playLogId_idx" ON "Activity"("playLogId");
