import mongoose, { type ClientSession } from 'mongoose';

type TransactionCallback<T = void> = (session: ClientSession) => Promise<T>;

export const runInTransaction = async <T = void>(callback: TransactionCallback<T>): Promise<T | void> => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await callback(session); // Callback can return data
    await session.commitTransaction();
    return result; // Return the result of the callback
  } catch (error) {
    await session.abortTransaction();
    console.error(error);
    throw error;
  } finally {
    session.endSession();
  }
};
