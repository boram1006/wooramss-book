-- Restores only the production expression-log changes made by taxonomy sync v2.
-- The backup table was created immediately before the sync and contains 1,490 rows.
begin;

update public.unclassified_theme_logs as logs
set status = backup.status,
    mapped_theme = backup.mapped_theme,
    mapped_themes = backup.mapped_themes,
    resolution_scope = backup.resolution_scope,
    resolution_v2 = backup.resolution_v2,
    resolved_at = backup.resolved_at
from public.taxonomy_expression_logs_backup_20260914 as backup
where logs.id = backup.id;

delete from public.taxonomy_review_residuals_v2
where taxonomy_version = '2.0-draft.3';

commit;
