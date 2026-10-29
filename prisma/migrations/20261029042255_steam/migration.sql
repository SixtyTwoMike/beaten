-- CreateTable
CREATE TABLE "SteamAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "personaName" TEXT,
    "avatarUrl" TEXT,
    "lastSyncedAt" DATETIME,
    "lastAttemptAt" DATETIME,
    "privateLibrary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SteamAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SteamGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "appId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "playtimeMinutes" INTEGER NOT NULL,
    "lastPlayedAt" DATETIME,
    "hasStats" BOOLEAN NOT NULL DEFAULT false,
    "achTotal" INTEGER,
    "achUnlocked" INTEGER,
    "firstUnlockAt" DATETIME,
    "lastUnlockAt" DATETIME,
    "statsCheckedAt" DATETIME,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "matchCheckedAt" DATETIME,
    "igdbId" INTEGER,
    "matchName" TEXT,
    "matchCoverUrl" TEXT,
    "matchYear" INTEGER,
    "importedStatus" TEXT,
    "playLogId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SteamGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SteamGame_playLogId_fkey" FOREIGN KEY ("playLogId") REFERENCES "PlayLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SteamAccount_userId_key" ON "SteamAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SteamAccount_steamId_key" ON "SteamAccount"("steamId");

-- CreateIndex
CREATE INDEX "SteamGame_userId_state_idx" ON "SteamGame"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "SteamGame_userId_appId_key" ON "SteamGame"("userId", "appId");
