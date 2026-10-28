-- CreateTable
CREATE TABLE "RaAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "raUsername" TEXT NOT NULL,
    "raUlid" TEXT,
    "lastSyncedAt" DATETIME,
    "lastAttemptAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RaAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RaAward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "raGameId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "awardedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "consoleId" INTEGER,
    "consoleName" TEXT,
    "iconPath" TEXT,
    "hardcore" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "igdbId" INTEGER,
    "matchConfidence" TEXT,
    "playLogId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RaAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RaAward_playLogId_fkey" FOREIGN KEY ("playLogId") REFERENCES "PlayLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RaAccount_userId_key" ON "RaAccount"("userId");

-- CreateIndex
CREATE INDEX "RaAward_userId_state_idx" ON "RaAward"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "RaAward_userId_raGameId_kind_key" ON "RaAward"("userId", "raGameId", "kind");
