-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "platformId" INTEGER NOT NULL,
    "region" TEXT,
    "completeness" TEXT,
    "edition" TEXT,
    "itemCondition" INTEGER,
    "boxCondition" INTEGER,
    "manualCondition" INTEGER,
    "acquiredAt" DATETIME,
    "acquiredPrecision" TEXT,
    "pricePaid" INTEGER,
    "currency" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollectionItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollectionItem_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "pendingUsername" TEXT,
    "usernameChangedAt" DATETIME,
    "name" TEXT,
    "passwordHash" TEXT,
    "image" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "emailVerifiedAt" DATETIME,
    "suspendedAt" DATETIME,
    "collectionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "collectionPublic" BOOLEAN NOT NULL DEFAULT false,
    "instagram" TEXT,
    "bluesky" TEXT,
    "avatarGameId" TEXT,
    "avatarSource" TEXT,
    "avatarX" REAL NOT NULL DEFAULT 50,
    "avatarY" REAL NOT NULL DEFAULT 50,
    "avatarZoom" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifyComments" TEXT NOT NULL DEFAULT 'instant',
    "notifyReactions" TEXT NOT NULL DEFAULT 'daily',
    "followersSeenAt" DATETIME,
    CONSTRAINT "User_avatarGameId_fkey" FOREIGN KEY ("avatarGameId") REFERENCES "Game" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarGameId", "avatarSource", "avatarX", "avatarY", "avatarZoom", "bluesky", "createdAt", "email", "emailVerifiedAt", "followersSeenAt", "id", "image", "instagram", "name", "notifyComments", "notifyReactions", "passwordHash", "pendingUsername", "suspendedAt", "tokenVersion", "username", "usernameChangedAt") SELECT "avatarGameId", "avatarSource", "avatarX", "avatarY", "avatarZoom", "bluesky", "createdAt", "email", "emailVerifiedAt", "followersSeenAt", "id", "image", "instagram", "name", "notifyComments", "notifyReactions", "passwordHash", "pendingUsername", "suspendedAt", "tokenVersion", "username", "usernameChangedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CollectionItem_userId_platformId_idx" ON "CollectionItem"("userId", "platformId");

-- CreateIndex
CREATE INDEX "CollectionItem_userId_gameId_idx" ON "CollectionItem"("userId", "gameId");
