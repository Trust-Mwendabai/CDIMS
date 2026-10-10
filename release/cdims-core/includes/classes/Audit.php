<?php
/**
 * Audit trail: who did what, when. Entries are append-only.
 */
class Audit
{
    public static function log(?array $user, string $action, string $entity, $entityId = null, $detail = null): void
    {
        try {
            getDBConnection()->prepare(
                'INSERT INTO audit_log (user_id, username, action, entity, entity_id, detail, ip_address) VALUES (?,?,?,?,?,?,?)'
            )->execute([
                $user['id'] ?? null,
                $user['username'] ?? null,
                $action,
                $entity,
                $entityId === null ? null : (string) $entityId,
                $detail === null ? null : (is_string($detail) ? $detail : json_encode($detail, JSON_UNESCAPED_UNICODE)),
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
        } catch (Throwable $e) {
            error_log('Audit log failed: ' . $e->getMessage()); // never block the user's action
        }
    }

    /** History of one entity (e.g. a station's changes), newest first. */
    public static function forEntity(string $entity, string $id, int $limit = 50): array
    {
        $stmt = getDBConnection()->prepare(
            'SELECT username, action, detail, created_at FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT ' . max(1, min($limit, 200))
        );
        $stmt->execute([$entity, $id]);
        return $stmt->fetchAll();
    }

    public static function recent(int $limit = 200, ?string $entity = null): array
    {
        $limit = max(1, min($limit, 500));
        $sql = 'SELECT id, username, action, entity, entity_id, detail, ip_address, created_at FROM audit_log'
            . ($entity ? ' WHERE entity = ?' : '') . " ORDER BY id DESC LIMIT $limit";
        $stmt = getDBConnection()->prepare($sql);
        $stmt->execute($entity ? [$entity] : []);
        return $stmt->fetchAll();
    }
}
