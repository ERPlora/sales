// 🔴 REGRESIÓN de sales#267 — un SERVICIO de precio no cerrado dejó de poder cobrarse en cuanto el
// negocio definió sus propios departamentos.
//
// Qué pasaba. services#12 abre la hoja de precio libre con la categoría fiscal del servicio ya
// elegida: `openOpenPrice({ amountCents, deptKey: p.tax_category_key })`. Hasta sales#267 eso
// funcionaba porque `openDept` GUARDABA una categoría fiscal. Con departamentos propios `openDept`
// guarda el **id del departamento**, así que la semilla —una categoría— no casa con ningún botón:
//
//   1. la hoja se abre **sin departamento marcado**, pero
//   2. el botón de añadir sale **habilitado**, porque solo mira que `openDept` no esté vacío, y
//   3. al tocarlo, `addOpenPrice` no encuentra el departamento y **se va en silencio**.
//
// Ni línea, ni error, ni aviso. Es exactamente el fallo mudo contra el que avisa el comentario de
// `addProduct` tres líneas más arriba de la semilla: «con no line, no error and no log, a cashier
// has no way to tell those two apart».
//
// Solo muerde a los hubs que definen departamentos —hoy ninguno—, pero son precisamente los que la
// funcionalidad busca, y las plantillas de sector los van a traer dentro.
import { beforeEach, describe, expect, it } from 'vitest';
import { installPosDouble } from '../../test/pos-double';

const RULES = [
  { id: 'r-21', tax_category_key: 'service.generic', rate_pct: 21, parent_id: null, is_active: 1 },
  { id: 'r-0', tax_category_key: 'service.education', rate_pct: 0, parent_id: null, is_active: 1 },
];
const TAX_CATS = [
  { key: 'service.generic', name: 'Servicio — general', is_active: 1 },
  { key: 'service.education', name: 'Servicio — enseñanza', is_active: 1 },
];

/** Lo que traería la plantilla de un centro de estudios. */
const DEPARTMENTS = [
  { id: 'd-clases', name: 'Clases sueltas', tax_category_key: 'service.education', sort_order: 1 },
  { id: 'd-otros', name: 'Otros servicios', tax_category_key: 'service.generic', sort_order: 2 },
];

const SERVICES = [
  { id: 's-particular', name: 'Clase particular', price: 2500, pricing_type: 'from',
    tax_category_key: 'service.education', status: 'active' },
];

let commands: { name: string; params: Record<string, unknown> }[] = [];

function install(departments: unknown[]) {
  commands = [];
  installPosDouble({
    rules: RULES,
    taxCategories: TAX_CATS,
    departments,
    services: SERVICES,
    serviceCategories: [],
    settings: { sync_services: 1, sync_products: 0 },
    command: async (name: string, params: Record<string, unknown>) => {
      commands.push({ name, params });
      return { rows: [{ id: `row-${commands.length}` }] };
    },
  });
}

interface Pos {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<unknown>;
  openPriceOpen: boolean;
  openDept: string;
  openAmount: string;
  addOpenPrice(): Promise<void>;
}

async function mount(): Promise<Pos> {
  document.body.innerHTML = '';
  await import('./erp-pos-touch');
  const el = document.createElement('erp-pos-touch');
  document.body.appendChild(el);
  await (el as unknown as Pos).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as Pos).updateComplete;
  return el as unknown as Pos;
}

/** Toca la baldosa del servicio, que es lo que abre la hoja con la semilla — por la interfaz, como
 *  el cajero, y no llamando al método: así el test no puede pasar si la baldosa deja de existir. */
async function tapService(el: Pos) {
  const found = [...el.shadowRoot.querySelectorAll<HTMLElement>('ion-card.tile')]
    .find((t) => t.querySelector('.n')?.textContent?.trim() === 'Clase particular');
  if (!found) throw new Error('no hay baldosa para «Clase particular»');
  found.click();
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
}

const addLines = () => commands.filter((c) => c.name === 'sales.order.add_open_line');

beforeEach(() => { document.body.innerHTML = ''; });

describe('un servicio de precio abierto, con departamentos definidos', () => {
  it('abre la hoja con el departamento que COBRA su categoría fiscal ya elegido', async () => {
    install(DEPARTMENTS);
    const el = await mount();
    await tapService(el);

    expect(el.openPriceOpen, 'la hoja se abre').toBe(true);
    expect(el.openDept, 'preseleccionado el departamento, no la categoría fiscal').toBe('d-clases');
  });

  it('🔴 y al confirmar AÑADE la línea — no se va en silencio', async () => {
    install(DEPARTMENTS);
    const el = await mount();
    await tapService(el);
    el.openAmount = '30';
    await el.addOpenPrice();
    await el.updateComplete;

    expect(addLines(), 'la venta tiene que entrar').toHaveLength(1);
    expect(addLines()[0].params).toMatchObject({
      unit_price: 3000,
      tax_category_key: 'service.education',
      product_name: 'Clases sueltas',
    });
  });

  it('si NINGÚN departamento cobra esa categoría, no preselecciona nada', async () => {
    // Preseleccionar «el primero» sería peor que no preseleccionar: cobraría un IVA que nadie
    // eligió. Sin selección, el botón de añadir queda deshabilitado y el cajero elige.
    install([{ id: 'd-solo', name: 'Droguería', tax_category_key: 'product.generic', sort_order: 1 }]);
    const el = await mount();
    await tapService(el);

    expect(el.openPriceOpen, 'la hoja se abre igual: el cajero puede elegir').toBe(true);
    expect(el.openDept, 'sin departamento que cobre lo suyo, no se inventa uno').toBe('');
  });

  it('el botón de añadir NO se ofrece si el departamento elegido no existe', async () => {
    // La guarda miraba solo que `openDept` no estuviera vacío, y por eso el botón salía habilitado
    // con una semilla que no casaba. Ahora mira que RESUELVA.
    install(DEPARTMENTS);
    const el = await mount();
    await tapService(el);
    el.openDept = 'service.education'; // la forma vieja: una categoría fiscal
    el.openAmount = '30';
    await el.updateComplete;

    const add = el.shadowRoot.querySelector<HTMLButtonElement>('[data-testid="pos-open-price-add"]');
    expect(add, 'el botón existe').toBeTruthy();
    expect(add!.hasAttribute('disabled'), 'y está deshabilitado, no mudo').toBe(true);
  });
});

describe('sin departamentos definidos, el camino de siempre sigue intacto', () => {
  it('preselecciona la CATEGORÍA FISCAL del servicio y cobra', async () => {
    install([]);
    const el = await mount();
    await tapService(el);

    expect(el.openDept, 'en el respaldo la clave ES la categoría fiscal').toBe('service.education');

    el.openAmount = '30';
    await el.addOpenPrice();
    await el.updateComplete;

    expect(addLines()).toHaveLength(1);
    expect(addLines()[0].params).toMatchObject({ unit_price: 3000, tax_category_key: 'service.education' });
  });
});
