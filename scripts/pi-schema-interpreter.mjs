// MV3 forbids TypeBox's generated Function validators. Use its interpreter.
import { Value } from 'typebox/value';
export function Compile(schema) {
  return {
    Check: value => Value.Check(schema, value),
    Errors: value => Value.Errors(schema, value)
  };
}
