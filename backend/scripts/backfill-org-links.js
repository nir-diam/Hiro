const { connectDb, sequelize } = require('../src/config/db');

(async () => {
    await connectDb();
    try {
        await sequelize.query(`
            INSERT INTO client_organization_links (id, client_id, organization_id, is_primary)
            SELECT gen_random_uuid(), c.id, (c.metadata->>'organizationId')::uuid, true
            FROM clients c
            WHERE c.metadata->>'organizationId' IS NOT NULL
              AND (c.metadata->>'organizationId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND NOT EXISTS (
                  SELECT 1 FROM client_organization_links l
                  WHERE l.client_id = c.id AND l.organization_id = (c.metadata->>'organizationId')::uuid
              )
        `);
        console.log('backfill done');
    } catch (e) {
        console.error('backfill err', e.message);
    }
    const [rows] = await sequelize.query('SELECT * FROM client_organization_links');
    console.log(rows);
    process.exit(0);
})();
