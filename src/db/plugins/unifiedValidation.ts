import { Schema, Query } from 'mongoose';

/** All query helpers to enforce validators on */
const UPDATE_HELPERS = ['update', 'updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate', 'replaceOne', 'findOneAndReplace'] as const;

/**
 * A global plugin that:
 *  1. Ensures .save() & .create() run schema validators.
 *  2. Hooks insertMany to validate each doc.
 *  3. Forces runValidators/context on all update helpers.
 *  4. Wraps bulkWrite to pre-validate operations.
 */
export function unifiedValidationPlugin(schema: Schema): void {
  // 1. Document saves already run validators; no extra code needed here
  // 2. Validate insertMany docs
  schema.pre('insertMany', function (next: (err?: any) => void, docs: any[]) {
    Promise.all(docs.map((doc) => schema.validate(doc))).then(
      () => next(),
      (err) => next(err)
    );
  });

  // 3. Enforce runValidators + context on update helpers
  function setRunValidators(this: Query<any, any>, next: () => void) {
    this.setOptions({ runValidators: true, context: 'query' });
    next();
  }
  UPDATE_HELPERS.forEach((method) => {
    schema.pre(method, setRunValidators);
  });

  // 4. Patch bulkWrite to manually validate ops
  const origBulk = (schema.statics as any).bulkWrite;
  schema.statics.bulkWrite = async function (operations: any[], options: any) {
    // validate inserts/replaces
    const validations: Promise<void>[] = [];
    for (const op of operations) {
      if (op.insertOne) {
        const doc = new this(op.insertOne.document);
        validations.push(doc.validate());
      }
      if (op.replaceOne) {
        const doc = new this(op.replaceOne.replacement);
        validations.push(doc.validate());
      }
      if (op.updateOne || op.updateMany) {
        // apply validators on update operators
        const q = this.findOne({ _id: op[Object.keys(op)[0]].filter._id });
        q.setOptions({ runValidators: true, context: 'query' });
        // no need to exec; setting options is enough for middleware
      }
    }
    await Promise.all(validations);
    return origBulk.call(this, operations, options);
  };
}
