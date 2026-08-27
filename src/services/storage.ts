// Persistance locale des projets (IndexedDB).
// Les projets restent sur le poste de l'utilisateur ; seuls les extraits
// nécessaires à l'analyse transitent par le Worker vers OpenRouter.

import { openDB, type IDBPDatabase } from "idb";
import type { Project } from "../state/model";

const DB_NAME = "kastor";
const STORE = "projects";

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore(STORE, { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function saveProject(project: Project): Promise<void> {
  await (await db()).put(STORE, project);
}

export async function loadProjects(): Promise<Project[]> {
  const all = (await (await db()).getAll(STORE)) as Project[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
}
