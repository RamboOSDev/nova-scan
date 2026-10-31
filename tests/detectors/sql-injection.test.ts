import { describe, it, expect } from 'vitest';
import { analyzeSqlInjection } from '../../src/detectors/sql-injection';

const hit = (src: string) => analyzeSqlInjection('api.ts', src);

describe('sql-injection — true positives', () => {
  it('template literal with req.query', () =>
    expect(hit('await db.query(`SELECT * FROM users WHERE id = ${req.query.id}`);')).toHaveLength(1));
  it('concatenation with req.body', () =>
    expect(hit('pool.query("SELECT * FROM users WHERE email = \'" + req.body.email + "\'");')).toHaveLength(1));
  it('tainted variable via destructuring', () =>
    expect(hit('const { name } = req.params;\nconnection.execute(`DELETE FROM items WHERE name = ${name}`);')).toHaveLength(1));
  it('SQL built in a variable then executed', () =>
    expect(hit('const id = req.query.id;\nconst sql = "SELECT * FROM t WHERE id=" + id;\nawait db.query(sql);')).toHaveLength(1));
  it('prisma $queryRawUnsafe', () =>
    expect(hit('await prisma.$queryRawUnsafe(`SELECT * FROM u WHERE n = ${req.body.n}`);')).toHaveLength(1));
  it('next.js searchParams', () =>
    expect(hit('await sequelize.query(`SELECT * FROM p WHERE q = \'${searchParams.get("q")}\'`);')).toHaveLength(1));
});

describe('sql-injection — safe code', () => {
  it('parameterized placeholder', () =>
    expect(hit('await db.query("SELECT * FROM users WHERE id = $1", [req.query.id]);')).toHaveLength(0));
  it('prisma tagged $queryRaw', () =>
    expect(hit('await prisma.$queryRaw`SELECT * FROM u WHERE id = ${req.query.id}`;')).toHaveLength(0));
  it('sql tagged template', () =>
    expect(hit('await db.query(sql`SELECT * FROM u WHERE id = ${req.params.id}`);')).toHaveLength(0));
  it('constant interpolation without request input', () =>
    expect(hit('const TABLE = "users";\nawait db.query(`SELECT * FROM ${TABLE}`);')).toHaveLength(0));
  it('comment ignored', () =>
    expect(hit('// db.query(`SELECT * FROM u WHERE id = ${req.query.id}`)')).toHaveLength(0));
});
