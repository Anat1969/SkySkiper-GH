// Local persistence. Replaces the BASE44 entities with the same shape
// described in entities/Project.json and entities/SavedTypology.json.
const KEY = 'mass-studio:v1';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { projects: [], typologies: [] };
  } catch {
    return { projects: [], typologies: [] };
  }
}

function writeAll(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or full storage — the app keeps working in memory */
  }
}

export const listProjects = () => readAll().projects;
export const listTypologies = () => readAll().typologies;

export function saveProject(project) {
  const state = readAll();
  const i = state.projects.findIndex((p) => p.id === project.id);
  const row = { ...project, updated: Date.now() };
  if (i >= 0) state.projects[i] = row;
  else state.projects.unshift(row);
  writeAll(state);
  return row;
}

export function deleteProject(id) {
  const state = readAll();
  state.projects = state.projects.filter((p) => p.id !== id);
  writeAll(state);
}

export function saveTypology(t) {
  const state = readAll();
  state.typologies.unshift({ ...t, id: newId(), updated: Date.now() });
  writeAll(state);
}

export const newId = () => Math.random().toString(36).slice(2, 10);
