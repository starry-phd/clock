-- Rename Clock-owned configuration to the single-dot Starry ID task format.
-- Task names must match /^[a-z][a-z0-9-]{1,31}\.[a-z][a-z0-9_-]{1,31}$/.
-- Only Clock DB changes; never write to Starry ID tables.
UPDATE clock_pricing
SET feature='clock.preset_create',version=version+1,changed_at=unixepoch()
WHERE feature='clock.preset.create'
 AND NOT EXISTS(SELECT 1 FROM clock_pricing WHERE feature='clock.preset_create');

UPDATE clock_pricing_audit
SET feature='clock.preset_create'
WHERE feature='clock.preset.create';
