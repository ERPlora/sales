// Una venta cobrada NO se edita: se anula.
//
// El módulo ya lo cumple de hecho — hay `sales.void` y no existe ningún `sales.update`— y
// ADR-0331 nombra `sales.void` como uno de sus dos ejemplos canónicos de `correct_with`. Lo que
// faltaba era DECLARARLO en el bloque `records`, que es donde el core puede leerlo.
//
// Sin la declaración el asistente no tiene la regla y, preguntado por lo que no puede hacer, se
// inventa una (ERPlora/hub#1042). El vocabulario de `reason` es cerrado exactamente para que
// pueda explicarla en lugar de improvisarla.
//
// Se declara SOLO la venta. La comanda abierta (`order`) se edita mientras está abierta, pero un
// registro mutable no aporta nada aquí: su tool de edición ya está en la mesa, y declararlo
// obligaría a fijar un contrato de `patch` que este módulo no tiene todavía.
import { describe, expect, it } from 'vitest';
import manifest from '../../module.json';

type RecordDef = { mutable: boolean; reason?: string; correct_with?: string[]; update?: string };
const m = manifest as unknown as {
  records?: Record<string, RecordDef>;
  commands: Record<string, unknown>;
};

describe('la venta se declara inmutable, y nombra su puerta de corrección', () => {
  it('declara el registro `sale` como no editable', () => {
    expect(m.records?.sale?.mutable).toBe(false);
  });

  it('da el motivo con el vocabulario CERRADO de ADR-0331', () => {
    expect(['fiscal', 'ledger', 'identity', 'audit']).toContain(m.records?.sale?.reason);
  });

  it('apunta a una anulación que existe de verdad y es PÚBLICA', () => {
    expect(m.records?.sale?.correct_with).toContain('sales.void');
    for (const cmd of m.records?.sale?.correct_with ?? []) {
      expect(Object.keys(m.commands)).toContain(cmd);
      // Y nunca un command interno: apuntar al `_void_sale` mandaría al asistente contra una
      // puerta que el dispatcher le cierra, que es una corrección inservible.
      expect(cmd.split('.').pop()!.startsWith('_')).toBe(false);
    }
  });

  it('no declara un `update`, porque una venta cerrada no lo tiene', () => {
    expect(m.records?.sale?.update).toBeUndefined();
    expect(Object.keys(m.commands)).not.toContain('sales.update');
  });
});
