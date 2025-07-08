import mongoose, { Schema, Document, model as mongooseModel, Model } from 'mongoose';
import { generateSoftDelete } from './delete-logic';
import { unifiedValidationPlugin } from '../plugins/unifiedValidation';

mongoose.plugin(unifiedValidationPlugin);

// Define base schema fields
const baseSchemaFields = {
  archivedAt: { type: Date, default: null },
};

const baseSchemaOptions = {
  timestamps: true,
};

// Unified IBaseDocument type
export type IBaseDocument = Document & {
  softDelete(): Promise<void>;
};

// Utility to extract uniqueCombination fields
function extractUniqueCombinationFields(schemaDefinition: Record<string, any>) {
  return Object.entries(schemaDefinition)
    .filter(([, field]) => field.uniqueCombination)
    .map(([key]) => key);
}

// Generic `preFindOneAndUpdate` Hook
async function preFindOneAndUpdateHook(this: any, next: any) {
  const query = this.getQuery();
  const update = this.getUpdate();
  const model = this.model;
  const session = this.options?.session; // Access transaction session

  const document = await model.findOne({ _id: query._id }).session(session);
  if (document?.archivedAt) {
    return next(new Error('Cannot update an archived document.'));
  }

  if (update?.$set?.archivedAt || update?.archivedAt) {
    return next(new Error('Direct updates to the "archivedAt" field are not allowed.'));
  }

  next();
}

// Utility to create schema with shared logic
export function createSchema<T>(schemaDefinition: Record<string, any>, options = {}) {
  const uniqueCombinationFields = extractUniqueCombinationFields(schemaDefinition);

  const schema = new Schema<T>(
    {
      ...schemaDefinition,
      ...baseSchemaFields,
    },
    {
      ...baseSchemaOptions,
      ...options,
    }
  );

  // Unique Combination Validation in Pre-Save Hook
  schema.pre('save', async function (next) {
    const session = this.$session(); // Access transaction session
    if (uniqueCombinationFields.length > 0) {
      const query = uniqueCombinationFields.reduce((acc, field) => {
        acc[field] = this[field];
        return acc;
      }, {} as Record<string, any>);

      // Check if referenced documents exist within the transaction
      await Promise.all(
        uniqueCombinationFields.map(async (field) => {
          const ref = schemaDefinition[field]?.ref;
          if (ref) {
            const model = mongooseModel(ref);
            const relatedDoc = await model.findOne({ _id: this[field] }).session(session);
            if (!relatedDoc) {
              throw new Error(`The referenced document for field "${field}" in model "${ref}" does not exist.`);
            }
            if (relatedDoc.archivedAt) {
              throw new Error(`The referenced document for field "${field}" in model "${ref}" is archived.`);
            }
          }
        })
      );

      // Check for unique combination within the transaction
      const existingDocument = await this.constructor.findOne({ ...query, _id: { $ne: this._id } }).session(session);

      if (existingDocument) {
        if (existingDocument.archivedAt) {
          await this.constructor.deleteOne({ _id: existingDocument._id }).session(session);
        } else {
          const conflictingFields = uniqueCombinationFields.map((field) => `${field}: ${this[field]}`).join(', ');
          throw new Error(
            `A document in model "${this.constructor.modelName}" with the same unique combination already exists. Conflicting fields: { ${conflictingFields} }`
          );
        }
      }
    }

    next();
  });

  schema.pre('findOneAndUpdate', preFindOneAndUpdateHook);

  return schema;
}

// Generic model creator
export function createModel<T>(name: string, schema: Schema<T>): Model<T> {
  schema.statics.softDelete = generateSoftDelete(name);
  return mongooseModel<T>(name, schema);
}

// Export base schema
export const baseSchema = createSchema(baseSchemaFields);
