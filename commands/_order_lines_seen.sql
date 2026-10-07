-- sales#546 -- «does this sale charge EVERY line still due on the check it closes?», asked AFTER
-- `sales._order_lock` queued the checkout on the check (so the snapshot is fresh). Internal: the
-- only statement of `sales._order_lines_seen`, emitted only by a checkout that CLOSES the check
-- (not by a partial charge, which leaves the rest open on purpose).
--
-- The checkout reads the check's lines BEFORE its transaction. A line added, born from splitting
-- another, or moved in by joining a table between that read and the checkout's writes was not in
-- the sale, and closing the check left it unpaid for ever. `:line_ids` (a JSON array) is every row
-- the sale charges; one live, unpaid row of the check outside it matches no row here, and the
-- command's `expect_rows` answers `sales.order_changed`: nothing is charged. Scoped to the check
-- and its hub, like every read of the check: a row of another check or of the neighbour hub with
-- the same id never counts.
SELECT 1 AS clean
 WHERE NOT EXISTS (
       SELECT 1
         FROM sales_order_item i
        WHERE i.order_id = :order_id
          AND i.hub_id = :hub_id
          AND i.is_deleted = 0
          AND i.sale_id IS NULL
          AND i.id NOT IN (
              SELECT jsonb_array_elements_text(CAST(COALESCE(CAST(:line_ids AS TEXT), '[]') AS jsonb))
          )
       );
