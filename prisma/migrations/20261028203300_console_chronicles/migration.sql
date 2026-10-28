-- CreateTable
CREATE TABLE "Chronicle" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "birthYear" INTEGER,
    "showAges" BOOLEAN NOT NULL DEFAULT true,
    "accent" TEXT NOT NULL DEFAULT 'mint',
    "background" TEXT NOT NULL DEFAULT 'glow',
    "path" TEXT NOT NULL DEFAULT 'dotted',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Chronicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChronicleEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platformId" INTEGER NOT NULL,
    "model" TEXT,
    "gotAt" DATETIME NOT NULL,
    "gotPrecision" TEXT,
    "age" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChronicleEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Chronicle" ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChronicleGame" (
    "entryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "gameId" TEXT NOT NULL,

    PRIMARY KEY ("entryId", "position"),
    CONSTRAINT "ChronicleGame_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ChronicleEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChronicleGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChronicleEntry_userId_gotAt_idx" ON "ChronicleEntry"("userId", "gotAt");
