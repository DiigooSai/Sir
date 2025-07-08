import { Model, model, models } from 'mongoose';
import mongoose from 'mongoose';
import { deleteDependencyConfig } from '../configs/delete-dependency-config';

export const performSoftDelete = async (modelInstance: Model<any>, _id: string, config: { prevent?: any[]; cascade?: any[] } = {}) => {
  // Validate the provided ObjectId
  if (!mongoose.isValidObjectId(_id)) {
    throw new Error(`Invalid ObjectId: ${_id}`);
  }

  // Fetch the document by ID
  const document = await modelInstance.findById(_id);

  // Handle cases where the document is not found
  if (!document) {
    throw new Error(`${modelInstance.modelName} with id ${_id} not found`);
  }

  // Handle cases where the document is already archived
  if (document.archivedAt) {
    throw new Error(`${modelInstance.modelName} with id ${_id} is already deleted`);
  }

  // If no dependencies specified, just archive the document
  if (!config || (!config.prevent && !config.cascade)) {
    document.archivedAt = new Date();
    await document.save();
    return document;
  }

  // Handle prevent dependencies
  if (config.prevent) {
    for (const dependency of config.prevent) {
      if (!models[dependency.model]) {
        console.warn(`Model "${dependency.model}" is not registered. Skipping dependency check.`);
        continue; // Skip if the model is not registered
      }

      const dependentModel = model(dependency.model);
      const count = await dependentModel.countDocuments({
        [dependency.field]: _id,
        archivedAt: null, // Exclude archived dependencies
      });

      if (count > 0) {
        throw new Error(`Cannot delete ${modelInstance.modelName} with id ${_id} due to dependent ${dependency.model} records.`);
      }
    }
  }

  // Handle cascade dependencies
  if (config.cascade) {
    for (const dependency of config.cascade) {
      if (!models[dependency.model]) {
        console.warn(`Model "${dependency.model}" is not registered. Skipping cascade operation.`);
        continue; // Skip if the model is not registered
      }

      const dependentModel = model(dependency.model);
      const relatedDocuments = await dependentModel.find({
        [dependency.field]: _id,
        archivedAt: null, // Exclude archived dependencies
      });

      for (const doc of relatedDocuments) {
        await dependentModel.softDelete(doc._id); // Recursive soft delete
      }
    }
  }

  // Finally, archive the current document
  document.archivedAt = new Date();
  await document.save();

  return document;
};

// Export a utility to generate a soft delete method for a model
export const generateSoftDelete = (modelName: string) => {
  return async function (this: Model<any>, _id: string, options: { session?: any } = {}) {
    const config = deleteDependencyConfig[modelName];
    return performSoftDelete(this, _id, config);
  };
};
