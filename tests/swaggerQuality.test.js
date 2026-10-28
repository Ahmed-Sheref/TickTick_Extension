import test from 'node:test';
import assert from 'node:assert/strict';
import spec from '../swagger/UI/swagger-ui.js';
import
{
    contentDestinations
}
from '../validators/contentDestinations.js';

test('Swagger references and security schemes resolve', () =>
{
    function visit(value)
    {
        if (!value || typeof value !== 'object') return;
        if (value.$ref?.startsWith('#/'))
        {
            let target = spec;
            for (const key of value.$ref.slice(2).split('/')) target = target?.[key];
            assert.ok(target, value.$ref);
        }
        for (const requirement of value.security || [])
            for (const name of Object.keys(requirement)) assert.ok(spec.components.securitySchemes[name], name);
        for (const child of Object.values(value)) visit(child);
    }
    visit(spec);
});

test('Four documented destination combinations pass actual normalization', () =>
{
    const examples = spec.paths['/api/v1/content'].post.requestBody.content['application/json'].examples;
    assert.equal(Object.keys(examples).length, 4);
    for (const
        {
            value
        }
        of Object.values(examples)) assert.doesNotThrow(() => contentDestinations(value));
});
import
{
    readFile
}
from 'node:fs/promises';
import express from 'express';
import
{
    setupSwagger
}
from '../swagger/UI/swagger-ui.js';

test('Mounted router methods match documented API operations', async () =>
{
    const routers = {
        'Routes/contentRoute.js': '/api/v1/content',
        'Routes/googleAuthRoute.js': '/api/v1/auth/google',
        'Routes/ticktickRoute.js': '/api/v1/ticktick',
        'Routes/ticktickLinkRoute.js': '/api/v1/integrations/ticktick',
        'Routes/notionLinkRoute.js': '/api/v1/integrations/notion',
        'Routes/notionContentRoute.js': '/api/v1/integrations/notion',
        'Routes/userRoute.js': '/api/v1/User',
        'Routes/telegramRoute.js': '/api/v1/telegram'
    };
    const actual = new Set(['post /api/v1/content']);
    const index = await readFile(new URL('../index.js', import.meta.url), 'utf8');
    for (const [file, prefix] of Object.entries(routers))
    {
        assert.ok(index.includes(prefix), prefix);
        const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
        for (const match of source.matchAll(/router\.(get|post|put|delete)\(\s*["']([^"']+)["']/g))
        {
            const route = (prefix + (match[2] === '/' ? '' : match[2])).replace(/:([A-Za-z]+)/g, '{$1}');
            actual.add(`${match[1]} ${route}`);
        }
    }
    const documented = new Set();
    for (const [route, operations] of Object.entries(spec.paths))
    {
        for (const [method, operation] of Object.entries(operations))
        {
            documented.add(`${method} ${route}`);
            for (const name of [...route.matchAll(/\{([^}]+)\}/g)].map(match => match[1]))
                assert.ok(operation.parameters?.some(p => p.in === 'path' && p.name === name && p.required), `${route}: ${name}`);
        }
    }
    assert.deepEqual([...documented].sort(), [...actual].sort());
});

test('Swagger HTTP endpoints serve the maintained contract without database startup', async () =>
{
    const app = express();
    setupSwagger(app);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try
    {
        const root = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(`${root}/api-docs.json`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(spec)));
        assert.equal((await fetch(`${root}/api-docs/health`)).status, 200);
        assert.equal((await fetch(`${root}/api-docs/`)).status, 200);
    }
    finally
    {
        await new Promise(resolve => server.close(resolve));
    }
});
