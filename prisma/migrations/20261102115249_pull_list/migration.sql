-- AlterTable
ALTER TABLE "Game" ADD COLUMN "genres" TEXT;
ALTER TABLE "Game" ADD COLUMN "releaseDate" DATETIME;

-- AlterTable
ALTER TABLE "SteamAccount" ADD COLUMN "wishlistSyncedAt" DATETIME;

-- CreateTable
CREATE TABLE "PullItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PullItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PullItem_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PullItem_userId_position_idx" ON "PullItem"("userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PullItem_userId_gameId_key" ON "PullItem"("userId", "gameId");
