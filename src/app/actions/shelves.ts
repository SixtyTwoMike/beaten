"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ensureGame } from "@/lib/games";
import { requireUserId } from "@/lib/session";
import type { ActionResult } from "./logs";

export async function createShelf(
  name: string,
  description?: string | null
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Shelf name is required" };
    if (trimmed.length > 60) {
      return { ok: false, error: "Shelf name must be 60 characters or fewer" };
    }
    const existing = await prisma.shelf.findUnique({
      where: { userId_name: { userId, name: trimmed } },
    });
    if (existing) return { ok: false, error: "You already have a shelf with that name" };
    await prisma.shelf.create({
      data: { userId, name: trimmed, description: description?.trim() || null },
    });
    revalidatePath("/shelves");
    return { ok: true };
  } catch (e) {
    console.error("createShelf failed:", e);
    return { ok: false, error: "Something went wrong creating the shelf" };
  }
}

export async function deleteShelf(shelfId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const shelf = await prisma.shelf.findUnique({ where: { id: shelfId } });
    if (!shelf || shelf.userId !== userId) {
      return { ok: false, error: "Shelf not found" };
    }
    await prisma.shelf.delete({ where: { id: shelfId } });
    revalidatePath("/shelves");
    return { ok: true };
  } catch (e) {
    console.error("deleteShelf failed:", e);
    return { ok: false, error: "Something went wrong deleting the shelf" };
  }
}

export async function addGameToShelf(
  shelfId: string,
  igdbId: number
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const shelf = await prisma.shelf.findUnique({ where: { id: shelfId } });
    if (!shelf || shelf.userId !== userId) {
      return { ok: false, error: "Shelf not found" };
    }
    const game = await ensureGame(igdbId);
    await prisma.shelfItem.upsert({
      where: { shelfId_gameId: { shelfId, gameId: game.id } },
      update: {},
      create: { shelfId, gameId: game.id },
    });
    revalidatePath("/shelves");
    revalidatePath(`/shelves/${shelfId}`);
    return { ok: true };
  } catch (e) {
    console.error("addGameToShelf failed:", e);
    return { ok: false, error: "Something went wrong adding to the shelf" };
  }
}

export async function removeGameFromShelf(
  shelfId: string,
  gameId: string
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const shelf = await prisma.shelf.findUnique({ where: { id: shelfId } });
    if (!shelf || shelf.userId !== userId) {
      return { ok: false, error: "Shelf not found" };
    }
    await prisma.shelfItem.deleteMany({ where: { shelfId, gameId } });
    revalidatePath("/shelves");
    revalidatePath(`/shelves/${shelfId}`);
    return { ok: true };
  } catch (e) {
    console.error("removeGameFromShelf failed:", e);
    return { ok: false, error: "Something went wrong removing from the shelf" };
  }
}
