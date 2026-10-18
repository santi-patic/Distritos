/** Las tablas del juego, importadas como JSON: el cliente las empaqueta y el servidor las recarga. */

import type { RawTables } from './raw.js';
import scenes from '../tables/scenes.json' with { type: 'json' };
import archetypes from '../tables/archetypes.json' with { type: 'json' };
import templates from '../tables/templates.json' with { type: 'json' };
import elements from '../tables/elements.json' with { type: 'json' };
import mobiles from '../tables/mobiles.json' with { type: 'json' };
import terrains from '../tables/terrains.json' with { type: 'json' };
import actions from '../tables/actions.json' with { type: 'json' };
import resources from '../tables/resources.json' with { type: 'json' };
import tasks from '../tables/tasks.json' with { type: 'json' };
import builds from '../tables/builds.json' with { type: 'json' };
import links from '../tables/links.json' with { type: 'json' };
import hires from '../tables/hires.json' with { type: 'json' };
import board from '../tables/board.json' with { type: 'json' };
import places from '../tables/places.json' with { type: 'json' };
import recados from '../tables/recados.json' with { type: 'json' };

export const tables: RawTables = {
  scenes: scenes as RawTables['scenes'],
  archetypes: archetypes,
  templates: templates as RawTables['templates'],
  elements: elements as RawTables['elements'],
  mobiles: mobiles,
  terrains: terrains as RawTables['terrains'],
  actions: actions,
  resources: resources,
  tasks: tasks as RawTables['tasks'],
  builds: builds,
  links: links,
  hires: hires,
  board: board,
  places: places,
  recados: recados,
};
