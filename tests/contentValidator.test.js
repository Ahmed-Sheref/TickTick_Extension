import test from 'node:test';
import assert from 'node:assert/strict';

import { validateContentInput } from '../validators/contentValidator.js';

test('validateContentInput returns null for valid content', () => 
{
    const result = validateContentInput(
    {
        userId: 'user123',
        title: 'Node.js Article',
        rawText: 'This is a valid article'
    });

    assert.equal(result, null);
});