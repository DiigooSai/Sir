import * as mongoose from 'mongoose';

const connectDB = async () => {
  console.log('connecting to MongoDB URI:', process.env.MONGO_URI);
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI!, {
      autoIndex: true,
      // bail out after 5s if no server found
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 10_000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (err: any) {
    console.error('❌ Error connecting to MongoDB:', err.message);
    process.exit(1);
  }
};

export default connectDB;
