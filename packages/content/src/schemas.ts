/** Los esquemas JSON de las tablas, importados para validar en cualquier entorno (Node o navegador). */

import common from '../schemas/common.schema.json' with { type: 'json' };
import scenes from '../schemas/scenes.schema.json' with { type: 'json' };
import archetypes from '../schemas/archetypes.schema.json' with { type: 'json' };
import templates from '../schemas/templates.schema.json' with { type: 'json' };
import elements from '../schemas/elements.schema.json' with { type: 'json' };
import mobiles from '../schemas/mobiles.schema.json' with { type: 'json' };
import terrains from '../schemas/terrains.schema.json' with { type: 'json' };
import actions from '../schemas/actions.schema.json' with { type: 'json' };

export const schemas = {
  common,
  scenes,
  archetypes,
  templates,
  elements,
  mobiles,
  terrains,
  actions,
} as const;
