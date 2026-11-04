function record(ctx, action, entity, entityId, detail = '') {
  ctx.store.insert('audit_log', {
    at: ctx.now(),
    actor: ctx.actor,
    action,
    entity,
    entity_id: entityId ?? null,
    detail: String(detail).slice(0, 500)
  });
}

function recent(store, { limit = 200 } = {}) {
  return store.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', limit);
}

module.exports = { record, recent };
