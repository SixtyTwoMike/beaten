-- AlterTable
ALTER TABLE "SteamGame" ADD COLUMN "beatenUnlockAt" DATETIME;
ALTER TABLE "SteamGame" ADD COLUMN "unlockedAchievements" TEXT;

-- CreateTable
CREATE TABLE "BeatenAchievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "externalGameId" TEXT NOT NULL,
    "igdbId" INTEGER,
    "achievementKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BeatenAchievementVote" (
    "achievementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("achievementId", "userId"),
    CONSTRAINT "BeatenAchievementVote_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "BeatenAchievement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BeatenAchievementVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BeatenAchievement_provider_externalGameId_idx" ON "BeatenAchievement"("provider", "externalGameId");

-- CreateIndex
CREATE INDEX "BeatenAchievement_igdbId_idx" ON "BeatenAchievement"("igdbId");

-- CreateIndex
CREATE UNIQUE INDEX "BeatenAchievement_provider_externalGameId_achievementKey_key" ON "BeatenAchievement"("provider", "externalGameId", "achievementKey");

-- CreateIndex
CREATE INDEX "BeatenAchievementVote_userId_idx" ON "BeatenAchievementVote"("userId");

-- CreateIndex
CREATE INDEX "SteamGame_appId_idx" ON "SteamGame"("appId");
