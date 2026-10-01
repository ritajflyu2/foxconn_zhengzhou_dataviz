import { select } from 'd3';
import factoryUrl from '../../../design/reference/factory_exploded.png';

const FACTORY_IMG = { w: 996, h: 1395 };

// Site-level chrome, not scene content: shows where the Labor page sits in the
// building. `root` is the always-present #floor-nav-slot element; sceneManager
// shows/hides it per scene by toggling a class on the shared page grid, so
// this module never needs to know which scene is active.
export function mountFloorNav(root) {
  const aside = root;
  aside.setAttribute('aria-label', 'Floor index');

  const imgWrap = document.createElement('div');
  imgWrap.className = 'floor-index__image';
  const svg = select(imgWrap)
    .append('svg')
    .attr('viewBox', `0 0 ${FACTORY_IMG.w} ${FACTORY_IMG.h}`)
    .attr('role', 'img')
    .attr('aria-label', 'Exploded view of the four-floor factory building');
  svg.append('image').attr('href', factoryUrl).attr('width', FACTORY_IMG.w).attr('height', FACTORY_IMG.h);
  aside.append(imgWrap);

  const nav = document.createElement('div');
  nav.className = 'floor-nav';
  for (const floorId of ['4F', '3F', '2F', '1F']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'floor-nav__item';
    btn.textContent = floorId;
    if (floorId === '1F') {
      btn.classList.add('floor-nav__item--active');
      btn.setAttribute('aria-current', 'true');
      btn.title = 'This page — the assembly-line floor';
    } else {
      btn.disabled = true;
      btn.title = 'Not part of this page';
    }
    nav.append(btn);
  }
  aside.append(nav);

  return aside;
}
