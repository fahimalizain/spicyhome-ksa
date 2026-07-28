-- Custom migration: order_events immutability triggers
-- Immutable order_events: prevent UPDATE and DELETE via triggers
CREATE TRIGGER order_events_no_update
BEFORE UPDATE ON order_events
BEGIN
  SELECT RAISE(FAIL, 'UPDATE not allowed on order_events');
END;
--> statement-breakpoint
CREATE TRIGGER order_events_no_delete
BEFORE DELETE ON order_events
BEGIN
  SELECT RAISE(FAIL, 'DELETE not allowed on order_events');
END;
