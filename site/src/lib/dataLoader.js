// Loads every JSON file in site/data/labor/ by pattern, so adding a file there
// needs no change here. These are the only data files the site may read.
const modules = import.meta.glob('../../data/labor/*.json', { eager: true });

export const raw = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [
    path.split('/').pop().replace(/\.json$/, ''),
    mod.default,
  ])
);

export const files = Object.keys(raw).sort();

// Scene 3 is the only scene backed by two files.
export const bySceneId = {
  1: raw.scene1_plants,
  2: raw.scene2_floor,
  3: { workforce: raw.scene3_workforce_by_year, posts: raw.scene3_posts_by_year },
  4: raw.scene4_pay_model,
  5: raw.scene5_hearings,
};

export function assertDataLoaded() {
  const missing = Object.entries(bySceneId)
    .filter(([, value]) =>
      value == null || Object.values(value).some((v) => v == null)
    )
    .map(([id]) => `scene ${id}`);

  if (missing.length) {
    throw new Error(
      `Missing data for ${missing.join(', ')}. Found in site/data/labor/: ${
        files.join(', ') || '(nothing)'
      }`
    );
  }
}
