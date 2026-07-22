export interface AuditFields {
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface UpdateAuditFields {
  updatedBy: number | null;
  updatedAt: number;
}

export function createAuditFields(userId: number, now?: number): AuditFields {
  const ts = now ?? Math.floor(Date.now() / 1000);
  return { createdBy: userId, updatedBy: userId, createdAt: ts, updatedAt: ts };
}

export function updateAuditFields(userId: number, now?: number): UpdateAuditFields {
  const ts = now ?? Math.floor(Date.now() / 1000);
  return { updatedBy: userId, updatedAt: ts };
}
