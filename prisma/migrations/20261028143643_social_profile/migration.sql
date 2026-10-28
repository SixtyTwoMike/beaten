-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "passwordHash" TEXT,
    "image" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "emailVerifiedAt" DATETIME,
    "instagram" TEXT,
    "bluesky" TEXT,
    "avatarGameId" TEXT,
    "avatarSource" TEXT,
    "avatarX" REAL NOT NULL DEFAULT 50,
    "avatarY" REAL NOT NULL DEFAULT 50,
    "avatarZoom" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_avatarGameId_fkey" FOREIGN KEY ("avatarGameId") REFERENCES "Game" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "emailVerifiedAt", "id", "image", "name", "passwordHash", "tokenVersion", "username") SELECT "createdAt", "email", "emailVerifiedAt", "id", "image", "name", "passwordHash", "tokenVersion", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
