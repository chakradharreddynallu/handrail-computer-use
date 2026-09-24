import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {capability} from './helpers.js';

test('portable schemas accept saved capability/results and reject secret-bearing extras',()=>{
 const ajv=new Ajv2020({strict:false});
 const schema=JSON.parse(readFileSync(new URL('../schemas/capability.schema.json',import.meta.url)));
 ajv.addSchema(schema,'capability.schema.json');
 const validate=ajv.getSchema('capability.schema.json');
 assert.equal(validate(capability()),true,JSON.stringify(validate.errors));
 const bad=capability();bad.steps[0].value='secret';assert.equal(validate(bad),false);
 const result=ajv.compile(JSON.parse(readFileSync(new URL('../schemas/result.schema.json',import.meta.url))));
 assert.equal(result({status:'success',step:6,outputs:{balance:'1234.56',currency:'USD'}}),true,JSON.stringify(result.errors));
 assert.equal(result({status:'business_outcome',code:'member_not_found',step:2}),true);
 assert.equal(result({status:'success',step:6,outputs:{balance:1234.56,currency:'USD'}}),false);
});
